-- ============================================================
-- Le livreur ne recevait jusqu'ici que l'adresse interprétée par
-- l'IA/Nominatim, jamais les données brutes envoyées par le client
-- (pin GPS exact, texte original, audio original) — problématique
-- au Bénin où l'adressage est peu précis et où le libellé généré
-- perd des détails utiles que le livreur pourrait exploiter.
--
-- location_inputs accumule, dans l'ordre d'envoi, chaque élément brut
-- reçu du client pendant la détection de position d'une commande
-- (tableau jsonb de { type: "gps"|"text"|"audio", content, lat?, lng?,
-- mediaPath?, mediaMimeType?, waMessageId, createdAt }). Rempli sur
-- flow_sessions au fil des tentatives, puis copié tel quel sur orders
-- à la création de la commande pour que l'assignation livreur (qui
-- n'a plus accès à la session Flow, déjà "completed") puisse forwarder
-- ces éléments.
-- ============================================================

alter table flow_sessions add column location_inputs jsonb not null default '[]'::jsonb;
alter table orders add column location_inputs jsonb not null default '[]'::jsonb;
