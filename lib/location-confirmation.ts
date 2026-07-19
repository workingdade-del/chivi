import { createServiceClient } from "@/lib/supabase/server";
import { reverseGeocode, searchPlace } from "@/lib/nominatim";
import { extractLocationFromText } from "@/lib/location-ai";
import { haversineKm, computeDeliveryFee, KITCHEN_ORIGIN } from "@/lib/distance";
import { sendOrderRecap } from "@/lib/order-validation";
import type { FlowCartState } from "@/lib/create-order-from-flow";
import { sendAdminLocationEscalationNotification } from "@/lib/email";
import {
  sendWhatsappText,
  sendLocationConfirmationButtons,
  buildLocationNotFoundMessage,
  buildLocationRejectionPromptMessage,
  buildDeliveryFeeMessage,
  buildOutOfZoneMessage,
  buildLocationEscalationMessage,
} from "@/lib/whatsapp";

interface PendingConfirmationRow {
  id: string;
  candidate_address: string;
  candidate_lat: number;
  candidate_lng: number;
  profile_id: string | null;
  status: string;
  flow_token: string | null;
}

/**
 * Élément brut envoyé par le client au sujet de sa position, conservé tel
 * quel (sans filtrage/interprétation) pour pouvoir être retransmis au
 * livreur à l'assignation — l'adressage au Bénin est souvent imprécis et le
 * libellé généré par l'IA/Nominatim peut perdre des détails utiles.
 */
export interface RawLocationInput {
  type: "gps" | "text" | "audio";
  content: string | null;
  lat?: number;
  lng?: number;
  mediaPath?: string | null;
  mediaMimeType?: string | null;
  waMessageId: string | null;
  createdAt: string;
}

/** Ajoute un élément brut à l'historique de localisation de la session Flow — no-op hors contexte Flow (flowToken null). */
async function appendLocationInput(flowToken: string | null, input: Omit<RawLocationInput, "createdAt">): Promise<void> {
  if (!flowToken) return;
  const supabase = createServiceClient();
  const { data: session } = await supabase
    .from("flow_sessions")
    .select("location_inputs")
    .eq("flow_token", flowToken)
    .maybeSingle();
  const existing = ((session?.location_inputs as unknown as RawLocationInput[]) ?? []) as RawLocationInput[];
  const updated = [...existing, { ...input, createdAt: new Date().toISOString() }];
  await supabase.from("flow_sessions").update({ location_inputs: updated as unknown }).eq("flow_token", flowToken);
}

const GENERIC_GPS_ADDRESS = "Position partagée via GPS";
const MAX_LOCATION_ATTEMPTS = 3;
/** Doit rester alignée avec STALE_SESSION_MINUTES dans lib/order-validation.ts. */
const STALE_SESSION_MINUTES = 30;

/** Y a-t-il une confirmation d'adresse en attente pour ce numéro ? Détermine si le prochain texte doit être routé vers handleLocationTextReply. */
export async function getPendingConfirmationId(phone: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("pending_location_confirmations")
    .select("id")
    .eq("phone", phone)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function markPendingConfirmationsRejected(phone: string, cutoffIso?: string): Promise<boolean> {
  const supabase = createServiceClient();
  let query = supabase.from("pending_location_confirmations").update({ status: "rejected" }).eq("phone", phone).eq("status", "pending");
  if (cutoffIso) query = query.lt("created_at", cutoffIso);
  const { data } = await query.select("id");
  return Boolean(data?.length);
}

/** Expire toute confirmation de position en attente depuis plus de STALE_SESSION_MINUTES — pendant du même bug que expireStaleFlowSession côté flow_sessions. */
export async function expireStalePendingConfirmation(phone: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - STALE_SESSION_MINUTES * 60 * 1000).toISOString();
  const changed = await markPendingConfirmationsRejected(phone, cutoff);
  if (changed) {
    console.log("[location-confirmation] confirmation(s) de position expirée(s) automatiquement (inactivité > 30min)", { phone });
  }
  return changed;
}

