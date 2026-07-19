import { createServiceClient } from "@/lib/supabase/server";
import { createOrderFromFlowCart, type FlowCartState } from "@/lib/create-order-from-flow";
import {
  sendWhatsappText,
  sendOrderRecapButtons,
  sendPaymentMethodButtons,
  buildOrderRecapMessage,
  buildOrderCancelledByCustomerMessage,
  extractMessageId,
  ORDER_VALIDATE_BUTTON_ID,
  ORDER_CANCEL_BUTTON_ID,
  PAYMENT_CASH_BUTTON_ID,
  PAYMENT_MOMO_LIVRAISON_BUTTON_ID,
  PAYMENT_MOMO_AVANCE_BUTTON_ID,
} from "@/lib/whatsapp";
import type { PaymentMethod } from "@/lib/supabase/types";

/**
 * Statuts "actifs" d'une session Flow — tant qu'une commande y est, TOUS
 * les messages du client doivent être traités par la logique du flow
 * structuré, jamais par la conversation IA générique (bug critique
 * corrigé ici : un texte libre à l'étape awaiting_validation/awaiting_payment
 * ne matchait aucune branche du webhook et fuyait vers handleAiReply, qui
 * perdait tout le contexte de commande).
 */
export type ActiveFlowStatus = "cart" | "awaiting_location" | "awaiting_validation" | "awaiting_payment";
const ACTIVE_STATUSES: ActiveFlowStatus[] = ["cart", "awaiting_location", "awaiting_validation", "awaiting_payment"];

/** Au-delà de cette inactivité, une session active est considérée abandonnée et n'a plus le droit d'intercepter les messages du client — voir expireStaleFlowSession. */
const STALE_SESSION_MINUTES = 30;

/** Session Flow active (non terminale) pour ce numéro, quelle que soit l'étape — utilisé pour garantir qu'aucun message ne peut s'échapper du flow structuré. */
export async function getActiveFlowSession(phone: string): Promise<{ flowToken: string; status: ActiveFlowStatus } | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("flow_sessions")
    .select("flow_token, status")
    .eq("phone", phone)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { flowToken: data.flow_token, status: data.status as ActiveFlowStatus };
}

/**
 * Annule toute session Flow active pour ce numéro. Appelé avant de créer
 * une nouvelle session (évite les sessions orphelines quand le client
 * redéclenche "menu" sans avoir terminé — cause probable des paniers/
 * quantités incohérents observés : plusieurs sessions actives simultanées
 * rendaient ambigu "la session la plus récente" utilisée par les lookups)
 * et par la commande "RECOMMENCER".
 */
export async function cancelActiveFlowSessions(phone: string): Promise<void> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("flow_sessions")
    .update({ status: "cancelled" })
    .eq("phone", phone)
    .in("status", ACTIVE_STATUSES)
    .select("flow_token");
  if (data?.length) {
    console.log("[order-validation] sessions annulées", { phone, flowTokens: data.map((s) => s.flow_token) });
  }
}

/**
 * Expire automatiquement toute session Flow active mais inactive depuis
 * plus de STALE_SESSION_MINUTES — bug critique corrigé ici : un client qui
 * abandonne en pleine commande (ex: ne répond jamais à la demande de
 * localisation) restait bloqué indéfiniment, tout nouveau message des
 * heures/jours plus tard étant intercepté par l'ancien état au lieu d'être
 * traité comme un message frais. Distinct de 'cancelled' (annulation
 * explicite) pour garder la distinction dans l'historique.
 */
export async function expireStaleFlowSession(phone: string): Promise<boolean> {
  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - STALE_SESSION_MINUTES * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("flow_sessions")
    .update({ status: "expired" })
    .eq("phone", phone)
    .in("status", ACTIVE_STATUSES)
    .lt("updated_at", cutoff)
    .select("flow_token");

  const expired = Boolean(data?.length);
  if (expired) {
    console.log("[order-validation] session(s) Flow expirée(s) automatiquement (inactivité > 30min)", {
      phone,
      flowTokens: data!.map((s) => s.flow_token),
    });
  }
  return expired;
}

function isConfirmationText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return normalized === "oui" || normalized === "ok" || normalized.startsWith("oui ");
}

function isCancellationText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return normalized === "non" || normalized.startsWith("annul");
}

