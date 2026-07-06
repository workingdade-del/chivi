-- ============================================================
-- Gestion avancée des livreurs : disponibilité pilotée par
-- WhatsApp (boutons interactifs + détection de mots-clés),
-- photo de profil, et rattachement des messages livreurs
-- (distinct des messages clients dans whatsapp_messages).
--
-- Note : pas de colonne whatsapp_number séparée — `drivers.phone`
-- sert déjà ce rôle (un seul numéro par livreur dans ce métier) ;
-- dupliquer la donnée aurait introduit deux sources de vérité
-- pour la même valeur sans bénéfice réel.
-- ============================================================

alter table drivers add column is_available boolean not null default true;
alter table drivers add column last_seen timestamptz;
alter table drivers add column photo_url text;

alter table whatsapp_messages add column driver_id uuid references drivers(id);
