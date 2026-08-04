-- Adresse habituelle mémorisée par client, pour proposer un raccourci
-- "même adresse que d'habitude ?" au lieu de repasser par la détection
-- Nominatim à chaque commande. lat/lng restent optionnels (le staff peut
-- renseigner juste l'adresse + le tarif sans coordonnées précises) — le
-- raccourci WhatsApp exige les 4 champs pour être proposé (voir
-- lib/order-validation.ts), mais l'adresse texte + tarif seuls restent
-- utiles à afficher/éditer côté Admin.
alter table profiles add column if not exists usual_address_text text;
alter table profiles add column if not exists usual_address_lat numeric;
alter table profiles add column if not exists usual_address_lng numeric;
alter table profiles add column if not exists usual_delivery_fee integer;
