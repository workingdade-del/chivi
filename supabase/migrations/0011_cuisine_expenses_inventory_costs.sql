-- Achats structurés : quantité + prix unitaire, en plus du montant total
-- déjà utilisé par les Rapports Admin (colonnes nullables : les dépenses
-- existantes et les catégories "personnel"/"autre" sans quantité naturelle
-- restent valides).
alter table expenses add column quantity numeric;
alter table expenses add column unit_price numeric;

-- Inventaire cuisine : stock des ingrédients/éléments avec seuil d'alerte.
create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quantity numeric not null default 0,
  unit text not null default 'unité',
  alert_threshold numeric not null default 0,
  unit_price numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table inventory_items enable row level security;
create policy "staff manage inventory" on inventory_items
  for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table inventory_items;

-- Coût de production par plat (référence products). total_cost est dérivé
-- automatiquement : jamais désynchronisé de ingredient_cost + packaging_cost.
create table product_costs (
  product_id uuid primary key references products(id) on delete cascade,
  ingredient_cost numeric not null default 0,
  packaging_cost numeric not null default 0,
  total_cost numeric generated always as (ingredient_cost + packaging_cost) stored,
  notes text,
  updated_at timestamptz not null default now()
);

alter table product_costs enable row level security;
create policy "staff manage product costs" on product_costs
  for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table product_costs;
