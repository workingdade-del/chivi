-- ============================================================
-- realtime.messages a RLS activé par défaut mais aucune policy :
-- sans ceci, les diffusions du trigger broadcast_order_changes
-- (migration 0006) ne sont livrées à personne, anon compris.
-- Le nom du topic ("order:<uuid>") est déjà la capacité d'accès
-- (il faut connaître l'UUID pour s'abonner) : une lecture large
-- sur cette table ne fuite donc rien de plus que ce que permet
-- déjà le lien de confirmation de commande.
-- ============================================================
create policy "anyone can read order broadcasts"
  on realtime.messages
  for select
  to anon, authenticated
  using (true);
