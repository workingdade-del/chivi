-- ============================================================
-- CHIVI — seed du menu, suppléments, boissons et zones de livraison
-- image_path pointe vers un fichier attendu dans le bucket Storage
-- "menu-images" (à uploader) ; NULL = pas de photo encore fournie
-- (l'UI affiche alors le placeholder rayé prévu par le design).
-- ============================================================

-- ------------------------------------------------------------
-- Plats CHIVI
-- ------------------------------------------------------------
with p as (
  insert into products (name, description, category, base_price, image_path, sort_order)
  values ('Spaghetti CHIVI', 'Spaghetti à l''œuf & à la saucisse', 'plats_chivi', 1000, 'Spaghetti.jpg', 10)
  returning id
)
insert into product_variants (product_id, group_label, name, price, sort_order)
select id, 'Protéine', 'Aileron', 2000, 1 from p;

with p as (
  insert into products (name, description, category, base_price, image_path, sort_order)
  values ('Atchèkè CHIVI', 'Atchèkè, demi poisson Silivi', 'plats_chivi', 1000, 'Atcheke.jpg', 20)
  returning id
)
insert into product_variants (product_id, group_label, name, price, sort_order)
select id, 'Protéine', v.name, v.price, v.sort_order from p, (values
  ('Silivi complet', 1500, 1),
  ('Poisson Bar', 2000, 2),
  ('Aileron', 2000, 3),
  ('Cuisse', 2000, 4),
  ('Poulet mayo', 2500, 5)
) as v(name, price, sort_order);

with p as (
  insert into products (name, description, category, base_price, image_path, sort_order)
  values ('Atassi CHIVI', 'Gari, demi poisson, œuf ou fromage', 'plats_chivi', 1000, 'Atassi.jpg', 30)
  returning id
)
insert into product_variants (product_id, group_label, name, price, sort_order)
select id, 'Protéine', v.name, v.price, v.sort_order from p, (values
  ('Complet (demi poisson, œuf, fromage)', 1200, 1),
  ('Aileron, demi poisson, œuf, fromage', 2500, 2),
  ('Cuisse, poisson, œuf, fromage', 2000, 3)
) as v(name, price, sort_order);

with p as (
  insert into products (name, description, category, base_price, image_path, sort_order)
  values ('Haricot gras + Gésier & Gari', 'Haricot gras, gésier et gari', 'plats_chivi', 1000, 'dish-haricot.jpg', 40)
  returning id
)
insert into product_variants (product_id, group_label, name, price, sort_order)
select id, 'Option', 'Demi poisson & alloco', 1500, 1 from p;

with p as (
  insert into products (name, description, category, base_price, image_path, sort_order)
  values ('Frites & Alloco CHIVI + Poisson', 'Frites et alloco, poisson', 'plats_chivi', 1500, 'Frites.jpg', 50)
  returning id
)
insert into product_variants (product_id, group_label, name, price, sort_order)
select id, 'Protéine', v.name, v.price, v.sort_order from p, (values
  ('Aileron', 2000, 1),
  ('Poulet mayo', 2500, 2),
  ('Cuisse', 2000, 3)
) as v(name, price, sort_order);

with p as (
  insert into products (name, description, category, base_price, image_path, sort_order)
  values ('Riz gras CHIVI + Poisson Bar', 'Riz gras, poisson Bar', 'plats_chivi', 2000, null, 60)
  returning id
)
insert into product_variants (product_id, group_label, name, price, sort_order)
select id, 'Option', v.name, v.price, v.sort_order from p, (values
  ('Grand', 2500, 1),
  ('Très grand', 3000, 2),
  ('+ Aileron', 2500, 3),
  ('+ Cuisse', 2000, 4)
) as v(name, price, sort_order);

insert into products (name, description, category, base_price, image_path, sort_order)
values ('Pâte rouge + Aileron', 'Pâte rouge, aileron', 'plats_chivi', 2000, 'Pa_te_Rouge.jpg', 70);

insert into products (name, description, category, base_price, image_path, sort_order)
values ('Piron rouge + Aileron', 'Piron rouge, aileron', 'plats_chivi', 2000, 'Priron.jpg', 80);

insert into products (name, description, category, base_price, image_path, sort_order)
values ('Couscous CHIVI', 'Sauce marocaine, aileron & saucisse', 'plats_chivi', 2500, 'Couscous.jpg', 90);

with p as (
  insert into products (name, description, category, base_price, image_path, sort_order)
  values ('Gboman CHIVI', 'Poisson, fromage, kpanman, 2 pâtes', 'plats_chivi', 2500, 'Gboman.jpg', 100)
  returning id
)
insert into product_variants (product_id, group_label, name, price, sort_order)
select id, 'Pâte', v.name, v.price, v.sort_order from p, (values
  ('Pâte noire', 2500, 1),
  ('Pâte blanche', 2500, 2)
) as v(name, price, sort_order);

with p as (
  insert into products (name, description, category, base_price, image_path, sort_order)
  values ('Tchayo CHIVI', 'Poisson, fromage, kpanman, 2 pâtes', 'plats_chivi', 2500, 'Tchayo.jpg', 110)
  returning id
)
insert into product_variants (product_id, group_label, name, price, sort_order)
select id, 'Pâte', v.name, v.price, v.sort_order from p, (values
  ('Pâte noire', 2500, 1),
  ('Pâte blanche', 2500, 2)
) as v(name, price, sort_order);

insert into products (name, description, category, base_price, image_path, is_new, sort_order)
values ('Riz blanc CHIVI + Poulet DG', 'Riz blanc, poulet DG', 'plats_chivi', 3000, 'Poulet_DG.jpg', true, 120);

with p as (
  insert into products (name, description, category, base_price, image_path, sort_order)
  values ('Tchep aux légumes', 'Tchep aux légumes', 'plats_chivi', 3000, 'Tchep_poisson.jpg', 130)
  returning id
)
insert into product_variants (product_id, group_label, name, price, sort_order)
select id, 'Protéine', v.name, v.price, v.sort_order from p, (values
  ('Viande', 3500, 1),
  ('Mix (poisson & viande)', 4500, 2)
) as v(name, price, sort_order);

-- ------------------------------------------------------------
-- Plats Traditionnels
-- ------------------------------------------------------------
with p as (
  insert into products (name, description, category, base_price, image_path, sort_order)
  values ('Monyo + 2 Akassa + Poisson Silivi', 'Monyo, 2 akassa, poisson Silivi', 'plats_traditionnels', 1500, 'Monyo.jpg', 10)
  returning id
)
insert into product_variants (product_id, group_label, name, price, sort_order)
select id, 'Protéine', v.name, v.price, v.sort_order from p, (values
  ('Poisson Bar', 2000, 1),
  ('Aileron', 2500, 2)
) as v(name, price, sort_order);

with p as (
  insert into products (name, description, category, base_price, image_path, sort_order)
  values ('Jus + 2 Akassa + Poisson Bar', 'Jus, 2 akassa, poisson Bar', 'plats_traditionnels', 2000, 'Jus_Akassa.jpg', 20)
  returning id
)
insert into product_variants (product_id, group_label, name, price, sort_order)
select id, 'Protéine', 'Aileron', 2500, 1 from p;

-- ------------------------------------------------------------
-- Boissons (jus naturels — vendus à l'unité, pas des suppléments)
-- ------------------------------------------------------------
insert into products (name, description, category, base_price, image_path, sort_order) values
  ('Jus Ananas 500ml', 'Jus d''ananas frais, 500ml', 'boissons', 1000, null, 10),
  ('Jus Pastèque 500ml', 'Jus de pastèque frais, 500ml', 'boissons', 1000, null, 20),
  ('Jus Bissap 500ml', 'Jus de bissap, 500ml', 'boissons', 500, null, 30);

-- ------------------------------------------------------------
-- Suppléments (ajouts multi-sélection sur la fiche produit)
-- ------------------------------------------------------------
insert into supplements (name, price, sort_order) values
  ('Frites', 500, 10),
  ('Alloco', 500, 20),
  ('Akassa', 50, 30);

-- ------------------------------------------------------------
-- Zones et tarifs de livraison
-- ------------------------------------------------------------
insert into delivery_zones (name, min_km, max_km, fee_min, fee_max, sort_order) values
  ('< 5 km', 0, 5, 500, 500, 10),
  ('5-9 km', 5, 9, 700, 800, 20),
  ('9-12 km', 9, 12, 1000, 1000, 30),
  ('12-15 km', 12, 15, 1200, 1200, 40);
