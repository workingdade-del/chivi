-- ============================================================
-- Fix v2 : l'upload menu-images échoue TOUJOURS après la migration
-- 0034 — nouvelle cause identifiée.
--
-- 0034 a remplacé bucket_id = 'menu-images' (littéral) par
-- bucket_id in (select id from storage.buckets where name =
-- 'menu-images') pour survivre à la recréation manuelle du bucket.
-- Mais storage.buckets a SA PROPRE row-level security activée — et
-- sans policy SELECT pour le rôle "authenticated" dessus, ce
-- sous-select renvoie silencieusement 0 ligne pour ce rôle (RLS ne
-- lève pas d'erreur, il filtre). "bucket_id in (0 ligne)" est donc
-- toujours faux : la policy "corrigée" de 0034 échoue exactement
-- comme l'ancienne, pour une raison différente.
--
-- Preuve indirecte : driver-photos (migration 0009) et whatsapp-media
-- (migration 0025) utilisent un bucket_id = '<littéral>' simple (sans
-- sous-select sur storage.buckets) et fonctionnent — ils ne dépendent
-- pas de la lecture de storage.buckets par "authenticated".
--
-- Fix : autoriser "authenticated" à lire storage.buckets (metadata
-- seule — id/name/public — rien de sensible), ce qui débloque le
-- sous-select déjà en place depuis 0034 sans revenir à un id figé.
-- ============================================================

drop policy if exists "staff can read buckets" on storage.buckets;
create policy "staff can read buckets"
  on storage.buckets for select
  to authenticated
  using (true);
