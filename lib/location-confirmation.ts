import { createServiceClient } from "@/lib/supabase/server";
import { reverseGeocode, searchPlace } from "@/lib/google-maps";
import { extractLocationFromText } from "@/lib/location-ai";
import { haversineKm, computeDeliveryFee, KITCHEN_ORIGIN } from "@/lib/distance";
import { createOrderFromFlowCart, type FlowCartState } from "@/lib/create-order-from-flow";
import {
  sendWhatsappText,
  sendWhatsappButtonMessage,
  buildLocationConfirmationMessage,
  buildLocationLowConfidenceMessage,
  buildDeliveryFeeMessage,
  buildDeliveryFeePendingMessage,
  buildDriverQuoteRequestMessage,
  LOCATION_CONFIRM_BUTTON_PREFIX,
  LOCATION_REJECT_BUTTON_PREFIX,
} from "@/lib/whatsapp";

/**
 * Calcule et applique le tarif une fois la position définitivement retenue
 * (soit confirmée par le client, soit — sans clé Google Maps configurée —
 * directement, comme avant l'ajout de l'étape de confirmation). Si la
 * position provient d'un WhatsApp Flow (flowToken renseigné), la commande
 * est finalisée directement à partir du panier de la session au lieu de
 * simplement annoncer le tarif.
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
}

/** Position GPS partagée nativement sur WhatsApp : reverse-geocode + demande de confirmation. */
export async function handleGpsLocation(profileId: string | null, phone: string, lat: number, lng: number, flowToken: string | null = null) {
  const supabase = createServiceClient();
  if (profileId) {
    await supabase.from("profiles").update({ delivery_lat: lat, delivery_lng: lng }).eq("id", profileId);
  }

  const geocoded = await reverseGeocode(lat, lng);
  if (!geocoded) {
    // Dégradation gracieuse : sans clé Google Maps, comportement direct (pas de confirmation possible sans adresse lisible).
    await applyDeliveryFee(phone, lat, lng, profileId, flowToken, "Position GPS");
    return;
  }

  const { data: row } = await supabase
    .from("pending_location_confirmations")
    .insert({
      profile_id: profileId,
      phone,
      candidate_address: geocoded.address,
      candidate_lat: lat,
      candidate_lng: lng,
      source: "gps",
      flow_token: flowToken,
    })
    .select("id")
    .single();

  if (!row) return;

  try {
    await sendWhatsappButtonMessage(phone, buildLocationConfirmationMessage(geocoded.address), [
      { id: `${LOCATION_CONFIRM_BUTTON_PREFIX}${row.id}`, title: "✅ Oui, confirmer" },
      { id: `${LOCATION_REJECT_BUTTON_PREFIX}${row.id}`, title: "❌ Non, corriger" },
    ]);
  } catch (err) {
    console.error("[location-confirmation] failed to send GPS confirmation message", err);
  }
}

/** Description libre (texte ou audio transcrit) : Groq identifie le lieu, Google Places le recherche, on redemande confirmation. */
export async function handleTextLocation(profileId: string | null, phone: string, text: string, flowToken: string | null = null) {
  const extracted = await extractLocationFromText(text);
  if (!extracted) {
    try {
      await sendWhatsappText(phone, buildLocationLowConfidenceMessage());
    } catch (err) {
      console.error("[location-confirmation] failed to send low-confidence message", err);
    }
    return;
  }

  const searchQuery = extracted.landmark || extracted.quartier || extracted.lieu || text;
  const place = await searchPlace(searchQuery);

  const lat = place?.lat ?? extracted.lat;
  const lng = place?.lng ?? extracted.lng;
  const address = place?.address || extracted.lieu;

  if (lat === null || lng === null || !address) {
    try {
      await sendWhatsappText(phone, buildLocationLowConfidenceMessage());
    } catch (err) {
      console.error("[location-confirmation] failed to send low-confidence message", err);
    }
    return;
  }

  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("pending_location_confirmations")
    .insert({
      profile_id: profileId,
      phone,
      candidate_address: address,
      candidate_lat: lat,
      candidate_lng: lng,
      source: "text",
      flow_token: flowToken,
    })
    .select("id")
    .single();

  if (!row) return;

  try {
    await sendWhatsappButtonMessage(phone, buildLocationConfirmationMessage(address), [
      { id: `${LOCATION_CONFIRM_BUTTON_PREFIX}${row.id}`, title: "✅ Oui, confirmer" },
      { id: `${LOCATION_REJECT_BUTTON_PREFIX}${row.id}`, title: "❌ Non, corriger" },
    ]);
  } catch (err) {
    console.error("[location-confirmation] failed to send text-location confirmation message", err);
  }
}

/** Le client répond ✅/❌ à la proposition d'adresse. */
export async function handleLocationConfirmationReply(confirmationId: string, confirmed: boolean, phone: string) {
  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("pending_location_confirmations")
    .select("id, candidate_address, candidate_lat, candidate_lng, profile_id, status, flow_token")
    .eq("id", confirmationId)
    .maybeSingle();

  if (!row || row.status !== "pending") return;

  if (!confirmed) {
    await supabase.from("pending_location_confirmations").update({ status: "rejected" }).eq("id", confirmationId);
    try {
      await sendWhatsappText(phone, "D'accord, décris-moi à nouveau ta position ou envoie ta localisation WhatsApp 📍");
    } catch (err) {
      console.error("[location-confirmation] failed to send rejection reply", err);
    }
    return;
  }

  await supabase.from("pending_location_confirmations").update({ status: "confirmed" }).eq("id", confirmationId);

  if (row.profile_id) {
    await supabase
      .from("profiles")
      .update({ delivery_lat: row.candidate_lat, delivery_lng: row.candidate_lng, address_details: row.candidate_address })
      .eq("id", row.profile_id);
  }

  await applyDeliveryFee(phone, row.candidate_lat, row.candidate_lng, row.profile_id, row.flow_token, row.candidate_address);
}
