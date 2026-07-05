-- ============================================================
-- CHIVI — schéma initial
-- Dark kitchen à Cotonou : menu, commandes, cuisine, admin, WhatsApp.
-- À exécuter une seule fois (Supabase SQL Editor ou `supabase db push`).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- profiles : clients auto-créés via WhatsApp
-- ------------------------------------------------------------
create table profiles (
  id uuid primary key default gen_random_uuid(),
  whatsapp_phone text not null unique,
  full_name text,
  zone text,
  address_details text,
  delivery_lat numeric,
  delivery_lng numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- products : plats du menu
-- ------------------------------------------------------------
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null check (category in ('plats_chivi', 'plats_traditionnels', 'boissons')),
  base_price integer not null check (base_price >= 0),
  image_path text,
  is_new boolean not null default false,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- product_variants : variantes de chaque plat (prix absolu, pas un delta)
-- ------------------------------------------------------------
create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  group_label text not null default 'Option',
  name text not null,
  price integer not null check (price >= 0),
  is_available boolean not null default true,
  sort_order integer not null default 0
);

-- ------------------------------------------------------------
-- supplements : frites, alloco, akassa (ajouts multi-sélection)
-- ------------------------------------------------------------
create table supplements (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price integer not null check (price >= 0),
  is_available boolean not null default true,
  sort_order integer not null default 0
);

-- ------------------------------------------------------------
-- delivery_zones : zones et tarifs de livraison
-- ------------------------------------------------------------
create table delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  min_km numeric not null,
  max_km numeric not null,
  fee_min integer not null check (fee_min >= 0),
  fee_max integer not null check (fee_max >= fee_min),
  sort_order integer not null default 0
);

-- ------------------------------------------------------------
-- drivers : livreurs
-- ------------------------------------------------------------
create table drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  status text not null default 'libre' check (status in ('libre', 'en_course')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- orders : commandes
-- ------------------------------------------------------------
create sequence order_number_seq start 2048;

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('CHV-' || nextval('order_number_seq')::text),
  profile_id uuid references profiles(id),
  status text not null default 'recue' check (status in ('recue', 'en_preparation', 'en_route', 'livree', 'annulee')),
  payment_method text not null check (payment_method in ('cash_livraison', 'momo_livraison', 'momo_avance')),
  payment_status text not null default 'en_attente' check (payment_status in ('en_attente', 'paye')),
  subtotal integer not null check (subtotal >= 0),
  delivery_fee integer not null check (delivery_fee >= 0),
  total integer not null check (total >= 0),
  delivery_address text,
  delivery_lat numeric,
  delivery_lng numeric,
  delivery_zone_id uuid references delivery_zones(id),
  client_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_profile_id_idx on orders(profile_id);
create index orders_status_idx on orders(status);
create index orders_created_at_idx on orders(created_at desc);

-- ------------------------------------------------------------
-- order_items : détail des articles commandés (prix figés au moment de la commande)
-- ------------------------------------------------------------
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  product_variant_id uuid references product_variants(id),
  product_name text not null,
  variant_name text,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null default 1 check (quantity > 0),
  line_total integer not null check (line_total >= 0),
  note text
);

create index order_items_order_id_idx on order_items(order_id);

-- ------------------------------------------------------------
-- order_supplements : suppléments ajoutés à une ligne de commande
-- ------------------------------------------------------------
create table order_supplements (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  supplement_id uuid references supplements(id),
  supplement_name text not null,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null default 1 check (quantity > 0)
);

create index order_supplements_order_item_id_idx on order_supplements(order_item_id);

-- ------------------------------------------------------------
-- order_assignments : attribution livreur-commande
-- ------------------------------------------------------------
create table order_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  driver_id uuid not null references drivers(id),
  assigned_at timestamptz not null default now(),
  delivered_at timestamptz,
  status text not null default 'assignee' check (status in ('assignee', 'en_cours', 'livree'))
);

create index order_assignments_order_id_idx on order_assignments(order_id);
create index order_assignments_driver_id_idx on order_assignments(driver_id);

