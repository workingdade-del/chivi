-- Mode pause système : une seule ligne de configuration globale (singleton
-- forcé par la contrainte "id = true"), lisible par tout le monde (le
-- Client PWA doit savoir si le service est en pause) et modifiable par le
-- staff authentifié uniquement.
create table system_settings (
  id boolean primary key default true,
  is_paused boolean not null default false,
  pause_reason text,
  paused_at timestamptz,
  paused_by uuid references auth.users(id),
  constraint system_settings_singleton check (id)
);

insert into system_settings (id) values (true);

alter table system_settings enable row level security;

create policy "anyone can read system settings" on system_settings
  for select to anon, authenticated using (true);

create policy "staff can update system settings" on system_settings
  for update to authenticated using (true) with check (true);

alter publication supabase_realtime add table system_settings;
