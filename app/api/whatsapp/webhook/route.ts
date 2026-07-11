import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  DRIVER_AVAILABLE_BUTTON_ID,
  DRIVER_UNAVAILABLE_BUTTON_ID,
  DELIVERY_DONE_BUTTON_PREFIX,
  buildPauseAutoReply,
  buildPostDeliveryFeedbackMessage,
  buildDeliveryFeeConfirmedMessage,
  buildLocationRequestMessage,
  downloadWhatsappMedia,
  normalizePhone,
  sendWhatsappText,
  sendWhatsappFlow,
  extractMessageId,
} from "@/lib/whatsapp";
import { detectAvailabilityIntent } from "@/lib/driver-availability";
import { buildChiviSystemPrompt } from "@/lib/ai-context";
import { generateGroqReply, transcribeAudio, type ChatTurn } from "@/lib/groq";
import { sanitizeText } from "@/lib/sanitize";
import { isRateLimited } from "@/lib/rate-limit";
import { verifyMetaSignature } from "@/lib/webhook-security";
import {
  handleGpsLocation,
  handleTextLocation,
  handleLocationTextReply,
  getPendingConfirmationId,
  getAwaitingLocationFlowToken,
} from "@/lib/location-confirmation";

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
    nfm_reply?: { response_json: string; body: string; name: string };
  };
}

interface WhatsappStatus {
  id: string;
  status: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: { code: number; title: string; message?: string; error_data?: { details?: string } }[];
}

interface WhatsappWebhookPayload {
  entry?: {
    id?: string;
    changes?: {
      value?: {
        contacts?: { profile?: { name?: string }; wa_id: string }[];
        messages?: WhatsappMessage[];
        statuses?: WhatsappStatus[];
      };
      field?: string;
    }[];
  }[];
}

/**
 * Un envoi accepté par l'API (200 OK) peut ensuite échouer à la livraison
 * (numéro pas sur WhatsApp, fenêtre de réengagement de 24h expirée,
 * destinataire ayant bloqué le compte business, etc.) — Meta ne le
 * signale que via ce callback asynchrone "statuses", jusqu'ici reçu et
 * silencieusement jeté. On logue tout le détail et on le persiste sur le
 * message concerné (retrouvé par wa_message_id) pour que l'échec soit
 * visible ailleurs que dans les logs serveur.
 */
