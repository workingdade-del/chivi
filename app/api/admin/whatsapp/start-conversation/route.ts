import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";
import { normalizePhone, sendWhatsappText, extractMessageId } from "@/lib/whatsapp";
import { findDriverByPhone } from "@/lib/drivers";

const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Démarre une conversation vers un numéro depuis la console Admin. Règle
 * Meta : un message en texte libre (hors template approuvé) n'est autorisé
 * que dans les 24h suivant le dernier message reçu DE ce numéro — sinon
 * l'API rejette l'envoi. Aucun template n'étant enregistré côté Meta pour
 * CHIVI, on bloque proprement avec un message explicite plutôt que de
 * laisser échouer l'appel Graph API sans contexte.
 */
export async function POST(req: NextRequest) {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { phone, message } = (await req.json()) as { phone: string; message: string };
  if (!phone || !message?.trim()) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const normalizedPhone = normalizePhone(phone);
  const supabase = createServiceClient();

  const { data: lastInbound } = await supabase
    .from("whatsapp_messages")
    .select("created_at")
    .eq("normalized_phone", normalizedPhone)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const withinWindow = lastInbound && Date.now() - new Date(lastInbound.created_at).getTime() < SESSION_WINDOW_MS;

  if (!withinWindow) {
    return NextResponse.json(
      {
        error:
          "Fenêtre de 24h fermée : ce numéro ne vous a pas écrit récemment. Seul un message template WhatsApp pré-approuvé par Meta peut être envoyé dans ce cas — aucun template n'est configuré pour CHIVI actuellement.",
      },
      { status: 409 }
    );
  }

  const [{ data: profile }, driver] = await Promise.all([
    supabase.from("profiles").select("id").eq("whatsapp_phone", normalizedPhone).maybeSingle(),
    findDriverByPhone(normalizedPhone),
  ]);

  let waMessageId: string | null = null;
  try {
    const sendResult = await sendWhatsappText(normalizedPhone, message);
    waMessageId = extractMessageId(sendResult);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec de l'envoi WhatsApp" },
      { status: 502 }
    );
  }

  await supabase.from("whatsapp_messages").insert({
    profile_id: profile?.id ?? null,
    driver_id: driver?.id ?? null,
    wa_message_id: waMessageId,
    direction: "outbound",
    phone: normalizedPhone,
    message_type: "text",
    content: message,
  });

  return NextResponse.json({ sent: true });
}