-- ------------------------------------------------------------
-- expenses : dépenses / coûts de production
-- ------------------------------------------------------------
create table expenses (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  category text not null default 'autre' check (category in ('ingredients', 'emballage', 'transport', 'personnel', 'autre')),
  amount integer not null check (amount >= 0),
  expense_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- whatsapp_messages : log des messages WhatsApp
-- ------------------------------------------------------------
create table whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  order_id uuid references orders(id),
  wa_message_id text unique,
  direction text not null check (direction in ('inbound', 'outbound')),
  phone text not null,
  message_type text not null default 'text',
  content text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index whatsapp_messages_profile_id_idx on whatsapp_messages(profile_id);
create index whatsapp_messages_order_id_idx on whatsapp_messages(order_id);

-- ------------------------------------------------------------
-- updated_at triggers
-- ------------------------------------------------------------
create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger products_set_updated_at before update on products
  for each row execute function set_updated_at();
create trigger orders_set_updated_at before update on orders
  for each row execute function set_updated_at();

-- ============================================================
-- Row Level Security
--
-- Le menu (products/variants/supplements/zones) est public en
-- lecture : la PWA Client interroge Supabase directement en anon.
-- Tout le reste (profils, commandes, livreurs, finances, logs
-- WhatsApp) contient des données personnelles ou sensibles et
-- n'est accessible ni en lecture ni en écriture à la clé anon :
--   - les écritures passent par les routes serveur Next.js
--     (service role key, jamais exposée au navigateur) ;
--   - les lectures Cuisine/Admin passent par un compte Supabase
--     Auth "staff" (authenticated), y compris pour le Realtime
--     des tickets cuisine.
-- ============================================================

alter table profiles enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table supplements enable row level security;
alter table delivery_zones enable row level security;
alter table drivers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_supplements enable row level security;
alter table order_assignments enable row level security;
alter table expenses enable row level security;
alter table whatsapp_messages enable row level security;

-- Menu : lecture publique des éléments disponibles
create policy "public read available products" on products
  for select to anon, authenticated using (is_available = true);
create policy "public read variants of available products" on product_variants
  for select to anon, authenticated using (
    is_available = true
    and exists (select 1 from products p where p.id = product_id and p.is_available = true)
  );
create policy "public read available supplements" on supplements
  for select to anon, authenticated using (is_available = true);
create policy "public read delivery zones" on delivery_zones
  for select to anon, authenticated using (true);

-- Staff (authenticated) : lecture/écriture opérationnelle
create policy "staff read profiles" on profiles
  for select to authenticated using (true);
create policy "staff manage products" on products
  for all to authenticated using (true) with check (true);
create policy "staff manage product_variants" on product_variants
  for all to authenticated using (true) with check (true);
create policy "staff manage supplements" on supplements
  for all to authenticated using (true) with check (true);
create policy "staff manage delivery_zones" on delivery_zones
  for all to authenticated using (true) with check (true);
create policy "staff manage drivers" on drivers
  for all to authenticated using (true) with check (true);
create policy "staff read orders" on orders
  for select to authenticated using (true);
create policy "staff update order status" on orders
  for update to authenticated using (true) with check (true);
create policy "staff read order_items" on order_items
  for select to authenticated using (true);
create policy "staff read order_supplements" on order_supplements
  for select to authenticated using (true);
create policy "staff manage order_assignments" on order_assignments
  for all to authenticated using (true) with check (true);
create policy "staff manage expenses" on expenses
  for all to authenticated using (true) with check (true);
create policy "staff read whatsapp_messages" on whatsapp_messages
  for select to authenticated using (true);

-- Aucune policy anon sur profiles / orders / order_items /
-- order_supplements / drivers / order_assignments / expenses /
-- whatsapp_messages : RLS activé + aucune policy = accès refusé
-- par défaut pour la clé anon. Les routes API (service role)
-- contournent RLS et restent le seul chemin d'écriture côté client.
