-- Le bucket "whatsapp-media" est PRIVÉ (créé via l'API Storage) car il peut
-- contenir des photos/documents/messages vocaux de clients ou livreurs —
-- contrairement à "driver-photos", il n'y a pas de lecture publique : le
-- staff authentifié génère une URL signée à la demande (createSignedUrl)
-- pour afficher un média ou l'envoyer à Meta.
create policy "staff can read whatsapp media"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'whatsapp-media');

create policy "staff can upload whatsapp media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'whatsapp-media');

create policy "staff can delete whatsapp media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'whatsapp-media');