/** Annule immédiatement toute confirmation de position en attente, quel que soit son âge — appelé quand un mot-clé de reset est détecté (annuler/recommencer/bonjour/salut/menu/...), qui doit TOUJOURS avoir la priorité sur un état bloqué. */
export async function cancelPendingLocationConfirmations(phone: string): Promise<void> {
  const changed = await markPendingConfirmationsRejected(phone);
  if (changed) {
    console.log("[location-confirmation] confirmation(s) de position annulée(s) (mot-clé de reset)", { phone });
  }
}

/** Une session Flow attend-elle la position de livraison de ce client ? */
export async function getAwaitingLocationFlowToken(phone: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("flow_sessions")
    .select("flow_token")
    .eq("phone", phone)
    .eq("status", "awaiting_location")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.flow_token ?? null;
}

/** "oui" / "ok" (accents et casse ignorés) — confirmation en texte libre plutôt qu'un bouton. */
export function isOuiConfirmation(text: string): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  return normalized === "oui" || normalized === "ok" || normalized.startsWith("oui ");
}

/**
 * Consomme une tentative de détection de position pour cette session Flow.
 * Retourne false si la limite (3) est déjà atteinte — l'appelant doit alors
 * escalader plutôt que relancer Groq/Nominatim indéfiniment. Sans flowToken
 * (position hors contexte d'une commande en cours), aucune limite ne
 * s'applique.
 */
async function tryConsumeLocationAttempt(flowToken: string | null): Promise<boolean> {
  if (!flowToken) return true;

  const supabase = createServiceClient();
  const { data: session } = await supabase
    .from("flow_sessions")
    .select("location_attempts")
    .eq("flow_token", flowToken)
    .maybeSingle();
  const attempts = session?.location_attempts ?? 0;

  if (attempts >= MAX_LOCATION_ATTEMPTS) {
    return false;
  }

  await supabase.from("flow_sessions").update({ location_attempts: attempts + 1 }).eq("flow_token", flowToken);
  console.log("[location-confirmation] tentative de localisation", { flowToken, attempt: attempts + 1, max: MAX_LOCATION_ATTEMPTS });
  return true;
}

/** Après 3 échecs : on arrête d'insister, on prévient le client, on coupe l'IA sur cette conversation et on notifie l'admin. */
async function escalateLocationFailure(phone: string, profileId: string | null, flowToken: string) {
  const supabase = createServiceClient();
  console.log("[location-confirmation] transition awaiting_location -> escalated (limite de tentatives atteinte)", { phone, flowToken });

  try {
    await sendWhatsappText(phone, buildLocationEscalationMessage());
  } catch (err) {
    console.error("[location-confirmation] failed to send escalation message", err);
  }

  if (profileId) {
    await supabase.from("profiles").update({ ai_active: false }).eq("id", profileId);
  }
  await supabase.from("flow_sessions").update({ status: "escalated" }).eq("flow_token", flowToken);

  await sendAdminLocationEscalationNotification({ phone }).catch((err) =>
    console.error("[location-confirmation] admin escalation email FAILED", err)
  );
}

/**
 * Calcule le tarif une fois la position définitivement retenue (après
 * confirmation "OUI"). Au-delà de 15km (hors zone Cotonou / Abomey-Calavi),
 * on refuse proprement plutôt que de laisser espérer une livraison qui
 * n'aura pas lieu. En dessous, si la position vient d'un WhatsApp Flow
 * (flowToken renseigné), on passe au récapitulatif + validation plutôt que
 * de finaliser directement la commande.
 */
