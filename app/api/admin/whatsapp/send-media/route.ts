import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";
import { normalizePhone, sendWhatsappMedia, extractMessageId } from "@/lib/whatsapp";
import { getSignedMediaUrl, downloadStoredMedia, deleteStoredMedia, extensionFor } from "@/lib/whatsapp-media";
import { convertToOggOpus, OGG_OPUS_MIME_TYPE } from "@/lib/audio-convert";

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

  // WhatsApp exige OGG/Opus pour les notes vocales — le navigateur enregistre
  // en webm/opus ou mp4/aac selon le client, accepté par l'API (200 OK) mais
  // pas forcément lisible chez le destinataire. On reconvertit toujours côté
  // serveur avant l'envoi, et on remplace le fichier brut par la version
  // convertie (aussi utilisée ensuite pour l'affichage dans l'historique).
  let finalMediaPath = mediaPath;
  let finalMimeType = mimeType;
  if (mediaType === "audio" && mimeType.split(";")[0].trim() !== "audio/ogg") {
    try {
      const rawBuffer = await downloadStoredMedia(supabase, mediaPath);
      const converted = await convertToOggOpus(rawBuffer, extensionFor(mimeType));
      const convertedPath = mediaPath.replace(/\.[^./]+$/, "") + ".ogg";
      const { error: uploadErr } = await supabase.storage
        .from("whatsapp-media")
        .upload(convertedPath, converted, { contentType: OGG_OPUS_MIME_TYPE, upsert: false });
      if (uploadErr) throw new Error(uploadErr.message);

      await deleteStoredMedia(supabase, mediaPath);
      finalMediaPath = convertedPath;
      finalMimeType = OGG_OPUS_MIME_TYPE;
      console.log("[send-media] audio converti vers ogg/opus", {
        from: mediaPath,
        to: convertedPath,
        originalMimeType: mimeType,
        rawBytes: rawBuffer.length,
        convertedBytes: converted.length,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? `Échec de conversion audio: ${err.message}` : "Échec de conversion audio" },
        { status: 500 }
      );
    }
  }

  const signedUrl = await getSignedMediaUrl(supabase, finalMediaPath, 3600);
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
    media_path: finalMediaPath,
    media_mime_type: finalMimeType,
  });

  return NextResponse.json({ sent: true });
}
