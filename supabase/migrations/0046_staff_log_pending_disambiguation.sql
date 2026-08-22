-- ============================================================
-- Désambiguïsation de plat/variante pour /commande-log : quand le
-- matching flou trouve plusieurs candidats proches (score ambigu, ni
-- assez haut pour accepter directement ni assez bas pour rejeter), on
-- propose une liste numérotée au staff plutôt que d'échouer platement
-- ("plat non reconnu"). Ce choix doit être résolu de façon
-- déterministe au tour suivant (pas re-déviné par l'IA) — d'où la
-- persistance ici, à côté du draft.
-- ============================================================

alter table staff_log_sessions add column if not exists pending_disambiguation jsonb;