async function applyDeliveryFee(
  phone: string,
  lat: number,
  lng: number,
  profileId: string | null,
  flowToken: string | null,
  address: string
) {
  const distanceKm = haversineKm(KITCHEN_ORIGIN.lat, KITCHEN_ORIGIN.lng, lat, lng);
  const { fee, needsConfirmation } = computeDeliveryFee(distanceKm);

  if (needsConfirmation || fee === null) {
    console.log("[location-confirmation] adresse hors zone de livraison", { phone, distanceKm, flowToken });
    try {
      await sendWhatsappText(phone, buildOutOfZoneMessage());
    } catch (err) {
      console.error("[location-confirmation] failed to send out-of-zone message", err);
    }
    if (flowToken) {
      const supabase = createServiceClient();
      await supabase.from("flow_sessions").update({ status: "cancelled" }).eq("flow_token", flowToken);
      console.log("[location-confirmation] transition -> cancelled (hors zone)", { flowToken });
    }
    return;
  }

  if (flowToken) {
    const supabase = createServiceClient();
    const { data: session } = await supabase.from("flow_sessions").select("cart").eq("flow_token", flowToken).maybeSingle();
    if (!session) {
      console.warn("[location-confirmation] no flow_session found for flow_token", { flowToken });
      return;
    }
    await sendOrderRecap(flowToken, phone, session.cart as unknown as FlowCartState, address, lat, lng, fee);
    return;
  }

  try {
    await sendWhatsappText(phone, buildDeliveryFeeMessage(distanceKm, fee));
  } catch (err) {
    console.error("[location-confirmation] failed to send delivery fee message", err);
  }
}

/** Position GPS partagée nativement sur WhatsApp : reverse-geocode Nominatim + demande de confirmation texte ("OUI"). */
export async function handleGpsLocation(
  profileId: string | null,
  phone: string,
  lat: number,
  lng: number,
  flowToken: string | null = null,
  waMessageId: string | null = null
) {
  await appendLocationInput(flowToken, { type: "gps", content: null, lat, lng, waMessageId });

  if (flowToken) {
    const canProceed = await tryConsumeLocationAttempt(flowToken);
    if (!canProceed) {
      await escalateLocationFailure(phone, profileId, flowToken);
      return;
    }
  }

  const supabase = createServiceClient();
  if (profileId) {
    await supabase.from("profiles").update({ delivery_lat: lat, delivery_lng: lng }).eq("id", profileId);
  }

  const geocoded = await reverseGeocode(lat, lng);
  const address = geocoded?.address ?? GENERIC_GPS_ADDRESS;

  const { data: row } = await supabase
    .from("pending_location_confirmations")
    .insert({
      profile_id: profileId,
      phone,
      candidate_address: address,
      candidate_lat: lat,
      candidate_lng: lng,
      source: "gps",
      flow_token: flowToken,
    })
    .select("id")
    .single();

  if (!row) return;

  try {
    await sendLocationConfirmationButtons(phone, address);
  } catch (err) {
    console.error("[location-confirmation] failed to send GPS confirmation buttons", err);
  }
}

/** Description libre (texte ou audio transcrit) : Groq identifie le lieu, Nominatim le recherche, on redemande confirmation ("OUI"). */
export async function handleTextLocation(
  profileId: string | null,
  phone: string,
  text: string,
  flowToken: string | null = null,
  rawInput?: { type: "text" | "audio"; waMessageId: string | null; mediaPath?: string | null; mediaMimeType?: string | null }
) {
  await appendLocationInput(flowToken, {
    type: rawInput?.type ?? "text",
    content: text,
    mediaPath: rawInput?.mediaPath ?? null,
    mediaMimeType: rawInput?.mediaMimeType ?? null,
    waMessageId: rawInput?.waMessageId ?? null,
  });

  if (flowToken) {
    const canProceed = await tryConsumeLocationAttempt(flowToken);
    if (!canProceed) {
      await escalateLocationFailure(phone, profileId, flowToken);
      return;
    }
  }

  const extracted = await extractLocationFromText(text);
  if (!extracted) {
    try {
      await sendWhatsappText(phone, buildLocationNotFoundMessage());
    } catch (err) {
      console.error("[location-confirmation] failed to send not-found message", err);
    }
    return;
  }

  const searchQuery = extracted.rechercheNominatim || extracted.quartier || extracted.lieu || text;
  const place = await searchPlace(searchQuery);

  if (!place) {
    try {
      await sendWhatsappText(phone, buildLocationNotFoundMessage());
    } catch (err) {
      console.error("[location-confirmation] failed to send not-found message", err);
    }
    return;
  }

  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("pending_location_confirmations")
    .insert({
      profile_id: profileId,
      phone,
      candidate_address: place.address,
      candidate_lat: place.lat,
      candidate_lng: place.lng,
      source: "text",
      flow_token: flowToken,
    })
    .select("id")
    .single();

  if (!row) return;

  try {
    await sendLocationConfirmationButtons(phone, place.address);
  } catch (err) {
    console.error("[location-confirmation] failed to send text-location confirmation buttons", err);
  }
}

