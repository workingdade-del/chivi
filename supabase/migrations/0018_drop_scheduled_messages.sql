-- Vercel Hobby n'autorise pas de cron plus fréquent qu'une fois par jour :
-- le message de feedback post-livraison part maintenant immédiatement
-- (voir handleDeliveryConfirmed dans le webhook WhatsApp) au lieu d'être
-- différé de 5 minutes. Cette table ne servait qu'à ça.
drop table if exists scheduled_messages;
