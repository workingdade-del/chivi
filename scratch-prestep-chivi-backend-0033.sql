-- ============================================================
-- À exécuter UNE FOIS sur chivi-backend (production), AVANT de
-- relancer 0033_unified_menu_management.sql telle quelle.
--
-- 0033 se termine par 3 CREATE POLICY sur storage.objects pour
-- le bucket menu-images (staff can upload/update/delete menu
-- images) en supposant un bucket vierge, sans policy existante.
-- Sur chivi-backend, ces 3 policies existent déjà (créées
-- manuellement avant la formalisation en migrations) — la
-- collision de nom fait échouer tout le script, et comme il
-- tourne en une seule transaction, RIEN n'est appliqué : ni les
-- tables categories/product_images/product_supplements, ni la
-- conversion de products.category en FK, ni products.ingredients.
--
-- Ce script se contente de supprimer les 3 policies existantes
-- (mêmes noms exacts que celles que 0033 tente de créer), pour
-- que 0033 puisse ensuite tourner jusqu'au bout sans modifier
-- ni le contenu de 0033, ni l'historique déjà appliqué sur
-- chivi-test.
-- ============================================================

drop policy if exists "staff can upload menu images" on storage.objects;
drop policy if exists "staff can update menu images" on storage.objects;
drop policy if exists "staff can delete menu images" on storage.objects;
