-- ============================================================
-- Refonte de /commande-log en assistant conversationnel : le staff
-- décrit en langage libre (texte ou audio transcrit) une commande déjà
-- servie/livrée, l'IA (Groq) extrait sa compréhension dans un brouillon
-- ("draft"), résume et demande confirmation, permet des corrections en
-- langage libre (allers-retours), puis enregistre une fois confirmé.
--
-- Une seule session active à la fois pour le numéro staff (conversation
-- unique) — abandon silencieux après 15 minutes d'inactivité.
-- ============================================================

create table staff_log_sessions (
  id uuid primary key default gen_random_uuid(),
  staff_phone text not null,
  status text not null default 'awaiting_confirmation' check (status in ('awaiting_confirmation', 'completed', 'abandoned')),
  draft jsonb not null,
  awaiting_final_confirmation boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table staff_log_sessions enable row level security;
-- Aucune policy : uniquement le service role (webhook) touche cette table.

create unique index staff_log_sessions_active_phone_idx
  on staff_log_sessions (staff_phone)
  where status = 'awaiting_confirmation';

create trigger staff_log_sessions_set_updated_at before update on staff_log_sessions
  for each row execute function set_updated_at();
