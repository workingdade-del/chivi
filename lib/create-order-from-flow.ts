import { createServiceClient } from "@/lib/supabase/server";
import { sendWhatsappText, buildOrderConfirmationMessage, extractMessageId } from "@/lib/whatsapp";
import { sendAdminOrderNotification } from "@/lib/email";
import type { PaymentMethod } from "@/lib/supabase/types";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash_livraison: "Cash à la livraison",
  momo_livraison: "Mobile Money à la livraison",
  momo_avance: "Mobile Money en avance",
};

export interface FlowCartLine {
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  supplementIds: string[];
  supplementNames: string[];
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface FlowCartState {
  lines: FlowCartLine[];
}

/**
 * Finalise une commande passée via le WhatsApp Flow — le panier est déjà
 * entièrement pricé côté serveur (data endpoint), donc pas besoin de
 * recalculer les prix comme dans /api/orders. Le mode de paiement est
 * demandé en chat classique après validation du récapitulatif (le Flow n'a
 * pas d'écran de paiement).
 */
export async function createOrderFromFlowCart(params: {
  phone: string;
  profileId: string | null;
  cart: FlowCartState;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  deliveryFee: number;
  paymentMethod: PaymentMethod;
  /** Éléments bruts (GPS/texte/audio) envoyés par le client pour sa position, dans l'ordre — reportés tels quels sur la commande pour l'assignation livreur. */
  locationInputs?: unknown;
}): Promise<{ orderId: string; orderNumber: string; total: number } | null> {
  if (!params.cart.lines.length) {
    console.warn("[create-order-from-flow] empty cart, nothing to create", { phone: params.phone });
    return null;
  }

  const supabase = createServiceClient();
  const subtotal = params.cart.lines.reduce((s, l) => s + l.lineTotal, 0);
  const total = subtotal + params.deliveryFee;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      profile_id: params.profileId,
      payment_method: params.paymentMethod,
      subtotal,
      delivery_fee: params.deliveryFee,
      total,
      delivery_address: params.deliveryAddress,
      delivery_lat: params.deliveryLat,
      delivery_lng: params.deliveryLng,
      location_inputs: params.locationInputs ?? [],
    })
    .select("id, order_number")
    .single();

  if (orderError || !order) {
    console.error("[create-order-from-flow] order insert FAILED", orderError);
    return null;
  }

  for (const line of params.cart.lines) {
    const { data: orderItem } = await supabase
      .from("order_items")
      .insert({
        order_id: order.id,
        product_id: line.productId,
        product_variant_id: line.variantId,
        product_name: line.productName,
        variant_name: line.variantName,
        unit_price: line.unitPrice,
        quantity: line.quantity,
        line_total: line.lineTotal,
      })
      .select("id")
      .single();

    if (orderItem && line.supplementIds.length) {
      await supabase.from("order_supplements").insert(
        line.supplementIds.map((id, i) => ({
          order_item_id: orderItem.id,
          supplement_id: id,
          supplement_name: line.supplementNames[i] ?? "",
          unit_price: 0,
        }))
      );
    }
  }

  const itemsSummary = params.cart.lines.map((l) => `${l.quantity}x ${l.productName}`).join("\n");

  try {
    const sendResult = await sendWhatsappText(
      params.phone,
      buildOrderConfirmationMessage({
        orderNumber: order.order_number,
        total,
        itemsSummary,
        paymentLabel: PAYMENT_LABELS[params.paymentMethod],
      })
    );
    await supabase.from("whatsapp_messages").insert({
      profile_id: params.profileId,
      order_id: order.id,
      wa_message_id: extractMessageId(sendResult),
      direction: "outbound",
      phone: params.phone,
      message_type: "text",
      content: "Confirmation de commande (WhatsApp Flow)",
    });
  } catch (err) {
    console.error("[create-order-from-flow] WhatsApp confirmation send FAILED", err);
  }

  await sendAdminOrderNotification({
    orderNumber: order.order_number,
    total,
    phone: params.phone,
    address: params.deliveryAddress,
  });

  return { orderId: order.id, orderNumber: order.order_number, total };
}
