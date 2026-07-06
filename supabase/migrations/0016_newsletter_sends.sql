create table newsletter_sends (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  template text,
  body_html text not null,
  recipient_count integer not null default 0,
  channel text not null default 'email' check (channel in ('email', 'whatsapp')),
  sent_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table newsletter_sends enable row level security;
create policy "staff manage newsletter sends" on newsletter_sends
  for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table newsletter_sends;
