-- ============================================================
-- menu-images n'avait jamais reçu de policy SELECT pour le staff,
-- contrairement à whatsapp-media (migration 0025) qui en a une.
-- Postgres applique les policies SELECT au RETURNING d'un INSERT/
-- UPDATE — sans elle, une ligne insérée avec succès peut revenir
-- vide côté RETURNING. Peu probable que ce soit LA cause de l'erreur
-- "new row violates row-level security policy" (ce message précis
-- vient uniquement d'un WITH CHECK qui échoue, pas d'un RETURNING
-- vide), mais c'est une incohérence réelle par rapport au pattern
-- whatsapp-media, sans risque à corriger.
-- ============================================================

drop policy if exists "staff can read menu images" on storage.objects;
create policy "staff can read menu images"
  on storage.objects for select
  to authenticated
  using (bucket_id in (select id from storage.buckets where name = 'menu-images'));
