import { createServiceClient } from "@/lib/supabase/server";
import { reverseGeocode, searchPlace } from "@/lib/nominatim";
import { extractLocationFromText } from "@/lib/location-ai";
import { haversineKm, computeDeliveryFee, KITCHEN_ORIGIN } from "@/lib/distance";
import { createOrderFromFlowCart, type FlowCartState } from "@/lib/create-order-from-flow";
import {
  sendWhatsappText,
  buildLocationConfirmationMessage,
  buildLocationNotFoundMessage,
  buildDeliveryFeeMessage,
  buildDeliveryFeePendingMessage,
  buildDriverQuoteRequestMessage,
} from "@/lib/whatsapp";

const GENERIC_GPS_ADDRESS = "Position partagée via GPS";

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
 * Calcule et applique le tarif une fois la position définitivement retenue
 * (après confirmation "OUI"). Si la position provient d'un WhatsApp Flow
 * (flowToken renseigné), la commande est finalisée directement à partir du
 * panier de la session au lieu de simplement annoncer le tarif.
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

  if (!needsConfirmation && fee !== null) {
    if (flowToken) {
      await finalizeFlowOrder(flowToken, phone, profileId, address, lat, lng, fee);
      return;
    }
    try {
      await sendWhatsappText(phone, buildDeliveryFeeMessage(distanceKm, fee));
    } catch (err) {
      console.error("[location-confirmation] failed to send delivery fee message", err);
    }
    return;
  }

  try {
    await sendWhatsappText(phone, buildDeliveryFeePendingMessage());
  } catch (err) {
    console.error("[location-confirmation] failed to send delivery fee pending message", err);
  }

  const supabase = createServiceClient();
  const { data: drivers } = await supabase
    .from("drivers")
    .select("id, name, phone")
    .eq("is_active", true)
    .eq("is_available", true)
    .eq("status", "libre");

  const driver = drivers?.[0];
  if (!driver) {
    console.warn("[location-confirmation] no available driver to confirm out-of-range delivery quote", { phone, distanceKm });
    return;
  }

  await supabase.from("pending_delivery_quotes").insert({ profile_id: profileId, phone, distance_km: distanceKm, driver_id: driver.id });

  try {
    await sendWhatsappText(driver.phone, buildDriverQuoteRequestMessage(distanceKm));
  } catch (err) {
    console.error("[location-confirmation] failed to send driver quote request", err);
  }
}

/** Une fois une commande WhatsApp Flow au stade localisation, on la finalise directement plutôt que de juste annoncer le tarif. */
async function finalizeFlowOrder(
  flowToken: string,
  phone: string,
  profileId: string | null,
  address: string,
  lat: number,
  lng: number,
  fee: number
) {
  const supabase = createServiceClient();
  const { data: session } = await supabase.from("flow_sessions").select("cart").eq("flow_token", flowToken).maybeSingle();
  if (!session) {
    console.warn("[location-confirmation] no flow_session found for flow_token", { flowToken });
    return;
  }

  await createOrderFromFlowCart({
    phone,
    profileId,
    cart: session.cart as unknown as FlowCartState,
    deliveryAddress: address,
    deliveryLat: lat,
    deliveryLng: lng,
    deliveryFee: fee,
  });

  await supabase.from("flow_sessions").update({ status: "completed" }).eq("flow_token", flowToken);
}

/** Position GPS partagée nativement sur WhatsApp : reverse-geocode Nominatim + demande de confirmation texte ("OUI"). */
export async function handleGpsLocation(profileId: string | null, phone: string, lat: number, lng: number, flowToken: string | null = null) {
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
 * description.
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

    await applyDeliveryFee(phone, row.candidate_lat, row.candidate_lng, row.profile_id, row.flow_token, row.candidate_address);
    return;
  }

  // Pas "OUI" : le client décrit mieux sa position — on relance la détection sur ce nouveau texte.
  await supabase.from("pending_location_confirmations").update({ status: "rejected" }).eq("id", confirmationId);
  await handleTextLocation(row.profile_id, phone, replyText, row.flow_token);
}
