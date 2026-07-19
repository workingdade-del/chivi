-- ============================================================
-- Bug critique : une session Flow abandonnée en pleine commande
-- (ex: le client ne répond jamais à la demande de localisation)
-- restait bloquée indéfiniment — tout nouveau message des heures
-- ou jours plus tard (même "bonjour"/"annuler"/"je veux commander")
-- était intercepté par l'ancien état bloqué au lieu d'être traité
-- comme un message frais.
--
-- 'expired' : nouvel état terminal pour les sessions auto-expirées
-- par inactivité (> 30 min), distinct de 'cancelled' qui reste
-- réservé à une annulation explicite (client ou mot-clé de reset).
-- ============================================================

alter table flow_sessions drop constraint if exists flow_sessions_status_check;
alter table flow_sessions add constraint flow_sessions_status_check
  check (status in ('cart', 'awaiting_location', 'awaiting_validation', 'awaiting_payment', 'completed', 'cancelled', 'escalated', 'expired'));

-- updated_at doit refléter la dernière activité réelle pour que la
-- détection d'inactivité (> 30 min) soit fiable — réutilise
-- set_updated_at(), déjà en place pour profiles/products/orders.
create trigger flow_sessions_set_updated_at before update on flow_sessions
  for each row execute function set_updated_at();

-- L'index unique (une seule session active par numéro, migration 0027)
-- doit aussi exclure 'expired', sinon une session expirée bloquerait
-- toujours la création d'une nouvelle session pour ce numéro.
drop index if exists flow_sessions_active_phone_idx;
create unique index flow_sessions_active_phone_idx
  on flow_sessions (phone)
  where status not in ('completed', 'cancelled', 'escalated', 'expired');
