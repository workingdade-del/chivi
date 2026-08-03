-- ============================================================
-- Commandes créées manuellement depuis l'Admin (bouton "Nouvelle
-- commande"). Source distincte de "staff_manual" (soumise via le
-- numéro support, notifie normalement) et "staff_manual_log"
-- (silencieuse, toujours au statut "livree") : "admin_manual" est
-- silencieuse par défaut comme staff_manual_log, mais peut être créée
-- à n'importe quel statut initial choisi par l'admin (pas figée à
-- "livree").
-- ============================================================

alter table orders drop constraint if exists orders_source_check;
alter table orders add constraint orders_source_check
  check (source in ('flow', 'staff_manual', 'staff_manual_log', 'admin_manual'));
