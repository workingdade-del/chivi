-- Choix du modèle IA (Groq / Claude) pour la conversation WhatsApp,
-- lu dynamiquement à chaque appel — pas de redéploiement nécessaire pour
-- changer. Colonne sur le singleton system_settings existant plutôt
-- qu'une nouvelle table, cohérent avec le pattern déjà en place (pause
-- système). N'affecte QUE la génération de réponse conversationnelle —
-- la transcription audio reste sur Groq Whisper dans tous les cas, Claude
-- n'ayant pas d'équivalent natif (voir lib/ai-provider.ts).
alter table system_settings add column if not exists ai_model text not null default 'groq' check (ai_model in ('groq', 'claude'));
