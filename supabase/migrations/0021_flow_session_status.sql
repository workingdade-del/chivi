-- Le Flow (menu + panier) se termine sans écran de localisation intégré —
-- la position est ensuite demandée en chat classique. Ce statut permet au
-- webhook de savoir que le prochain message texte/localisation du client
-- doit être traité comme sa position de livraison, pas comme une
-- conversation générale.
alter table flow_sessions add column status text not null default 'cart' check (status in ('cart', 'awaiting_location', 'completed'));
