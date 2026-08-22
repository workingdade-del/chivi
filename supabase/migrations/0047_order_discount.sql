-- ============================================================
-- Réduction manuelle sur une commande. subtotal/total continuent de
-- représenter le CA net (déjà la convention établie ailleurs — Reports/
-- Dashboard/Finance lisent subtotal comme base de revenu) : discount_amount
-- est une colonne informative/d'audit, et subtotal est stocké DÉJÀ net de
-- la réduction, pour que rien en aval (getReport, business-queries,
-- trigger Finance) n'ait besoin de connaître l'existence des réductions.
-- ============================================================

alter table orders add column if not exists discount_amount integer not null default 0 check (discount_amount >= 0);
