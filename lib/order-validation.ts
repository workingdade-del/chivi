import { createServiceClient } from "@/lib/supabase/server";
import { createOrderFromFlowCart, type FlowCartState } from "@/lib/create-order-from-flow";
import {
  sendWhatsappText,
  sendOrderRecapButtons,
  sendPaymentMethodButtons,
  buildOrderRecapMessage,
  buildOrderCancelledByCustomerMessage,
  ORDER_VALIDATE_BUTTON_ID,
  ORDER_CANCEL_BUTTON_ID,
  PAYMENT_CASH_BUTTON_ID,
  PAYMENT_MOMO_LIVRAISON_BUTTON_ID,
  PAYMENT_MOMO_AVANCE_BUTTON_ID,
} from "@/lib/whatsapp";
import type { PaymentMethod } from "@/lib/supabase/types";

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
    .select("profile_id, cart, delivery_address, delivery_lat, delivery_lng, delivery_fee")
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
  });

  await supabase.from("flow_sessions").update({ status: "completed" }).eq("flow_token", flowToken);
  console.log("[order-validation] transition awaiting_payment -> completed", { flowToken, phone, paymentMethod });
}
