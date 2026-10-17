-- ============================================================
-- Points de fidélité. Le solde d'un client = SUM(points) de ses
-- transactions, jamais un compteur stocké. Les gains/annulations sont
-- générés par trigger Postgres (même approche que le module Finance) pour
-- couvrir tous les chemins qui passent une commande à "livree".
-- ============================================================

-- Réglages : taux global (0.01 = 1 point par 100 FCFA) + taux spécial optionnel par produit.
alter table system_settings add column if not exists loyalty_points_per_fcfa numeric(10, 4) not null default 0.01 check (loyalty_points_per_fcfa >= 0);
alter table products add column if not exists loyalty_points_per_fcfa numeric(10, 4) check (loyalty_points_per_fcfa >= 0);

create table if not exists loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  -- Nullable : une commande supprimée met order_id à NULL (l'historique de points reste).
  order_id uuid references orders(id) on delete set null,
  points integer not null,
  type text not null check (type in ('gain', 'ajustement', 'annulation')),
  note text,
  created_at timestamptz not null default now(),
  constraint loyalty_adjustment_needs_note check (type <> 'ajustement' or length(trim(coalesce(note, ''))) > 0)
);

create index if not exists loyalty_transactions_profile_id_idx on loyalty_transactions(profile_id);
create index if not exists loyalty_transactions_order_id_idx on loyalty_transactions(order_id);

alter table loyalty_transactions enable row level security;
create policy "staff read loyalty transactions" on loyalty_transactions for select to authenticated using (true);
-- Depuis l'app, seuls les ajustements manuels sont insérables ; gains et
-- annulations passent par les triggers (security definer). Aucun update/delete.
create policy "staff insert loyalty adjustments" on loyalty_transactions for insert to authenticated with check (type = 'ajustement');

-- Points d'une commande : sous-total (hors livraison, déjà net de réduction)
-- × taux moyen pondéré par ligne (taux produit si défini, sinon taux global).
create or replace function loyalty_points_for_order(p_order_id uuid)
returns integer as $$
declare
  default_rate numeric;
  o_subtotal integer;
  weighted numeric;
  lines_total numeric;
begin
  select subtotal into o_subtotal from orders where id = p_order_id;
  if o_subtotal is null then return 0; end if;

  select coalesce((select loyalty_points_per_fcfa from system_settings where id = true), 0.01) into default_rate;

  select sum(oi.line_total * coalesce(p.loyalty_points_per_fcfa, default_rate)), sum(oi.line_total)
    into weighted, lines_total
    from order_items oi
    left join products p on p.id = oi.product_id
    where oi.order_id = p_order_id;

  if lines_total is null or lines_total <= 0 then
    return floor(o_subtotal * default_rate)::integer;
  end if;
  return floor(o_subtotal * (weighted / lines_total))::integer;
end;
$$ language plpgsql security definer;

-- Idempotence : on ne crédite que si le solde de points de CETTE commande est
-- <= 0 (jamais deux crédits) ; une annulation/suppression retire exactement
-- ce qui a été crédité.
create or replace function handle_loyalty_on_order_change()
returns trigger as $$
declare
  net integer;
  pts integer;
begin
  if tg_op = 'DELETE' then
    if old.profile_id is not null then
      select coalesce(sum(points), 0) into net from loyalty_transactions where order_id = old.id;
      if net > 0 then
        insert into loyalty_transactions (profile_id, order_id, points, type, note)
        values (old.profile_id, old.id, -net, 'annulation', 'Commande ' || old.order_number || ' supprimée');
      end if;
    end if;
    return old;
  end if;

  if new.profile_id is null then
    return new;
  end if;

  if new.status = 'livree' and (tg_op = 'INSERT' or old.status is distinct from 'livree') then
    select coalesce(sum(points), 0) into net from loyalty_transactions where order_id = new.id;
    if net <= 0 then
      pts := loyalty_points_for_order(new.id);
      if pts > 0 then
        insert into loyalty_transactions (profile_id, order_id, points, type, note)
        values (new.profile_id, new.id, pts, 'gain', 'Commande ' || new.order_number);
      end if;
    end if;
  elsif new.status = 'annulee' and tg_op = 'UPDATE' and old.status is distinct from 'annulee' then
    select coalesce(sum(points), 0) into net from loyalty_transactions where order_id = new.id;
    if net > 0 then
      insert into loyalty_transactions (profile_id, order_id, points, type, note)
      values (new.profile_id, new.id, -net, 'annulation', 'Commande ' || new.order_number || ' annulée');
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists orders_loyalty_on_status on orders;
create trigger orders_loyalty_on_status
  after insert or update of status on orders
  for each row execute function handle_loyalty_on_order_change();

drop trigger if exists orders_loyalty_on_delete on orders;
create trigger orders_loyalty_on_delete
  before delete on orders
  for each row execute function handle_loyalty_on_order_change();

-- Rattrapage idempotent : commandes déjà livrées sans aucune transaction de points.
insert into loyalty_transactions (profile_id, order_id, points, type, note, created_at)
select o.profile_id, o.id, loyalty_points_for_order(o.id), 'gain', 'Commande ' || o.order_number || ' (rattrapage)', o.created_at
from orders o
where o.status = 'livree'
  and o.profile_id is not null
  and not exists (select 1 from loyalty_transactions lt where lt.order_id = o.id)
  and loyalty_points_for_order(o.id) > 0;
