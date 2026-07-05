-- Active Supabase Realtime (postgres_changes) sur orders, pour le
-- tableau de tickets Cuisine et le suivi de commande côté Admin.
alter publication supabase_realtime add table orders;
