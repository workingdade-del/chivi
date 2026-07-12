-- ============================================================
-- Machine à états complète de la commande WhatsApp Flow :
-- cart -> awaiting_location -> awaiting_validation (récapitulatif
-- + boutons Valider/Annuler) -> awaiting_payment (choix du mode
-- de paiement) -> completed, avec cancelled/escalated comme
-- issues terminales alternatives.
--
-- location_attempts compte les tentatives de détection d'adresse
-- (GPS ou texte) pour cette session — au-delà de 3, on bascule
-- vers "escalated" plutôt que de boucler indéfiniment sur Groq/
-- Nominatim.
-- ============================================================

alter table flow_sessions drop constraint if exists flow_sessions_status_check;
alter table flow_sessions add constraint flow_sessions_status_check
  check (status in ('cart', 'awaiting_location', 'awaiting_validation', 'awaiting_payment', 'completed', 'cancelled', 'escalated'));

alter table flow_sessions add column if not exists location_attempts int not null default 0;
