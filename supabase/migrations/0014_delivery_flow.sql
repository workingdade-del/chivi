-- File d'attente de messages WhatsApp différés (ex : message de feedback
-- envoyé 5 minutes après une livraison). Un serverless Vercel ne peut pas
-- tenir un setTimeout() de 5 minutes — on persiste donc le message à
-- envoyer avec sa date d'échéance, et un cron job (voir vercel.json)
-- l'envoie dès qu'il est dû.
create table scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  phone text not null,
  message text not null,
  send_at timestamptz not null,
  sent boolean not null default false,
  created_at timestamptz not null default now()
);

alter table scheduled_messages enable row level security;
-- Aucune policy : seul le service role (webhook, cron) touche cette table.

create index scheduled_messages_due_idx on scheduled_messages (send_at) where not sent;
