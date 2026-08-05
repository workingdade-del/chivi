-- ============================================================
-- Module Finance : comptes + transactions, avec génération
-- automatique via triggers Postgres plutôt qu'en interceptant
-- chaque point du code applicatif qui peut faire passer une
-- commande à "livree" (Admin direct, webhook livreur, staff-log,
-- création manuelle) — un trigger sur la table garantit qu'AUCUN
-- chemin ne peut être oublié, contrairement à une logique côté
-- app dupliquée à plusieurs endroits.
-- ============================================================

create table finance_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('ventes', 'dettes', 'personnalise')),
  created_at timestamptz not null default now()
);

alter table finance_accounts enable row level security;
create policy "staff manage finance accounts" on finance_accounts for all to authenticated using (true) with check (true);

create table finance_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references finance_accounts(id) on delete cascade,
  type text not null check (type in ('entree', 'sortie')),
  amount integer not null check (amount >= 0),
  description text,
  category text,
  date date not null default current_date,
  source_type text not null default 'manual' check (source_type in ('order', 'expense', 'manual')),
  -- Référence polymorphe (orders.id ou expenses.id selon source_type) —
  -- pas de contrainte FK stricte possible puisque la cible dépend de
  -- source_type ; source_id reste null pour les transactions manuelles.
  source_id uuid,
  created_by text,
  created_at timestamptz not null default now()
);

create index finance_transactions_account_id_idx on finance_transactions(account_id);
create index finance_transactions_date_idx on finance_transactions(date);
create index finance_transactions_source_idx on finance_transactions(source_type, source_id);

alter table finance_transactions enable row level security;
create policy "staff read finance transactions" on finance_transactions for select to authenticated using (true);
create policy "staff insert finance transactions" on finance_transactions for insert to authenticated with check (true);
create policy "staff update finance transactions" on finance_transactions for update to authenticated using (true) with check (true);
-- Les transactions générées automatiquement (order/expense) suivent le
-- cycle de vie de leur source et ne sont jamais supprimables
-- individuellement depuis Finance — seules les transactions manuelles le
-- sont. Contrainte appliquée au niveau RLS, pas seulement dans l'UI.
create policy "staff delete manual finance transactions" on finance_transactions for delete to authenticated using (source_type = 'manual');

insert into finance_accounts (name, type) values
  ('Ventes', 'ventes'),
  ('Dettes', 'dettes'),
  ('Dépenses', 'personnalise');

-- Commande passée (ou créée directement) au statut "livree" -> entrée sur
-- le compte Ventes. Se déclenche sur INSERT (ex: commande créée déjà
-- livrée via /commande-log ou Admin) et sur UPDATE de status uniquement
-- quand on transitionne VERS "livree" (jamais si elle y était déjà, pour
-- ne pas dupliquer la transaction à chaque autre modification de la
-- commande une fois livrée).
create or replace function create_sales_transaction_on_delivery()
returns trigger as $$
declare
  ventes_account_id uuid;
begin
  if new.status = 'livree' and (tg_op = 'INSERT' or old.status is distinct from 'livree') then
    select id into ventes_account_id from finance_accounts where type = 'ventes' order by created_at asc limit 1;
    if ventes_account_id is not null then
      insert into finance_transactions (account_id, type, amount, description, source_type, source_id, date)
      values (ventes_account_id, 'entree', new.total, 'Commande ' || new.order_number, 'order', new.id, current_date);
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger orders_create_sales_transaction
  after insert or update of status on orders
  for each row execute function create_sales_transaction_on_delivery();

-- Nouvelle dépense -> sortie sur le compte Dépenses.
create or replace function create_expense_transaction()
returns trigger as $$
declare
  depenses_account_id uuid;
begin
  select id into depenses_account_id from finance_accounts where name = 'Dépenses' order by created_at asc limit 1;
  if depenses_account_id is not null then
    insert into finance_transactions (account_id, type, amount, description, category, source_type, source_id, date)
    values (depenses_account_id, 'sortie', new.amount, new.label, new.category, 'expense', new.id, new.expense_date);
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger expenses_create_transaction
  after insert on expenses
  for each row execute function create_expense_transaction();
