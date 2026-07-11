-- Deux livreurs actifs pouvaient partager le même numéro (identique ou
-- juste formaté différemment — "+22944530371" vs "+229 44530371", identiques
-- une fois les caractères non numériques retirés). findDriverByPhone() fait
-- alors un .find() sur un tableau non trié : selon l'ordre retourné, un
-- message entrant de ce numéro pouvait s'attribuer au mauvais livreur d'un
-- appel à l'autre — un livreur "recevait" les messages qui appartenaient en
-- fait à l'autre. Index unique sur le numéro normalisé, parmi les livreurs
-- actifs uniquement (un livreur désactivé peut réutiliser un ancien numéro).
create unique index drivers_active_normalized_phone_idx
  on drivers (regexp_replace(phone, '[^0-9]', '', 'g'))
  where is_active;
