import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";
import { sanitizeText } from "@/lib/sanitize";
import { sendWhatsappText, sendDriverDeliveryAssignment, buildOrderConfirmationMessage, extractMessageId } from "@/lib/whatsapp";
import type { OrderStatus, PaymentMethod } from "@/lib/supabase/types";

interface CreateItemPayload {
  productId: string | null;
  productVariantId: string | null;
  productName: string;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  supplements: { supplementId: string | null; supplementName: string }[];
}

const PAYMENT_LABELS: Record<string, string> = {
  cash_livraison: "Cash à la livraison",
  momo_livraison: "Mobile Money à la livraison",
  momo_avance: "Mobile Money en avance",
};

/**
 * Création manuelle d'une commande depuis l'Admin (bouton "Nouvelle
 * commande"). Source "admin_manual", silencieuse par défaut — comme
 * /commande-log — sauf si l'admin coche explicitement "Notifier".
 * order_items/order_supplements/orders(insert) n'ont aucune policy RLS
 * pour "authenticated", d'où le passage par le service role ici.
 */
export async function POST(req: NextRequest) {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    clientId?: string;
    clientName?: string;
    clientPhone?: string;
    items?: CreateItemPayload[];
    paymentMethod?: PaymentMethod;
    status?: OrderStatus;
    /** "YYYY-MM-DD" — pour saisir une commande passée. Par défaut : maintenant. */
    orderDate?: string;
    deliveryAddress?: string;
    deliveryFee?: number;
    driverId?: string;
    notify?: boolean;
  };

  if (!body.items || body.items.length === 0) {
    return NextResponse.json({ error: "La commande doit contenir au moins un article." }, { status: 400 });
  }
  if (!body.clientId && !(body.clientName && body.clientPhone)) {
    return NextResponse.json({ error: "Client requis (sélection ou création)." }, { status: 400 });
  }
  if (!body.paymentMethod) {
    return NextResponse.json({ error: "Mode de paiement requis." }, { status: 400 });
  }

  const supabase = createServiceClient();

  let profileId = body.clientId ?? null;
  if (!profileId) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .upsert(
        { whatsapp_phone: body.clientPhone!, full_name: sanitizeText(body.clientName!, 100) },
        { onConflict: "whatsapp_phone", ignoreDuplicates: false }
      )
      .select("id")
      .single();
    if (profileError || !profile) {
      return NextResponse.json({ error: profileError?.message ?? "Échec de création du client" }, { status: 500 });
    }
    profileId = profile.id;
  }

  const status: OrderStatus = body.status ?? "recue";
  const deliveryFee = body.deliveryFee && !Number.isNaN(body.deliveryFee) ? body.deliveryFee : 0;
  const subtotal = body.items.reduce((s, i) => s + i.lineTotal, 0);
  const total = subtotal + deliveryFee;

  // Saisie d'une commande passée : on fixe created_at à midi ce jour-là
  // plutôt qu'à minuit pile, pour rester loin de toute frontière de jour
  // (voir le fuseau Cotonou vs UTC serveur documenté dans lib/admin.ts).
  const createdAt = body.orderDate ? `${body.orderDate}T12:00:00.000Z` : undefined;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      profile_id: profileId,
      status,
      payment_status: status === "livree" ? "paye" : "en_attente",
      payment_method: body.paymentMethod,
      subtotal,
      delivery_fee: deliveryFee,
      total,
      delivery_address: body.deliveryAddress ? sanitizeText(body.deliveryAddress, 300) : null,
      source: "admin_manual",
      ...(createdAt ? { created_at: createdAt } : {}),
    })
    .select("id, order_number")
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: orderError?.message ?? "Échec de création de la commande" }, { status: 500 });
  }

  const itemsSummaryParts: string[] = [];
  for (const item of body.items) {
    const { data: insertedItem, error: itemError } = await supabase
      .from("order_items")
      .insert({
        order_id: order.id,
        product_id: item.productId,
        product_variant_id: item.productVariantId,
        product_name: sanitizeText(item.productName, 200),
        variant_name: item.variantName ? sanitizeText(item.variantName, 100) : null,
        unit_price: item.unitPrice,
        quantity: item.quantity,
        line_total: item.lineTotal,
      })
      .select("id")
      .single();

    if (itemError || !insertedItem) {
      return NextResponse.json({ error: itemError?.message ?? "Échec de l'enregistrement d'un article" }, { status: 500 });
    }

    itemsSummaryParts.push(`${item.quantity}× ${item.productName}${item.variantName ? ` (${item.variantName})` : ""}`);

    if (item.supplements.length) {
      await supabase.from("order_supplements").insert(
        item.supplements.map((s) => ({
          order_item_id: insertedItem.id,
          supplement_id: s.supplementId,
          supplement_name: sanitizeText(s.supplementName, 100),
          unit_price: 0,
        }))
      );
    }
  }

  let driver: { id: string; name: string; phone: string } | null = null;
  if (body.driverId) {
    const { data: driverRow } = await supabase.from("drivers").select("id, name, phone").eq("id", body.driverId).maybeSingle();
    driver = driverRow ?? null;
    if (driver) {
      const isFinal = status === "livree" || status === "annulee";
      await supabase.from("order_assignments").insert({
        order_id: order.id,
        driver_id: driver.id,
        status: status === "livree" ? "livree" : "assignee",
        delivered_at: status === "livree" ? new Date().toISOString() : null,
      });
      if (!isFinal) {
        await supabase.from("drivers").update({ status: "en_course" }).eq("id", driver.id);
      }
    }
  }

  if (body.notify) {
    const { data: profile } = await supabase.from("profiles").select("whatsapp_phone").eq("id", profileId).maybeSingle();
    if (profile?.whatsapp_phone) {
      try {
        const message = buildOrderConfirmationMessage({
          orderNumber: order.order_number,
          total,
          itemsSummary: itemsSummaryParts.join("\n"),
          paymentLabel: PAYMENT_LABELS[body.paymentMethod] ?? body.paymentMethod,
        });
        const sendResult = await sendWhatsappText(profile.whatsapp_phone, message);
        await supabase.from("whatsapp_messages").insert({
          profile_id: profileId,
          order_id: order.id,
          wa_message_id: extractMessageId(sendResult),
          direction: "outbound",
          phone: profile.whatsapp_phone,
          message_type: "text",
          content: message,
        });
      } catch (err) {
        console.error("[admin-create-order] échec notification client", { orderId: order.id, error: err });
      }
    }

    if (driver) {
      try {
        const sendResult = await sendDriverDeliveryAssignment({
          to: driver.phone,
          orderNumber: order.order_number,
          orderId: order.id,
          clientLabel: body.clientName || "Client",
          amountToCollect: body.paymentMethod === "momo_avance" ? 0 : total,
          paymentLabel: PAYMENT_LABELS[body.paymentMethod] ?? body.paymentMethod,
        });
        await supabase.from("whatsapp_messages").insert({
          driver_id: driver.id,
          order_id: order.id,
          wa_message_id: extractMessageId(sendResult),
          direction: "outbound",
          phone: driver.phone,
          message_type: "interactive",
          content: `Course assignée ${order.order_number}`,
        });
      } catch (err) {
        console.error("[admin-create-order] échec notification livreur", { orderId: order.id, error: err });
      }
    }
  }

  return NextResponse.json({ created: true, orderId: order.id, orderNumber: order.order_number });
}