/** Le client demande explicitement à repartir de zéro — garde-fou universel, quelle que soit l'étape où le flow est bloqué. */
export async function handleFlowRestart(phone: string, profileId: string | null): Promise<void> {
  await cancelActiveFlowSessions(phone);
  const message = "D'accord, on reprend à zéro ! 😊 Écris \"menu\" quand tu es prêt à recommencer ta commande.";
  try {
    const sendResult = await sendWhatsappText(phone, message);
    const supabase = createServiceClient();
    await supabase.from("whatsapp_messages").insert({
      profile_id: profileId,
      wa_message_id: extractMessageId(sendResult),
      direction: "outbound",
      phone,
      message_type: "text",
      content: message,
    });
  } catch (err) {
    console.error("[order-validation] failed to send restart confirmation", err);
  }
}

/**
 * Le client envoie un texte libre (pas un clic bouton) alors qu'une session
 * Flow est active — au lieu de laisser fuiter vers l'IA générique (bug
 * critique), on interprète OUI/NON comme équivalents boutons quand c'est
 * sans ambiguïté, et sinon on guide clairement plutôt que de dériver vers
 * une correction en langage libre (trop fragile, cause racine de la
 * confusion observée : localisation redemandée, distance incohérente).
 */
export async function handleUnexpectedFlowMessage(phone: string, text: string, status: ActiveFlowStatus): Promise<void> {
  console.log("[order-validation] message texte inattendu pendant un flow actif", { phone, status, text });

  if (status === "awaiting_validation") {
    if (isConfirmationText(text)) {
      await handleOrderValidationReply(phone, ORDER_VALIDATE_BUTTON_ID);
      return;
    }
    if (isCancellationText(text)) {
      await handleOrderValidationReply(phone, ORDER_CANCEL_BUTTON_ID);
      return;
    }
    await sendGuardrailMessage(
      phone,
      "Je ne peux pas modifier la commande en texte libre à cette étape. 🙏 Réponds OUI pour valider le récapitulatif tel quel, NON pour l'annuler, ou RECOMMENCER pour tout reprendre à zéro."
    );
    return;
  }

  if (status === "awaiting_payment") {
    await sendGuardrailMessage(
      phone,
      "Merci d'utiliser les boutons ci-dessus 👆 pour choisir ton mode de paiement, ou réponds RECOMMENCER pour repartir de zéro."
    );
    return;
  }

  // status === "cart" : le Flow menu est censé être ouvert côté client.
  await sendGuardrailMessage(
    phone,
    "Ta commande est encore ouverte dans le Flow menu ci-dessus. 📋 Termine-la là-bas, ou réponds RECOMMENCER pour repartir de zéro."
  );
}

async function sendGuardrailMessage(phone: string, message: string): Promise<void> {
  try {
    const sendResult = await sendWhatsappText(phone, message);
    const supabase = createServiceClient();
    await supabase.from("whatsapp_messages").insert({
      wa_message_id: extractMessageId(sendResult),
      direction: "outbound",
      phone,
      message_type: "text",
      content: message,
    });
  } catch (err) {
    console.error("[order-validation] failed to send guardrail message", err);
  }
}

/** Une session Flow attend-elle la validation du récapitulatif (boutons Valider/Annuler) ? */
export async function getAwaitingValidationFlowToken(phone: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("flow_sessions")
    .select("flow_token")
    .eq("phone", phone)
    .eq("status", "awaiting_validation")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.flow_token ?? null;
}

