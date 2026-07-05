-- ============================================================
-- Conversations WhatsApp (Admin) : bascule IA / manuel par client,
-- vue agrégée pour la liste triée par dernière activité, et
-- Realtime sur whatsapp_messages pour les notifications live.
-- ============================================================

alter table profiles add column ai_active boolean not null default true;

create policy "staff update profiles" on profiles
  for update to authenticated using (true) with check (true);

-- Un client WhatsApp = une conversation (regroupée par profil).
-- security_invoker garantit que la vue respecte les RLS des tables
-- sous-jacentes (staff uniquement, jamais anon) au lieu de s'exécuter
-- avec les droits du propriétaire de la vue.
create view conversation_summaries
  with (security_invoker = true) as
select
  p.id as profile_id,
  p.whatsapp_phone,
  p.full_name,
  p.ai_active,
  latest.content as last_message,
  latest.direction as last_direction,
  latest.message_type as last_message_type,
  latest.created_at as last_message_at
from profiles p
join lateral (
  select content, direction, message_type, created_at
  from whatsapp_messages wm
  where wm.profile_id = p.id
  order by wm.created_at desc
  limit 1
) latest on true;

alter publication supabase_realtime add table whatsapp_messages;
