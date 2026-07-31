-- ============================================================
-- Mode "enregistrement seul" pour /commande-log : en attendant
-- l'Advanced Access Meta (nécessaire pour envoyer des messages à
-- n'importe quel numéro), le staff peut enregistrer et comptabiliser
-- une commande SANS déclencher aucun envoi WhatsApp sortant. La
-- commande est créée directement au statut "livree" (déjà terminée/
-- comptabilisée) avec source = "staff_manual_log", distincte de
-- "staff_manual" (qui, elle, notifie normalement client + livreur).
-- ============================================================

alter table orders drop constraint if exists orders_source_check;
alter table orders add constraint orders_source_check
  check (source in ('flow', 'staff_manual', 'staff_manual_log'));
