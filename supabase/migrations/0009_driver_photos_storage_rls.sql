-- Le bucket "driver-photos" est public en LECTURE (créé via l'API Storage),
-- mais l'écriture reste soumise aux RLS de storage.objects : sans policy,
-- même le staff authentifié ne peut pas uploader une photo.
create policy "staff can upload driver photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'driver-photos');

create policy "staff can update driver photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'driver-photos');

create policy "staff can delete driver photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'driver-photos');
