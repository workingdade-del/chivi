-- Confirmation d'adresse (GPS reverse-géocodé ou lieu extrait par IA depuis
-- un texte/audio) avant de calculer les frais de livraison — le client doit
-- valider ✅/❌ avant qu'on ne fige quoi que ce soit.
create table pending_location_confirmations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  phone text not null,
  candidate_address text not null,
  candidate_lat numeric not null,
  candidate_lng numeric not null,
  source text not null check (source in ('gps', 'text')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now()
);

alter table pending_location_confirmations enable row level security;
-- Aucune policy : uniquement le service role (webhook) touche cette table.

-- État du panier/session pendant le parcours WhatsApp Flow (le Flow lui-même
-- ne peut pas faire de calcul arbitraire — le data endpoint est la seule
-- source de vérité pour le panier et son total).
create table flow_sessions (
  flow_token uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  phone text not null,
  cart jsonb not null default '[]'::jsonb,
  delivery_address text,
  delivery_lat numeric,
  delivery_lng numeric,
  delivery_fee numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table flow_sessions enable row level security;
-- Aucune policy : uniquement le service role (data endpoint du Flow) touche cette table.
