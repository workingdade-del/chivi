-- Meta renvoie l'état de livraison de chaque message sortant (sent/
-- delivered/read/failed) via un callback webhook séparé ("statuses"),
-- jusqu'ici reçu mais totalement ignoré (juste un booléen dans les logs).
-- Un message accepté par l'API (200 OK) peut très bien échouer à la
-- livraison ensuite (numéro invalide, pas sur WhatsApp, fenêtre de
-- réengagement expirée…) — sans ces colonnes, cet échec est invisible.
alter table whatsapp_messages add column delivery_status text;
alter table whatsapp_messages add column delivery_error text;