async function handleStatusUpdates(statuses: WhatsappStatus[]) {
  const supabase = createServiceClient();
  for (const status of statuses) {
    const hasErrors = Boolean(status.errors?.length);
    if (hasErrors) {
      console.error("[whatsapp-webhook] delivery status FAILED", {
        waMessageId: status.id,
        status: status.status,
        recipient: status.recipient_id,
        errors: status.errors,
      });
    } else {
      console.log("[whatsapp-webhook] delivery status update", {
        waMessageId: status.id,
        status: status.status,
        recipient: status.recipient_id,
      });
    }

    const { error } = await supabase
      .from("whatsapp_messages")
      .update({
        delivery_status: status.status,
        delivery_error: hasErrors ? JSON.stringify(status.errors) : null,
      })
      .eq("wa_message_id", status.id);

    if (error) {
      console.error("[whatsapp-webhook] failed to persist delivery status", { waMessageId: status.id, error });
    }
  }
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

    const sendResult = await sendWhatsappText(phone, reply);

    const { error: logError } = await supabase.from("whatsapp_messages").insert({
      profile_id: profileId,
      wa_message_id: extractMessageId(sendResult),
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

const FLOW_TRIGGER_KEYWORDS = ["menu", "commander", "commande", "je veux", "carte"];

/** "menu" / "commander" / "commande" déclenche l'envoi du WhatsApp Flow de commande in-app. */
function isFlowTrigger(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return FLOW_TRIGGER_KEYWORDS.some((k) => normalized.includes(k));
}

/** Crée une session panier (flow_sessions) et envoie le Flow. Ne doit jamais faire échouer le webhook. */
async function handleFlowTrigger(profileId: string | null, phone: string) {
  const supabase = createServiceClient();
  const { data: session, error } = await supabase
    .from("flow_sessions")
    .insert({ profile_id: profileId, phone, cart: { lines: [], currentCategory: null } })
    .select("flow_token")
    .single();

  if (error || !session) {
    console.error("[whatsapp-webhook] failed to create flow_session", error);
    return;
  }

  try {
    await sendWhatsappFlow(phone, session.flow_token);
  } catch (err) {
    console.error("[whatsapp-webhook] failed to send WhatsApp Flow", err);
  }
}

/**
 * Le Flow se termine (écran CART, bouton "Commander", action "complete") :
 * Meta renvoie un message interactif nfm_reply dans le webhook normal des
 * messages (pas le data endpoint). Le Flow ne collecte pas la position —
 * on la demande ensuite en chat classique, et on marque la session comme
 * "awaiting_location" pour que le prochain message de ce client soit
 * traité comme sa position de livraison plutôt qu'une conversation IA.
 */
async function handleFlowCompletion(phone: string, nfmReply: { response_json: string }) {
  try {
    const responseData = JSON.parse(nfmReply.response_json) as { flow_token?: string };

    // Le flow_token n'est pas garanti d'être répété dans response_json selon
    // la config du Flow — on retombe sur la session la plus récente pour ce
    // numéro, qui est en pratique la session panier qui vient de se terminer.
    let flowToken = responseData.flow_token ?? null;
    const supabase = createServiceClient();
    if (!flowToken) {
      const { data: recentSession } = await supabase
        .from("flow_sessions")
        .select("flow_token")
        .eq("phone", phone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      flowToken = recentSession?.flow_token ?? null;
    }

    if (!flowToken) {
      console.warn("[whatsapp-webhook] flow completion but no flow_session found", { phone });
      return;
    }

    await supabase.from("flow_sessions").update({ status: "awaiting_location" }).eq("flow_token", flowToken);

    try {
      await sendWhatsappText(phone, buildLocationRequestMessage());
    } catch (err) {
      console.error("[whatsapp-webhook] failed to send location request message", err);
    }
  } catch (err) {
    console.error("[whatsapp-webhook] failed to handle flow completion", err);
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
  // Tri déterministe : un index unique empêche désormais deux livreurs
  // actifs de partager un numéro (voir migration 0023), mais si jamais ce
  // n'était pas le cas, mieux vaut un résultat stable et prévisible que
  // l'ordre non garanti que Postgres renverrait sans ce tri.
  const { data: drivers } = await supabase
    .from("drivers")
    .select("id, name, phone")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  return drivers?.find((d) => normalizePhone(d.phone) === phone) ?? null;
}

/**
 * Un livreur clique "✅ Client livré" : commande → livrée, assignation →
 * livrée, livreur → libre, et le message de feedback part immédiatement
 * au client (Vercel Hobby n'autorise pas de cron plus fréquent qu'une
 * fois par jour, donc pas de file d'attente différée ici).
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
      try {
        const sendResult = await sendWhatsappText(profile.whatsapp_phone, buildPostDeliveryFeedbackMessage());
        await supabase.from("whatsapp_messages").insert({
          profile_id: order.profile_id,
          order_id: orderId,
          wa_message_id: extractMessageId(sendResult),
          direction: "outbound",
          phone: profile.whatsapp_phone,
          message_type: "text",
          content: "Message de feedback post-livraison",
        });
      } catch (err) {
        console.error("[whatsapp-webhook] failed to send post-delivery feedback message", err);
      }
    }
  }

  try {
    await sendWhatsappText(driverPhone, `Merci ${driver.name}, livraison confirmée ✅. Bonne route !`);
  } catch (err) {
    console.error("[whatsapp-webhook] failed to send delivery confirmation to driver", err);
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
        if (value?.statuses?.length) {
          await handleStatusUpdates(value.statuses);
        } else {
          console.log("[whatsapp-webhook] change has no messages and no statuses", { field: change.field });
        }
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

        const pendingConfirmationId = messageContent && message.type === "text" ? await getPendingConfirmationId(phone) : null;
        const awaitingLocationFlowToken =
          !pendingConfirmationId && (message.type === "text" || message.type === "location")
            ? await getAwaitingLocationFlowToken(phone)
            : null;

        if (isPaused) {
          console.log("[whatsapp-webhook] system is paused, sending pause auto-reply", { profileId: profile?.id });
          try {
            const reply = buildPauseAutoReply(settings?.pause_reason ?? "Indisponibilité temporaire");
            const sendResult = await sendWhatsappText(phone, reply);
            await supabase.from("whatsapp_messages").insert({
              profile_id: profile?.id ?? null,
              wa_message_id: extractMessageId(sendResult),
              direction: "outbound",
              phone,
              message_type: "text",
              content: reply,
            });
          } catch (err) {
            console.error("[whatsapp-webhook] pause auto-reply FAILED", err);
          }
        } else if (pendingConfirmationId && messageContent) {
          console.log("[whatsapp-webhook] customer replying to a pending location confirmation", { profileId: profile?.id });
          await handleLocationTextReply(pendingConfirmationId, phone, messageContent);
        } else if (message.type === "location" && message.location) {
          console.log("[whatsapp-webhook] customer shared location, requesting confirmation", { profileId: profile?.id });
          await handleGpsLocation(profile?.id ?? null, phone, message.location.latitude, message.location.longitude, awaitingLocationFlowToken);
        } else if (message.type === "interactive" && message.interactive?.type === "nfm_reply" && message.interactive.nfm_reply) {
          console.log("[whatsapp-webhook] WhatsApp Flow completed", { profileId: profile?.id });
          await handleFlowCompletion(phone, message.interactive.nfm_reply);
        } else if (awaitingLocationFlowToken && messageContent && (message.type === "text" || message.type === "audio")) {
          console.log("[whatsapp-webhook] customer replying with delivery location after Flow checkout", { profileId: profile?.id });
          await handleTextLocation(profile?.id ?? null, phone, messageContent, awaitingLocationFlowToken);
        } else if (messageContent && message.type === "text" && isFlowTrigger(messageContent)) {
          console.log("[whatsapp-webhook] flow trigger keyword detected, sending WhatsApp Flow", { profileId: profile?.id });
          await handleFlowTrigger(profile?.id ?? null, phone);
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
