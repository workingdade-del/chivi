-- expenses n'avait jamais été ajoutée à la publication realtime (les
-- migrations précédentes couvraient orders/order_items/drivers/profiles/
-- whatsapp_messages/system_settings mais pas expenses) : la liste des
-- dépenses Cuisine ne se mettait donc jamais à jour sans rechargement.
alter publication supabase_realtime add table expenses;
