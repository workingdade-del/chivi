import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";
import { normalizePhone, sendWhatsappMedia, extractMessageId } from "@/lib/whatsapp";
import { getSignedMediaUrl } from "@/lib/whatsapp-media";

/**
 * Envoie un média déjà uploadé dans le bucket whatsapp-media (image, audio
 * enregistré au micro, ou document/PDF) depuis la console Admin.
 */
export async function POST(req: NextRequest) {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { profileId, driverId, phone, mediaPath, mediaType, mimeType, caption, filename } = (await req.json()) as {
    profileId?: string | null;
    driverId?: string | null;
    phone: string;
    mediaPath: string;
    mediaType: "image" | "audio" | "document";
    mimeType: string;
    caption?: string;
    filename?: string;
  };

  if (!phone || !mediaPath || !mediaType) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const signedUrl = await getSignedMediaUrl(supabase, mediaPath, 3600);
  if (!signedUrl) {
    return NextResponse.json({ error: "Échec de génération de l'URL du média" }, { status: 500 });
  }

  const normalizedPhone = normalizePhone(phone);

  let waMessageId: string | null = null;
  try {
    const sendResult = await sendWhatsappMedia({ to: normalizedPhone, mediaType, link: signedUrl, caption, filename });
    waMessageId = extractMessageId(sendResult);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec de l'envoi WhatsApp" },
      { status: 502 }
    );
  }

  await supabase.from("whatsapp_messages").insert({
    profile_id: profileId ?? null,
    driver_id: driverId ?? null,
    wa_message_id: waMessageId,
    direction: "outbound",
    phone: normalizedPhone,
    message_type: mediaType,
    content: caption ?? filename ?? null,
    media_path: mediaPath,
    media_mime_type: mimeType,
  });

  return NextResponse.json({ sent: true });
}
