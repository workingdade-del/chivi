import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  DRIVER_AVAILABLE_BUTTON_ID,
  DRIVER_UNAVAILABLE_BUTTON_ID,
  buildPauseAutoReply,
  normalizePhone,
  sendWhatsappText,
} from "@/lib/whatsapp";
import { detectAvailabilityIntent } from "@/lib/driver-availability";
import { buildChiviSystemPrompt } from "@/lib/ai-context";
import { generateGroqReply, type ChatTurn } from "@/lib/groq";

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
 * Traite un message venant d'un numéro déjà enregistré dans `drivers`.
 * Un livreur n'est jamais traité comme un client (pas de profil créé,
 * pas de réponse IA menu) : soit un bouton ✅/❌, soit un mot-clé texte
 * met à jour `is_available`.
 */
async function handleDriverMessage(driver: { id: string; name: string }, message: WhatsappMessage, phone: string) {
  const supabase = createServiceClient();

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
  let payload: WhatsappWebhookPayload;
  try {
    payload = (await req.json()) as WhatsappWebhookPayload;
  } catch (err) {
    console.error("[whatsapp-webhook] POST body is not valid JSON", err);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("[whatsapp-webhook] POST received", JSON.stringify(payload));

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

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .upsert(
            { whatsapp_phone: phone, full_name: contact?.profile?.name },
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

        const { error: messageError } = await supabase.from("whatsapp_messages").insert({
          profile_id: profile?.id ?? null,
          wa_message_id: message.id,
          direction: "inbound",
          phone,
          message_type: message.type,
          content: message.text?.body ?? null,
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
        } else if (profile?.ai_active && message.type === "text" && message.text?.body) {
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
