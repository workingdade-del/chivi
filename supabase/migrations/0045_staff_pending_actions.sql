-- ============================================================
-- Actions staff en attente de confirmation explicite (renommer un
-- client, changer son numéro...) — même principe que
-- staff_log_sessions pour les commandes : une action proposée par
-- l'IA n'est jamais appliquée directement, elle attend un "OUI" du
-- staff. Une seule action en attente à la fois par numéro staff.
-- ============================================================

create table staff_pending_actions (
  id uuid primary key default gen_random_uuid(),
  staff_phone text not null,
  action_type text not null check (action_type in ('rename_client', 'update_client_phone')),
  payload jsonb not null,
  summary text not null,
  status text not null default 'awaiting_confirmation' check (status in ('awaiting_confirmation', 'completed', 'abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index staff_pending_actions_active_phone_idx
  on staff_pending_actions (staff_phone)
  where status = 'awaiting_confirmation';

alter table staff_pending_actions enable row level security;
-- Aucune policy : uniquement le service role (webhook) touche cette table.

create trigger staff_pending_actions_set_updated_at before update on staff_pending_actions
  for each row execute function set_updated_at();
