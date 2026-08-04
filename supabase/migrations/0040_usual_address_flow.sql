-- ============================================================
-- Raccourci "adresse habituelle" dans le flow WhatsApp.
--
-- 1) awaiting_usual_address_choice : nouvel état de flow_sessions,
--    inséré entre la fin du Flow menu et awaiting_location — proposé
--    uniquement quand profiles a une adresse habituelle complète
--    (texte + tarif + lat + lng, voir lib/order-validation.ts).
--
-- 2) pending_usual_address_offers : offre "mémoriser cette adresse
--    comme habituelle ?" envoyée après confirmation d'une NOUVELLE
--    adresse différente de l'habituelle. Table séparée (comme
--    pending_location_confirmations) plutôt qu'un champ sur
--    flow_sessions car elle doit pouvoir rester en attente PENDANT
--    que la session progresse déjà vers awaiting_validation/
--    awaiting_payment (le récap est envoyé juste après) sans
--    interférer avec les boutons Valider/Annuler de cette étape —
--    volontairement gérée par clic bouton uniquement, jamais par
--    texte libre "oui"/"non", pour ne pas créer d'ambiguïté avec la
--    confirmation du récapitulatif qui accepte, elle, le texte libre.
-- ============================================================

alter table flow_sessions drop constraint if exists flow_sessions_status_check;
alter table flow_sessions add constraint flow_sessions_status_check
  check (status in ('cart', 'awaiting_usual_address_choice', 'awaiting_location', 'awaiting_validation', 'awaiting_payment', 'completed', 'cancelled', 'escalated', 'expired'));

create table pending_usual_address_offers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  phone text not null,
  address_text text not null,
  lat numeric not null,
  lng numeric not null,
  fee integer not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);

alter table pending_usual_address_offers enable row level security;
-- Aucune policy : uniquement le service role (webhook) touche cette table.
