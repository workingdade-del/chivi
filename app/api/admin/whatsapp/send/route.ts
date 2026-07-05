import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";
import { normalizePhone, sendWhatsappText } from "@/lib/whatsapp";

/** Réponse manuelle envoyée par un membre du staff depuis la console Admin. */
export async function POST(req: NextRequest) {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { profileId, phone, message } = (await req.json()) as {
    profileId: string;
    phone: string;
    message: string;
  };

  if (!profileId || !phone || !message?.trim()) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const normalizedPhone = normalizePhone(phone);

  try {
    await sendWhatsappText(normalizedPhone, message);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec de l'envoi WhatsApp" },
      { status: 502 }
    );
  }

  const supabase = createServiceClient();
  await supabase.from("whatsapp_messages").insert({
    profile_id: profileId,
    direction: "outbound",
    phone: normalizedPhone,
    message_type: "text",
    content: message,
  });

  return NextResponse.json({ sent: true });
}
