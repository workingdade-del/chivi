import { createServiceClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/whatsapp";

/**
 * Un message reçu depuis un numéro staff (support WhatsApp classique,
 * non-API) ne doit JAMAIS déclencher l'IA conversationnelle ni le flow de
 * commande client — il doit être routé vers handleStaffOrderSubmission.
 */
export async function isStaffNumber(phone: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("staff_numbers").select("phone");
  if (!data?.length) return false;
  const normalized = normalizePhone(phone);
  return data.some((row) => normalizePhone(row.phone) === normalized);
}
