-- ============================================================
-- Empêche qu'un même numéro ait plusieurs sessions Flow actives
-- simultanément — cause racine probable des "quantités fantômes"
-- observées en test réel : un déclenchement répété de "menu"
-- créait de nouvelles flow_sessions sans jamais clôturer les
-- précédentes, rendant ambigu "la session la plus récente" utilisée
-- par tous les lookups (le panier lu pouvait alors être celui
-- d'une session différente de celle réellement ouverte côté client).
--
-- Le code (handleFlowTrigger) annule désormais proactivement toute
-- session active avant d'en créer une nouvelle — cet index est un
-- filet de sécurité supplémentaire au niveau base de données.
-- ============================================================

-- Nettoyage préalable : des numéros de test (dont le scénario de bug
-- rapporté) ont déjà plusieurs sessions "actives" simultanées suite au
-- bug corrigé ici — sans ce nettoyage, la création de l'index échouerait
-- contre les données existantes. On ne garde active que la plus récente
-- par numéro, les autres passent "cancelled" (historique conservé).
with ranked as (
  select flow_token, phone,
    row_number() over (partition by phone order by created_at desc) as rn
  from flow_sessions
  where status not in ('completed', 'cancelled', 'escalated')
)
update flow_sessions
set status = 'cancelled'
where flow_token in (select flow_token from ranked where rn > 1);

create unique index flow_sessions_active_phone_idx
  on flow_sessions (phone)
  where status not in ('completed', 'cancelled', 'escalated');
