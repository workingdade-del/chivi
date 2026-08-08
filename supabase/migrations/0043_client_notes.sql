-- Notes libres, multi-lignes, sur la fiche client (préférences, historique
-- particulier...) — staff uniquement, jamais visible côté client.
alter table profiles add column if not exists notes text;
