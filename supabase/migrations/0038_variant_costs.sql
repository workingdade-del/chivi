-- Coûts ingrédients/emballage par variante — jusqu'ici ces coûts
-- n'existaient qu'au niveau du plat (product_costs), alors qu'une
-- variante (ex: portion Poulet vs Boeuf) peut avoir un coût réel
-- différent. La marge par variante se calcule dans l'app (prix de la
-- variante - ses coûts), pas besoin de colonne stockée pour ça.
alter table product_variants add column if not exists ingredient_cost integer not null default 0 check (ingredient_cost >= 0);
alter table product_variants add column if not exists packaging_cost integer not null default 0 check (packaging_cost >= 0);
