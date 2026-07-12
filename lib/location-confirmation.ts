import { createServiceClient } from "@/lib/supabase/server";
import { reverseGeocode, searchPlace } from "@/lib/nominatim";
import { extractLocationFromText } from "@/lib/location-ai";
import { haversineKm, computeDeliveryFee, KITCHEN_ORIGIN } from "@/lib/distance";
import { sendOrderRecap } from "@/lib/order-validation";
import type { FlowCartState } from "@/lib/create-order-from-flow";
import { sendAdminLocationEscalationNotification } from "@/lib/email";
import {
  sendWhatsappText,
  buildLocationConfirmationMessage,
  buildLocationNotFoundMessage,
  buildDeliveryFeeMessage,
  buildOutOfZoneMessage,
  buildLocationEscalationMessage,
} from "@/lib/whatsapp";

const GENERIC_GPS_ADDRESS = "Position partagée via GPS";
const MAX_LOCATION_ATTEMPTS = 3;

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
export async function handleGpsLocation(profileId: string | null, phone: string, lat: number, lng: number, flowToken: string | null = null) {
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
    await sendWhatsappText(phone, buildLocationConfirmationMessage(address));
  } catch (err) {
    console.error("[location-confirmation] failed to send GPS confirmation message", err);
  }
}

/** Description libre (texte ou audio transcrit) : Groq identifie le lieu, Nominatim le recherche, on redemande confirmation ("OUI"). */
export async function handleTextLocation(profileId: string | null, phone: string, text: string, flowToken: string | null = null) {
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
    await sendWhatsappText(phone, buildLocationConfirmationMessage(place.address));
  } catch (err) {
    console.error("[location-confirmation] failed to send text-location confirmation message", err);
  }
}

/**
 * Le client répond à la proposition d'adresse en texte libre : "OUI" (ou
 * variante) confirme, tout autre texte est traité comme une description
 * corrigée qui relance la détection (Groq + Nominatim) sur cette nouvelle
 * description — jusqu'à la limite de tentatives (voir tryConsumeLocationAttempt).
 */
export async function handleLocationTextReply(confirmationId: string, phone: string, replyText: string) {
  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("pending_location_confirmations")
    .select("id, candidate_address, candidate_lat, candidate_lng, profile_id, status, flow_token")
    .eq("id", confirmationId)
    .maybeSingle();

  if (!row || row.status !== "pending") return;

  if (isOuiConfirmation(replyText)) {
    await supabase.from("pending_location_confirmations").update({ status: "confirmed" }).eq("id", confirmationId);

    if (row.profile_id) {
      await supabase
        .from("profiles")
        .update({ delivery_lat: row.candidate_lat, delivery_lng: row.candidate_lng, address_details: row.candidate_address })
        .eq("id", row.profile_id);
    }

    console.log("[location-confirmation] adresse confirmée par le client", { phone, flowToken: row.flow_token });
    await applyDeliveryFee(phone, row.candidate_lat, row.candidate_lng, row.profile_id, row.flow_token, row.candidate_address);
    return;
  }

  // Pas "OUI" : le client décrit mieux sa position — on relance la détection sur ce nouveau texte.
  await supabase.from("pending_location_confirmations").update({ status: "rejected" }).eq("id", confirmationId);
  await handleTextLocation(row.profile_id, phone, replyText, row.flow_token);
}
