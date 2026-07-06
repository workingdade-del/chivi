-- Livraisons > 15km : le tarif n'est pas deviné automatiquement, on
-- demande confirmation à un livreur disponible. Cette table fait le pont
-- entre "message envoyé au livreur" et "réponse du livreur" (le livreur
-- répond juste avec un montant en texte libre, sans contexte de commande).
create table pending_delivery_quotes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  phone text not null,
  distance_km numeric not null,
  driver_id uuid references drivers(id),
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  quoted_fee numeric,
  created_at timestamptz not null default now()
);

alter table pending_delivery_quotes enable row level security;
-- Aucune policy : uniquement le service role (webhook) touche cette table.

alter publication supabase_realtime add table pending_delivery_quotes;
