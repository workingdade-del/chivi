-- ============================================================
-- Coûts fixes / variables + seuils de pilotage (point mort, prix conseillé).
-- Aucune dépense existante n'est modifiée : cost_type reste NULL ("à classer")
-- tant que l'utilisateur ne l'a pas renseigné.
-- ============================================================

alter table expenses add column if not exists cost_type text check (cost_type in ('fixe', 'variable'));

-- Seuils paramétrables (singleton system_settings, comme ai_model).
alter table system_settings add column if not exists target_margin_pct integer not null default 40 check (target_margin_pct between 1 and 99);
alter table system_settings add column if not exists break_even_tolerance_pct integer not null default 2 check (break_even_tolerance_pct between 0 and 100);
-- "Baisse de prix envisageable" : marge >= cible + cet écart (en points) ET ventes faibles.
alter table system_settings add column if not exists price_cut_margin_gap_pct integer not null default 15 check (price_cut_margin_gap_pct between 0 and 100);
-- Ventes faibles : part du CA du produit < ce % de la part moyenne (100 / nb de produits).
alter table system_settings add column if not exists price_cut_low_sales_pct integer not null default 50 check (price_cut_low_sales_pct between 1 and 100);
