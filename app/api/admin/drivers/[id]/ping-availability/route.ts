import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";
import { sendWhatsappAvailabilityRequest } from "@/lib/whatsapp";

/** Envoie une demande de disponibilité (boutons ✅/❌) à un livreur. Staff uniquement. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: driver, error } = await supabase
    .from("drivers")
    .select("id, name, phone")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !driver) {
    return NextResponse.json({ error: "Livreur introuvable" }, { status: 404 });
  }

  try {
    await sendWhatsappAvailabilityRequest(driver.phone, driver.name);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec de l'envoi WhatsApp" },
      { status: 502 }
    );
  }

  await supabase.from("whatsapp_messages").insert({
    driver_id: driver.id,
    direction: "outbound",
    phone: driver.phone,
    message_type: "interactive",
    content: "Demande de disponibilité (boutons ✅/❌)",
  });

  return NextResponse.json({ sent: true });
}
