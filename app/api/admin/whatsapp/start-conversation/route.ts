import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";
import {
  normalizePhone,
  sendWhatsappText,
  sendOrderTemplateMessage,
  getTemplateStatus,
  extractMessageId,
  NEW_CONVERSATION_TEMPLATE_NAME,
} from "@/lib/whatsapp";
import { findDriverByPhone } from "@/lib/drivers";

const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Démarre une conversation vers un numéro depuis la console Admin. Règle
 * Meta : un message en texte libre n'est autorisé que dans les 24h suivant
 * le dernier message reçu DE ce numéro. Hors fenêtre, seul un message
 * template pré-approuvé par Meta peut être envoyé — on utilise
 * chivi_nouvelle_commande une fois approuvé (POST /message_templates,
 * catégorie UTILITY, soumis manuellement) ; tant qu'il est en attente
 * d'approbation (24-48h chez Meta), on bloque avec un message explicite
 * plutôt que de laisser échouer l'appel Graph API sans contexte.
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

  const [{ data: lastInbound }, { data: profile }, driver] = await Promise.all([
    supabase
      .from("whatsapp_messages")
      .select("created_at")
      .eq("normalized_phone", normalizedPhone)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("profiles").select("id, full_name").eq("whatsapp_phone", normalizedPhone).maybeSingle(),
    findDriverByPhone(normalizedPhone),
  ]);

  const withinWindow = lastInbound && Date.now() - new Date(lastInbound.created_at).getTime() < SESSION_WINDOW_MS;
  const customerName = profile?.full_name || driver?.name || "Client";

  let waMessageId: string | null = null;
  let sentContent = message;
  let messageType = "text";

  if (withinWindow) {
    try {
      const sendResult = await sendWhatsappText(normalizedPhone, message);
      waMessageId = extractMessageId(sendResult);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Échec de l'envoi WhatsApp" },
        { status: 502 }
      );
    }
  } else {
    const templateStatus = await getTemplateStatus(NEW_CONVERSATION_TEMPLATE_NAME);

    if (templateStatus !== "APPROVED") {
      const detail =
        templateStatus === "PENDING"
          ? "Template en attente d'approbation Meta, patientez 24-48h."
          : templateStatus === "REJECTED"
            ? "Le template WhatsApp a été rejeté par Meta — vérifie son contenu dans le Gestionnaire WhatsApp."
            : "Aucun template WhatsApp n'est configuré pour démarrer une conversation hors fenêtre de 24h.";
      return NextResponse.json(
        {
          error: `Fenêtre de 24h fermée : ce numéro ne vous a pas écrit récemment. ${detail}`,
        },
        { status: 409 }
      );
    }

    try {
      const sendResult = await sendOrderTemplateMessage(normalizedPhone, customerName);
      waMessageId = extractMessageId(sendResult);
      messageType = "template";
      sentContent = `Template ${NEW_CONVERSATION_TEMPLATE_NAME} envoyé (fenêtre 24h fermée)`;
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Échec de l'envoi du template WhatsApp" },
        { status: 502 }
      );
    }
  }

  await supabase.from("whatsapp_messages").insert({
    profile_id: profile?.id ?? null,
    driver_id: driver?.id ?? null,
    wa_message_id: waMessageId,
    direction: "outbound",
    phone: normalizedPhone,
    message_type: messageType,
    content: sentContent,
  });

  return NextResponse.json({ sent: true, usedTemplate: !withinWindow });
}
