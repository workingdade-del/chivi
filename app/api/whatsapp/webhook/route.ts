import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  DRIVER_AVAILABLE_BUTTON_ID,
  DRIVER_UNAVAILABLE_BUTTON_ID,
  DELIVERY_DONE_BUTTON_PREFIX,
  buildPauseAutoReply,
  buildPostDeliveryFeedbackMessage,
  buildDeliveryFeeMessage,
  buildDeliveryFeePendingMessage,
  buildDriverQuoteRequestMessage,
  buildDeliveryFeeConfirmedMessage,
  downloadWhatsappMedia,
  normalizePhone,
  sendWhatsappText,
} from "@/lib/whatsapp";
import { detectAvailabilityIntent } from "@/lib/driver-availability";
import { buildChiviSystemPrompt } from "@/lib/ai-context";
import { generateGroqReply, transcribeAudio, type ChatTurn } from "@/lib/groq";
import { KITCHEN_ORIGIN, haversineKm, computeDeliveryFee } from "@/lib/distance";
import { sanitizeText } from "@/lib/sanitize";
import { isRateLimited } from "@/lib/rate-limit";
import { verifyMetaSignature } from "@/lib/webhook-security";

// Le handshake GET lit des query params et le POST doit toujours
// s'exécuter (jamais de cache statique) pour un webhook.
export const dynamic = "force-dynamic";

/** Handshake de vérification exigé par Meta lors de la config du webhook. */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  console.log("[whatsapp-webhook] GET verify attempt", {
    mode,
    tokenReceived: token,
    tokenMatches: token === process.env.WHATSAPP_VERIFY_TOKEN,
    verifyTokenConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
  });

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("[whatsapp-webhook] GET verify OK, returning challenge");
    return new NextResponse(challenge, { status: 200 });
  }

  console.error("[whatsapp-webhook] GET verify FAILED", {
    reason: !process.env.WHATSAPP_VERIFY_TOKEN
      ? "WHATSAPP_VERIFY_TOKEN is not set in this environment"
      : mode !== "subscribe"
        ? `unexpected hub.mode: ${mode}`
        : "hub.verify_token does not match WHATSAPP_VERIFY_TOKEN",
  });
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

interface WhatsappMessage {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  audio?: { id: string; mime_type?: string };
  location?: { latitude: number; longitude: number };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
  };
}

interface WhatsappWebhookPayload {
  entry?: {
    id?: string;
    changes?: {
      value?: {
        contacts?: { profile?: { name?: string }; wa_id: string }[];
        messages?: WhatsappMessage[];
      };
      field?: string;
    }[];
  }[];
}

/**
 * Génère et envoie une réponse IA si la conversation est en mode "ia"
 * (profiles.ai_active = true). Ne doit jamais faire échouer le webhook :
 * les erreurs Groq/WhatsApp sont loggées, pas propagées.
 */
async function handleAiReply(profileId: string, phone: string) {
  const supabase = createServiceClient();

  try {
    const { data: recentMessages } = await supabase
      .from("whatsapp_messages")
      .select("direction, content")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(20);

    const history: ChatTurn[] = (recentMessages ?? [])
      .reverse()
      .filter((m) => m.content)
      .map((m) => ({ role: m.direction === "outbound" ? "assistant" : "user", content: m.content as string }));

    if (history.length === 0 || history[history.length - 1].role !== "user") {
      console.warn("[whatsapp-webhook] no trailing user turn, skipping AI reply", { profileId });
      return;
    }

    const systemPrompt = await buildChiviSystemPrompt();
    const reply = await generateGroqReply(systemPrompt, history);

    console.log("[whatsapp-webhook] Groq reply generated", { profileId, reply });

    await sendWhatsappText(phone, reply);

    const { error: logError } = await supabase.from("whatsapp_messages").insert({
      profile_id: profileId,
      direction: "outbound",
      phone,
      message_type: "text",
      content: reply,
    });
    if (logError) {
      console.error("[whatsapp-webhook] failed to log AI outbound message", logError);
    }
  } catch (err) {
    console.error("[whatsapp-webhook] AI reply FAILED", { profileId, phone, error: err });
  }
}

/**
 * Cherche un livreur actif par numéro, en normalisant des deux côtés
 * (le format stocké en base n'est pas garanti identique à celui reçu
 * de Meta). Le nombre de livreurs actifs reste petit (poignée de
 * personnes) : un scan en mémoire est largement suffisant ici.
 */
async function findDriverByPhone(phone: string): Promise<{ id: string; name: string } | null> {
  const supabase = createServiceClient();
  const { data: drivers } = await supabase.from("drivers").select("id, name, phone").eq("is_active", true);
  return drivers?.find((d) => normalizePhone(d.phone) === phone) ?? null;
}

