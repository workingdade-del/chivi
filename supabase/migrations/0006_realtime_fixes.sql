-- ============================================================
-- Realtime : complète la publication (order_items, drivers,
-- profiles manquaient) et ajoute un canal Broadcast par commande
-- pour que la PWA Client (clé anon, sans accès RLS à `orders`)
-- puisse suivre sa commande en temps réel sans exposer la table.
-- ============================================================

alter publication supabase_realtime add table order_items;
alter publication supabase_realtime add table drivers;
alter publication supabase_realtime add table profiles;

-- Diffuse chaque changement de commande sur un canal Broadcast
-- nommé "order:<id>" — connaître l'UUID de la commande fait déjà
-- office de capacité (même modèle que le lien de confirmation),
-- sans donner à la clé anon un accès SELECT sur toute la table.
create or replace function public.broadcast_order_changes()
returns trigger
language plpgsql
security definer
as $$
begin
  perform realtime.broadcast_changes(
    'order:' || coalesce(new.id, old.id)::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists orders_broadcast_changes on orders;
create trigger orders_broadcast_changes
  after update on orders
  for each row execute function public.broadcast_order_changes();
