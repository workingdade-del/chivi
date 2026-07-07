-- Relie une confirmation d'adresse à une session WhatsApp Flow, pour
-- qu'une fois l'adresse validée on finalise directement la commande
-- (au lieu de juste répondre avec le tarif de livraison).
alter table pending_location_confirmations add column flow_token uuid references flow_sessions(flow_token);