async function loadPendingConfirmation(confirmationId: string): Promise<PendingConfirmationRow | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("pending_location_confirmations")
    .select("id, candidate_address, candidate_lat, candidate_lng, profile_id, status, flow_token")
    .eq("id", confirmationId)
    .maybeSingle();
  return data;
}

async function confirmPendingLocation(row: PendingConfirmationRow, phone: string) {
  const supabase = createServiceClient();
  await supabase.from("pending_location_confirmations").update({ status: "confirmed" }).eq("id", row.id);

  if (row.profile_id) {
    await supabase
      .from("profiles")
      .update({ delivery_lat: row.candidate_lat, delivery_lng: row.candidate_lng, address_details: row.candidate_address })
      .eq("id", row.profile_id);
  }

  console.log("[location-confirmation] adresse confirmée par le client", { phone, flowToken: row.flow_token });
  await applyDeliveryFee(phone, row.candidate_lat, row.candidate_lng, row.profile_id, row.flow_token, row.candidate_address);
}

/**
 * Le client répond à la proposition d'adresse en texte libre : "OUI" (ou
 * variante) confirme, tout autre texte est traité comme une description
 * corrigée qui relance la détection (Groq + Nominatim) sur cette nouvelle
 * description — jusqu'à la limite de tentatives (voir tryConsumeLocationAttempt).
 * Repli conservé pour les clients qui tapent au lieu de cliquer sur les
 * boutons (voir handleLocationConfirmButtonReply / handleLocationRejectButtonReply).
 */
export async function handleLocationTextReply(confirmationId: string, phone: string, replyText: string, waMessageId: string | null = null) {
  const row = await loadPendingConfirmation(confirmationId);
  if (!row || row.status !== "pending") return;

  if (isOuiConfirmation(replyText)) {
    await confirmPendingLocation(row, phone);
    return;
  }

  // Pas "OUI" : le client décrit mieux sa position — on relance la détection sur ce nouveau texte.
  const supabase = createServiceClient();
  await supabase.from("pending_location_confirmations").update({ status: "rejected" }).eq("id", confirmationId);
  await handleTextLocation(row.profile_id, phone, replyText, row.flow_token, { type: "text", waMessageId });
}

/** Le client clique "✅ Oui c'est ça" sur la proposition d'adresse. */
export async function handleLocationConfirmButtonReply(phone: string): Promise<void> {
  const confirmationId = await getPendingConfirmationId(phone);
  if (!confirmationId) {
    console.warn("[location-confirmation] confirm button clicked but no pending confirmation found", { phone });
    return;
  }
  const row = await loadPendingConfirmation(confirmationId);
  if (!row || row.status !== "pending") return;
  await confirmPendingLocation(row, phone);
}

/** Le client clique "❌ Non, je précise" — on marque la proposition rejetée et on l'invite à redécrire sa position (aucun nouveau texte n'accompagne un clic bouton, contrairement au repli texte libre). */
export async function handleLocationRejectButtonReply(phone: string): Promise<void> {
  const confirmationId = await getPendingConfirmationId(phone);
  if (!confirmationId) {
    console.warn("[location-confirmation] reject button clicked but no pending confirmation found", { phone });
    return;
  }
  const supabase = createServiceClient();
  await supabase.from("pending_location_confirmations").update({ status: "rejected" }).eq("id", confirmationId);
  try {
    await sendWhatsappText(phone, buildLocationRejectionPromptMessage());
  } catch (err) {
    console.error("[location-confirmation] failed to send rejection prompt", err);
  }
}
