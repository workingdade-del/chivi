-- Historique des mouvements de stock (entrées/sorties). Alimenté par un
-- trigger plutôt que par le code applicatif : peu importe quel écran
-- (Cuisine ou Admin) modifie la quantité, le mouvement est tracé.
create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items(id) on delete cascade,
  item_name text not null,
  change_qty numeric not null,
  quantity_after numeric not null,
  created_at timestamptz not null default now()
);

alter table inventory_movements enable row level security;
create policy "staff read inventory movements" on inventory_movements
  for select to authenticated using (true);

create function log_inventory_movement() returns trigger
language plpgsql security definer as $$
begin
  if new.quantity is distinct from old.quantity then
    insert into inventory_movements (item_id, item_name, change_qty, quantity_after)
    values (new.id, new.name, new.quantity - old.quantity, new.quantity);
  end if;
  return new;
end;
$$;

create trigger inventory_items_log_movement
  after update on inventory_items
  for each row execute function log_inventory_movement();

alter publication supabase_realtime add table inventory_movements;
