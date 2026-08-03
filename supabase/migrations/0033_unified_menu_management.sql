-- ============================================================
-- Refonte "Gestion Menu unifiée" (Admin) + synchronisation Cuisine.
--
-- Jusqu'ici les catégories de produits étaient un enum figé en dur
-- (CHECK constraint + union TypeScript) — impossible à renommer/
-- créer/supprimer depuis l'admin. On les fait passer dans une vraie
-- table, pour permettre la gestion demandée (ajout/renommage/
-- suppression si vide) sans jamais casser les commandes existantes :
-- products.category référence désormais categories.slug (le slug
-- reste stable, seul le label affiché est renommable).
--
-- "Suppléments" est une catégorie particulière : les suppléments
-- restent dans leur propre table (globale, partagée entre plats —
-- les fusionner dans `products` aurait cassé toute la logique de
-- commande existante : order_supplements, le parsing flou du staff,
-- le Flow WhatsApp...). Le flag is_supplements marque la ligne
-- "Suppléments" comme une catégorie spéciale, gérée par l'UI Gestion
-- Menu comme un onglet listant `supplements` au lieu de `products`,
-- mais renommable/supprimable-si-vide exactement comme les autres.
-- ============================================================

create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  sort_order integer not null default 0,
  is_supplements boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table categories enable row level security;
create policy "public read categories" on categories for select to anon using (true);
create policy "staff manage categories" on categories for all to authenticated using (true) with check (true);

create trigger categories_set_updated_at before update on categories
  for each row execute function set_updated_at();

insert into categories (slug, label, sort_order, is_supplements) values
  ('plats_chivi', 'Menu CHIVI', 0, false),
  ('plats_traditionnels', 'Menu Traditionnel', 1, false),
  ('boissons', 'Boissons', 2, false),
  ('supplements', 'Suppléments', 3, true);

-- products.category devient une vraie FK vers categories.slug — le slug
-- existant ('plats_chivi', etc.) est réutilisé tel quel, aucune donnée
-- produit à migrer.
alter table products drop constraint if exists products_category_check;
alter table products add constraint products_category_fkey
  foreign key (category) references categories(slug);

-- Nouveau champ "Liste des ingrédients" (texte libre) sur la fiche plat.
-- "Notes internes" (jamais visible client) réutilise product_costs.notes,
-- qui existait déjà exactement dans ce rôle (staff-only, lié 1:1 au produit).
alter table products add column if not exists ingredients text;

-- Galerie de photos (en plus de products.image_path qui reste "la photo
-- principale") — alimente la PWA Client, le Flow WhatsApp, et un futur
-- carousel WhatsApp.
create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  image_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index product_images_product_id_idx on product_images(product_id);

alter table product_images enable row level security;
create policy "public read product images" on product_images for select to anon using (true);
create policy "staff manage product images" on product_images for all to authenticated using (true) with check (true);

-- Suppléments applicables à un plat donné (les suppléments restent une
-- liste globale, pas fusionnée dans `products`, pour ne rien casser du
-- parsing/commande existant). Cette table enregistre la sélection faite
-- depuis la fiche plat de l'Admin. NOTE : à ce stade, le Flow WhatsApp et
-- le menu client continuent d'afficher TOUS les suppléments pour chaque
-- plat (comportement inchangé) — cette table est prête mais pas encore
-- consommée par la logique de commande ; brancher ce filtre est un
-- prochain pas volontairement laissé de côté ici pour limiter le risque
-- sur le parcours de commande dans cette même refonte.
create table product_supplements (
  product_id uuid not null references products(id) on delete cascade,
  supplement_id uuid not null references supplements(id) on delete cascade,
  primary key (product_id, supplement_id)
);

alter table product_supplements enable row level security;
create policy "public read product supplements" on product_supplements for select to anon using (true);
create policy "staff manage product supplements" on product_supplements for all to authenticated using (true) with check (true);

-- Le bucket "menu-images" existe déjà (créé manuellement, une photo y est
-- déjà servie) mais n'avait jamais reçu de policy d'écriture — jusqu'ici
-- même le staff authentifié ne pouvait pas y uploader depuis l'app.
-- Mêmes policies que le bucket "driver-photos" (migration 0009).
create policy "staff can upload menu images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'menu-images');

create policy "staff can update menu images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'menu-images');

create policy "staff can delete menu images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'menu-images');
