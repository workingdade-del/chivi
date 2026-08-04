-- ============================================================
-- DIAGNOSTIC UNIQUEMENT — à exécuter dans le SQL editor de
-- chivi-test, PAS via le dashboard Storage (pour être sûr que
-- ce bucket n'a jamais transité par une recréation manuelle).
-- Policy volontairement identique au pattern déjà prouvé
-- fonctionnel de driver-photos (littéral, sans sous-select) —
-- retire toute variable liée à la résolution dynamique par nom.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('menu-images-verify', 'menu-images-verify', true);

create policy "verify staff can upload menu images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'menu-images-verify');

-- Pour nettoyer une fois le test terminé :
-- drop policy "verify staff can upload menu images" on storage.objects;
-- delete from storage.objects where bucket_id = 'menu-images-verify';
-- delete from storage.buckets where id = 'menu-images-verify';
