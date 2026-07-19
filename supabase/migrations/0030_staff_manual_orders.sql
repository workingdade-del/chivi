-- ============================================================
-- Traitement de commande manuelle via le numéro support classique
-- (+229 59398724, non-API) : le staff discute avec des clients qui
-- préfèrent l'humain, puis transfère la commande convenue au numéro
-- API via un message structuré "/commande" — traité automatiquement
-- (parsing, création de commande, notification client + livreur).
--
-- staff_numbers : numéros autorisés à soumettre des commandes
-- manuelles. Un message reçu depuis un de ces numéros ne doit
-- JAMAIS déclencher l'IA conversationnelle ni le flow client normal.
--
-- orders.source distingue ces commandes créées manuellement par le
-- staff des commandes normales passées via le WhatsApp Flow.
-- ============================================================

create table staff_numbers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  label text,
  created_at timestamptz not null default now()
);

alter table staff_numbers enable row level security;
-- Aucune policy : uniquement le service role (webhook) touche cette table.

insert into staff_numbers (phone, label) values ('22959398724', 'Support WhatsApp classique (+229 59 39 87 24)');

alter table orders add column source text not null default 'flow' check (source in ('flow', 'staff_manual'));
