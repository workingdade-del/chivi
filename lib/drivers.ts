import { createServiceClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/whatsapp";

/**
 * Un index unique empêche désormais deux livreurs actifs de partager un
 * numéro (migration 0023), mais drivers.phone reste stocké tel que saisi
 * (espaces, "+"…) donc la comparaison doit passer par la même normalisation
 * que whatsapp_messages.normalized_phone plutôt qu'un eq() direct.
 */
export async function findDriverByPhone(normalizedPhone: string): Promise<{ id: string; name: string } | null> {
  const supabase = createServiceClient();
  const { data: drivers } = await supabase
    .from("drivers")
    .select("id, name, phone")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  return drivers?.find((d) => normalizePhone(d.phone) === normalizedPhone) ?? null;
}
