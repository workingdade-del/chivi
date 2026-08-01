import { createServiceClient } from "@/lib/supabase/server";

/** Fenêtre pendant laquelle une position WhatsApp transférée par le staff est associée à la commande /commande ou /commande-log en cours. */
export const LOCATION_WINDOW_MINUTES = 5;

/**
 * Position WhatsApp envoyée par le staff dans les LOCATION_WINDOW_MINUTES
 * précédant le message en cours de traitement — GPS réel prioritaire sur
 * la description texte. Partagé entre le pipeline rigide "/commande" et le
 * pipeline conversationnel "/commande-log" (extrait dans son propre module
 * pour éviter un import circulaire entre les deux).
 */
export async function findRecentForwardedLocation(supportPhone: string): Promise<{ lat: number; lng: number } | null> {
  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - LOCATION_WINDOW_MINUTES * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("whatsapp_messages")
    .select("payload")
    .eq("phone", supportPhone)
    .eq("message_type", "location")
    .eq("direction", "inbound")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1);

  const payload = data?.[0]?.payload as { location?: { latitude: number; longitude: number } } | null;
  if (!payload?.location) return null;
  return { lat: payload.location.latitude, lng: payload.location.longitude };
}
