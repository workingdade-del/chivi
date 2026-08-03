-- ============================================================
-- Fix: upload d'image plat bloqué par RLS sur le bucket menu-images.
--
-- Les policies de la migration 0033 comparaient bucket_id à la chaîne
-- littérale 'menu-images'. Sur chivi-test, ce bucket a été supprimé
-- puis recréé manuellement APRÈS l'application de la migration 0033 —
-- storage.buckets.id (la vraie clé référencée par storage.objects.
-- bucket_id) et storage.buckets.name (le nom affiché) sont deux
-- colonnes distinctes, et rien ne garantit qu'un bucket recréé
-- retrouve le même id, même sous un nom identique. D'où l'échec RLS
-- silencieux : bucket_id inséré != littéral 'menu-images' figé.
--
-- Fix robuste : on résout bucket_id dynamiquement via le NOM du
-- bucket (storage.buckets.name) plutôt qu'un id figé, avec un `in`
-- (et non `=`) pour rester correct même si plusieurs lignes
-- correspondaient. Cela reste valide même si le bucket est de nouveau
-- supprimé/recréé à l'avenir, sans nouvelle migration.
-- ============================================================

drop policy if exists "staff can upload menu images" on storage.objects;
drop policy if exists "staff can update menu images" on storage.objects;
drop policy if exists "staff can delete menu images" on storage.objects;

create policy "staff can upload menu images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id in (select id from storage.buckets where name = 'menu-images'));

create policy "staff can update menu images"
  on storage.objects for update
  to authenticated
  using (bucket_id in (select id from storage.buckets where name = 'menu-images'));

create policy "staff can delete menu images"
  on storage.objects for delete
  to authenticated
  using (bucket_id in (select id from storage.buckets where name = 'menu-images'));