/** Une session Flow attend-elle le choix du mode de paiement ? */
export async function getAwaitingPaymentFlowToken(phone: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("flow_sessions")
    .select("flow_token")
    .eq("phone", phone)
    .eq("status", "awaiting_payment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.flow_token ?? null;
}

/**
 * Envoie le récapitulatif + boutons Valider/Annuler une fois la position ET
 * le tarif de livraison connus. Enregistre position/tarif sur la session
 * pour que la finalisation (après "Valider" + choix du paiement) n'ait plus
 * qu'à relire flow_sessions.
 */
export async function sendOrderRecap(
  flowToken: string,
  phone: string,
  cart: FlowCartState,
  address: string,
  lat: number,
  lng: number,
  fee: number
) {
  const supabase = createServiceClient();
  const subtotal = cart.lines.reduce((s, l) => s + l.lineTotal, 0);

  await supabase
    .from("flow_sessions")
    .update({ status: "awaiting_validation", delivery_address: address, delivery_lat: lat, delivery_lng: lng, delivery_fee: fee })
    .eq("flow_token", flowToken);
  console.log("[order-validation] transition awaiting_location -> awaiting_validation", { flowToken, phone });

  const recapText = buildOrderRecapMessage({
    lines: cart.lines.map((l) => ({ productName: l.productName, variantName: l.variantName, quantity: l.quantity, lineTotal: l.lineTotal })),
    subtotal,
    deliveryFee: fee,
    address,
  });

  try {
    await sendOrderRecapButtons(phone, recapText);
  } catch (err) {
    console.error("[order-validation] failed to send recap buttons", err);
  }
}

/** Le client clique "✅ Valider" ou "❌ Annuler" sur le récapitulatif. */
export async function handleOrderValidationReply(phone: string, buttonId: string) {
  const flowToken = await getAwaitingValidationFlowToken(phone);
  if (!flowToken) {
    console.warn("[order-validation] validation button clicked but no awaiting_validation session found", { phone });
    return;
  }

  const supabase = createServiceClient();

  if (buttonId === ORDER_CANCEL_BUTTON_ID) {
    await supabase.from("flow_sessions").update({ status: "cancelled" }).eq("flow_token", flowToken);
    console.log("[order-validation] transition awaiting_validation -> cancelled", { flowToken, phone });
    try {
      await sendWhatsappText(phone, buildOrderCancelledByCustomerMessage());
    } catch (err) {
      console.error("[order-validation] failed to send cancellation message", err);
    }
    return;
  }

  if (buttonId === ORDER_VALIDATE_BUTTON_ID) {
    await supabase.from("flow_sessions").update({ status: "awaiting_payment" }).eq("flow_token", flowToken);
    console.log("[order-validation] transition awaiting_validation -> awaiting_payment", { flowToken, phone });
    try {
      await sendPaymentMethodButtons(phone);
    } catch (err) {
      console.error("[order-validation] failed to send payment method buttons", err);
    }
  }
}

const PAYMENT_METHOD_BY_BUTTON: Record<string, PaymentMethod> = {
  [PAYMENT_CASH_BUTTON_ID]: "cash_livraison",
  [PAYMENT_MOMO_LIVRAISON_BUTTON_ID]: "momo_livraison",
  [PAYMENT_MOMO_AVANCE_BUTTON_ID]: "momo_avance",
};

/** Le client choisit son mode de paiement — dernière étape, crée la commande. */
export async function handlePaymentMethodReply(phone: string, buttonId: string) {
  const paymentMethod = PAYMENT_METHOD_BY_BUTTON[buttonId];
  if (!paymentMethod) return;

  const flowToken = await getAwaitingPaymentFlowToken(phone);
  if (!flowToken) {
    console.warn("[order-validation] payment button clicked but no awaiting_payment session found", { phone });
    return;
  }

  const supabase = createServiceClient();
  const { data: session } = await supabase
    .from("flow_sessions")
    .select("profile_id, cart, delivery_address, delivery_lat, delivery_lng, delivery_fee, location_inputs")
    .eq("flow_token", flowToken)
    .maybeSingle();

  if (!session || !session.delivery_address || session.delivery_lat === null || session.delivery_lng === null || session.delivery_fee === null) {
    console.error("[order-validation] session missing delivery data at payment step", { flowToken });
    return;
  }

  await createOrderFromFlowCart({
    phone,
    profileId: session.profile_id,
    cart: session.cart as unknown as FlowCartState,
    deliveryAddress: session.delivery_address,
    deliveryLat: session.delivery_lat,
    deliveryLng: session.delivery_lng,
    deliveryFee: session.delivery_fee,
    paymentMethod,
    // Chaque élément brut (GPS, texte, audio) envoyé par le client pendant
    // la détection de position, dans l'ordre — reporté tel quel sur la
    // commande pour que l'assignation livreur puisse tout retransmettre.
    locationInputs: session.location_inputs,
  });

  await supabase.from("flow_sessions").update({ status: "completed" }).eq("flow_token", flowToken);
  console.log("[order-validation] transition awaiting_payment -> completed", { flowToken, phone, paymentMethod });
}
