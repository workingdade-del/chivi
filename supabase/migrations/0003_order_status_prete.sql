-- Sépare "Prête" (en cuisine, en attente d'un livreur) de "En route"
-- (le livreur a récupéré la commande). La cuisine pilote
-- Reçue → En préparation → Prête ; l'admin assigne un livreur et
-- pilote ensuite En route → Livrée.
alter table orders drop constraint orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('recue', 'en_preparation', 'prete', 'en_route', 'livree', 'annulee'));