/**
 * Un livreur clique "✅ Client livré" : commande → livrée, assignation →
 * livrée, livreur → libre, et on programme (via scheduled_messages, pas un
 * setTimeout — un serverless ne survit pas 5 minutes) le message de
 * feedback client 5 minutes plus tard.
 */
async function handleDeliveryConfirmed(driver: { id: string; name: string }, orderId: string, driverPhone: string) {
  const supabase = createServiceClient();

  const { data: order } = await supabase.from("orders").select("id, profile_id").eq("id", orderId).maybeSingle();
  if (!order) {
    console.warn("[whatsapp-webhook] delivery confirmed for unknown order", { orderId, driverId: driver.id });
    return;
  }

  await supabase.from("orders").update({ status: "livree" }).eq("id", orderId);
  await supabase
    .from("order_assignments")
    .update({ status: "livree", delivered_at: new Date().toISOString() })
    .eq("order_id", orderId)
    .eq("driver_id", driver.id);
  await supabase.from("drivers").update({ status: "libre" }).eq("id", driver.id);

  if (order.profile_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("whatsapp_phone")
      .eq("id", order.profile_id)
      .maybeSingle();

    if (profile) {
      await supabase.from("scheduled_messages").insert({
        order_id: orderId,
        phone: profile.whatsapp_phone,
        message: buildPostDeliveryFeedbackMessage(),
        send_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
    }
  }

  try {
    await sendWhatsappText(driverPhone, `Merci ${driver.name}, livraison confirmée ✅. Bonne route !`);
  } catch (err) {
    console.error("[whatsapp-webhook] failed to send delivery confirmation to driver", err);
  }
}

/**
 * Un client partage sa position WhatsApp : on calcule la distance depuis
 * la cuisine (Godomey Nonhouenou) et on applique la grille tarifaire. Au-
 * delà de 15km, pas de devinette : on prévient le client qu'on vérifie,
 * et on demande confirmation du tarif à un livreur disponible.
 */
async function handleCustomerLocation(profileId: string, phone: string, lat: number, lng: number) {
  const supabase = createServiceClient();
  const distanceKm = haversineKm(KITCHEN_ORIGIN.lat, KITCHEN_ORIGIN.lng, lat, lng);
  const { fee, needsConfirmation } = computeDeliveryFee(distanceKm);

  await supabase.from("profiles").update({ delivery_lat: lat, delivery_lng: lng }).eq("id", profileId);

  if (!needsConfirmation && fee !== null) {
    try {
      await sendWhatsappText(phone, buildDeliveryFeeMessage(distanceKm, fee));
    } catch (err) {
      console.error("[whatsapp-webhook] failed to send delivery fee message", err);
    }
    return;
  }

  try {
    await sendWhatsappText(phone, buildDeliveryFeePendingMessage());
  } catch (err) {
    console.error("[whatsapp-webhook] failed to send delivery fee pending message", err);
  }

  const { data: drivers } = await supabase
    .from("drivers")
    .select("id, name, phone")
    .eq("is_active", true)
    .eq("is_available", true)
    .eq("status", "libre");

  const driver = drivers?.[0];
  if (!driver) {
    console.warn("[whatsapp-webhook] no available driver to confirm out-of-range delivery quote", { phone, distanceKm });
    return;
  }

  await supabase.from("pending_delivery_quotes").insert({
    profile_id: profileId,
    phone,
    distance_km: distanceKm,
    driver_id: driver.id,
  });

  try {
    await sendWhatsappText(driver.phone, buildDriverQuoteRequestMessage(distanceKm));
  } catch (err) {
    console.error("[whatsapp-webhook] failed to send driver quote request", err);
  }
}

/**
 * Un livreur répond à une demande de confirmation de tarif par un simple
 * montant en texte libre (ex : "1500"). On prend la plus ancienne demande
 * en attente qui lui est assignée. Retourne false si ce n'était pas ça
 * (le texte tombe alors dans la logique de disponibilité classique).
 */
async function handleDriverQuoteReply(driver: { id: string; name: string }, driverPhone: string, rawText: string): Promise<boolean> {
  const trimmed = rawText.trim();
  if (!/^\d+([.,]\d+)?\s*(fcfa)?$/i.test(trimmed)) return false;

  const amount = parseFloat(trimmed.replace(",", ".").replace(/[^\d.]/g, ""));
  if (Number.isNaN(amount) || amount <= 0) return false;

  const supabase = createServiceClient();
  const { data: quote } = await supabase
    .from("pending_delivery_quotes")
    .select("id, phone")
    .eq("driver_id", driver.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!quote) return false;

  await supabase.from("pending_delivery_quotes").update({ status: "confirmed", quoted_fee: amount }).eq("id", quote.id);

  try {
    await sendWhatsappText(quote.phone, buildDeliveryFeeConfirmedMessage(amount));
  } catch (err) {
    console.error("[whatsapp-webhook] failed to send confirmed fee to customer", err);
  }
  try {
    await sendWhatsappText(driverPhone, `Merci ${driver.name}, tarif de ${amount.toLocaleString("fr-FR")} FCFA transmis au client ✅.`);
  } catch (err) {
    console.error("[whatsapp-webhook] failed to send quote ack to driver", err);
  }

  return true;
}

/**
 * Traite un message venant d'un numéro déjà enregistré dans `drivers`.
 * Un livreur n'est jamais traité comme un client (pas de profil créé,
 * pas de réponse IA menu) : soit un bouton ✅/❌ de disponibilité, soit un
 * bouton "Client livré", soit un mot-clé texte met à jour `is_available`,
 * soit un montant en texte libre confirme un tarif de livraison en attente.
 */
async function handleDriverMessage(driver: { id: string; name: string }, message: WhatsappMessage, phone: string) {
  const supabase = createServiceClient();

  if (message.type === "interactive" && message.interactive?.type === "button_reply") {
    const buttonId = message.interactive.button_reply?.id;
    if (buttonId?.startsWith(DELIVERY_DONE_BUTTON_PREFIX)) {
      const orderId = buttonId.slice(DELIVERY_DONE_BUTTON_PREFIX.length);
      await supabase.from("whatsapp_messages").insert({
        driver_id: driver.id,
        wa_message_id: message.id,
        direction: "inbound",
        phone,
        message_type: message.type,
        content: message.interactive.button_reply?.title ?? null,
        payload: message as unknown as Record<string, unknown>,
      });
      await handleDeliveryConfirmed(driver, orderId, phone);
      return;
    }
  }

  if (message.type === "text" && message.text?.body) {
    const handledAsQuote = await handleDriverQuoteReply(driver, phone, message.text.body);
    if (handledAsQuote) {
      await supabase.from("whatsapp_messages").insert({
        driver_id: driver.id,
        wa_message_id: message.id,
        direction: "inbound",
        phone,
        message_type: message.type,
        content: message.text.body,
        payload: message as unknown as Record<string, unknown>,
      });
      return;
    }
  }

  let nextAvailability: boolean | null = null;

  if (message.type === "interactive" && message.interactive?.type === "button_reply") {
    const buttonId = message.interactive.button_reply?.id;
    if (buttonId === DRIVER_AVAILABLE_BUTTON_ID) nextAvailability = true;
    else if (buttonId === DRIVER_UNAVAILABLE_BUTTON_ID) nextAvailability = false;
  } else if (message.type === "text" && message.text?.body) {
    nextAvailability = detectAvailabilityIntent(message.text.body);
  }

  console.log("[whatsapp-webhook] driver message", {
    driverId: driver.id,
    type: message.type,
    nextAvailability,
  });

  const update: { last_seen: string; is_available?: boolean } = { last_seen: new Date().toISOString() };
  if (nextAvailability !== null) update.is_available = nextAvailability;

  const { error } = await supabase.from("drivers").update(update).eq("id", driver.id);
  if (error) {
    console.error("[whatsapp-webhook] failed to update driver availability", { driverId: driver.id, error });
  }

  await supabase.from("whatsapp_messages").insert({
    driver_id: driver.id,
    wa_message_id: message.id,
    direction: "inbound",
    phone,
    message_type: message.type,
    content: message.text?.body ?? message.interactive?.button_reply?.title ?? null,
    payload: message as unknown as Record<string, unknown>,
  });

  if (nextAvailability !== null) {
    try {
      await sendWhatsappText(
        phone,
        nextAvailability
          ? `Merci ${driver.name}, tu es marqué disponible ✅.`
          : `Merci ${driver.name}, tu es marqué non disponible ❌.`
      );
    } catch (err) {
      console.error("[whatsapp-webhook] failed to send driver confirmation", err);
    }
  }
}

/** Réception des messages entrants : livreur (disponibilité) ou client (profil + IA). */
export async function POST(req: NextRequest) {
  if (isRateLimited("whatsapp-webhook")) {
    console.warn("[whatsapp-webhook] rate limit exceeded (>100 req/min)");
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const rawBody = await req.text();

  if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    console.error("[whatsapp-webhook] invalid X-Hub-Signature-256 — rejecting request");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: WhatsappWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsappWebhookPayload;
  } catch (err) {
    console.error("[whatsapp-webhook] POST body is not valid JSON", err);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("[whatsapp-webhook] POST received", rawBody);

  const supabase = createServiceClient();
  const entries = payload.entry ?? [];

  const { data: settings } = await supabase
    .from("system_settings")
    .select("is_paused, pause_reason")
    .eq("id", true)
    .maybeSingle();
  const isPaused = settings?.is_paused ?? false;

  if (entries.length === 0) {
    console.warn("[whatsapp-webhook] payload has no entry[] — nothing to process", payload);
  }

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value;

      if (change.field && change.field !== "messages") {
        console.log(`[whatsapp-webhook] skipping change.field=${change.field} (not "messages")`);
        continue;
      }

      if (!value?.messages?.length) {
        console.log("[whatsapp-webhook] change has no messages (likely a status update)", {
          field: change.field,
          hasStatuses: Boolean((value as { statuses?: unknown[] } | undefined)?.statuses),
        });
        continue;
      }

      for (const message of value.messages) {
        const phone = normalizePhone(message.from);
        console.log("[whatsapp-webhook] processing inbound message", {
          from: phone,
          type: message.type,
          waMessageId: message.id,
        });

        const driver = await findDriverByPhone(phone);

        if (driver) {
          console.log("[whatsapp-webhook] message is from a driver, routing to driver handler", {
            driverId: driver.id,
          });
          await handleDriverMessage(driver, message, phone);
          continue;
        }

        const contact = value.contacts?.find((c) => c.wa_id === message.from);
        const contactName = contact?.profile?.name ? sanitizeText(contact.profile.name, 120) : undefined;

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .upsert(
            { whatsapp_phone: phone, full_name: contactName },
            { onConflict: "whatsapp_phone", ignoreDuplicates: false }
          )
          .select("id, ai_active")
          .single();

        if (profileError) {
          console.error("[whatsapp-webhook] profile upsert FAILED", {
            phone,
            error: profileError,
          });
          continue;
        }

        // Un vocal est transcrit AVANT d'être loggé, pour que le texte
        // (pas juste "message audio") entre dans l'historique utilisé par
        // l'IA. Un échec de transcription dégrade gracieusement : le
        // message est quand même sauvegardé (sans contenu texte).
        let messageContent = message.text?.body ?? null;
        if (message.type === "audio" && message.audio?.id) {
          try {
            const { buffer, mimeType } = await downloadWhatsappMedia(message.audio.id);
            messageContent = await transcribeAudio(buffer, message.audio.mime_type ?? mimeType);
            console.log("[whatsapp-webhook] audio transcribed", { waMessageId: message.id, transcript: messageContent });
          } catch (err) {
            console.error("[whatsapp-webhook] audio transcription FAILED", { waMessageId: message.id, error: err });
          }
        }

        const { error: messageError } = await supabase.from("whatsapp_messages").insert({
          profile_id: profile?.id ?? null,
          wa_message_id: message.id,
          direction: "inbound",
          phone,
          message_type: message.type,
          content: messageContent,
          payload: message as unknown as Record<string, unknown>,
        });

        if (messageError) {
          console.error("[whatsapp-webhook] whatsapp_messages insert FAILED", {
            waMessageId: message.id,
            phone,
            error: messageError,
          });
          continue;
        }

        console.log("[whatsapp-webhook] message saved OK", { waMessageId: message.id, profileId: profile?.id });

        if (isPaused) {
          console.log("[whatsapp-webhook] system is paused, sending pause auto-reply", { profileId: profile?.id });
          try {
            const reply = buildPauseAutoReply(settings?.pause_reason ?? "Indisponibilité temporaire");
            await sendWhatsappText(phone, reply);
            await supabase.from("whatsapp_messages").insert({
              profile_id: profile?.id ?? null,
              direction: "outbound",
              phone,
              message_type: "text",
              content: reply,
            });
          } catch (err) {
            console.error("[whatsapp-webhook] pause auto-reply FAILED", err);
          }
        } else if (message.type === "location" && message.location && profile?.id) {
          console.log("[whatsapp-webhook] customer shared location, computing delivery fee", { profileId: profile.id });
          await handleCustomerLocation(profile.id, phone, message.location.latitude, message.location.longitude);
        } else if (profile?.ai_active && messageContent && (message.type === "text" || message.type === "audio")) {
          console.log("[whatsapp-webhook] conversation is in IA mode, generating reply", { profileId: profile.id });
          await handleAiReply(profile.id, phone);
        } else {
          console.log("[whatsapp-webhook] conversation is in manuel mode or non-text message, no auto-reply", {
            profileId: profile?.id,
            aiActive: profile?.ai_active,
            messageType: message.type,
          });
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
