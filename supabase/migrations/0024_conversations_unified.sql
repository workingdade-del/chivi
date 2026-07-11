-- ============================================================
-- Vue Conversations unifiée : aujourd'hui conversation_summaries
-- ne joint que profiles, donc tout message lié à un driver_id
-- (ou à aucun des deux) est invisible dans l'Admin. On regroupe
-- désormais whatsapp_messages par numéro normalisé, peu importe
-- le lien profile/driver, avec le même schéma de normalisation
-- que l'index unique des livreurs (0023).
--
-- media_path stocke le chemin dans le bucket Storage privé
-- "whatsapp-media" (pas d'URL publique) — l'affichage et l'envoi
-- passent par une URL signée générée à la demande, le média peut
-- contenir des données personnelles (photos, documents clients).
-- ============================================================

alter table whatsapp_messages
  add column normalized_phone text generated always as (regexp_replace(phone, '[^0-9]', '', 'g')) stored;

create index whatsapp_messages_normalized_phone_idx
  on whatsapp_messages (normalized_phone, created_at desc);

alter table whatsapp_messages add column media_path text;
alter table whatsapp_messages add column media_mime_type text;

drop view if exists conversation_summaries;

create view all_conversations
  with (security_invoker = true) as
select
  m.normalized_phone,
  latest.phone,
  p.id as profile_id,
  d.id as driver_id,
  coalesce(p.full_name, d.name) as contact_name,
  case
    when p.id is not null then 'client'
    when d.id is not null then 'livreur'
    else 'inconnu'
  end as contact_type,
  p.ai_active,
  latest.content as last_message,
  latest.direction as last_direction,
  latest.message_type as last_message_type,
  latest.media_path as last_media_path,
  latest.created_at as last_message_at
from (select distinct normalized_phone from whatsapp_messages) m
join lateral (
  select content, direction, message_type, media_path, phone, created_at
  from whatsapp_messages wm
  where wm.normalized_phone = m.normalized_phone
  order by wm.created_at desc
  limit 1
) latest on true
left join profiles p on regexp_replace(p.whatsapp_phone, '[^0-9]', '', 'g') = m.normalized_phone
left join drivers d on regexp_replace(d.phone, '[^0-9]', '', 'g') = m.normalized_phone and d.is_active;
