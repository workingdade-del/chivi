import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { buildOrderConfirmationMessage, normalizePhone, sendWhatsappText, extractMessageId } from "@/lib/whatsapp";
import { sendOrderReceiptEmail, sendAdminOrderNotification } from "@/lib/email";
import { sanitizeText } from "@/lib/sanitize";
import type { PaymentMethod } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

interface OrderLineInput {
  productId: string;
  productVariantId: string | null;
  quantity: number;
  supplementIds: string[];
  note?: string;
}

interface CreateOrderBody {
  whatsappPhone: string;
  fullName?: string;
  email?: string;
  addressDetails: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryZoneId: string | null;
  paymentMethod: PaymentMethod;
  clientNote?: string;
  lines: OrderLineInput[];
}

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) {
    return NextResponse.json({ error: "Paramètre phone requis" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("whatsapp_phone", normalizePhone(phone))
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ orders: [] });
  }

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, total, created_at, order_items(id, product_id, product_variant_id, product_name, variant_name, quantity, unit_price)"
    )
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as CreateOrderBody;

  if (!body.whatsappPhone || !body.lines?.length || !body.paymentMethod) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  body.addressDetails = sanitizeText(body.addressDetails ?? "", 500);
  if (body.clientNote) body.clientNote = sanitizeText(body.clientNote, 500);
  if (body.fullName) body.fullName = sanitizeText(body.fullName, 120);

  const supabase = createServiceClient();

  const { data: settings } = await supabase
    .from("system_settings")
    .select("is_paused")
    .eq("id", true)
    .maybeSingle();

  if (settings?.is_paused) {
    return NextResponse.json({ error: "Le service est momentanément indisponible." }, { status: 503 });
  }

  const phone = normalizePhone(body.whatsappPhone);

  // Toujours recalculer les prix côté serveur — ne jamais faire confiance
  // aux montants envoyés par le client.
  const productIds = [...new Set(body.lines.map((l) => l.productId))];
  const variantIds = [...new Set(body.lines.map((l) => l.productVariantId).filter(Boolean))] as string[];
  const supplementIds = [...new Set(body.lines.flatMap((l) => l.supplementIds))];

  const [{ data: products }, { data: variants }, { data: supplements }] = await Promise.all([
    supabase.from("products").select("id, name, base_price").in("id", productIds),
    variantIds.length
      ? supabase.from("product_variants").select("id, name, price").in("id", variantIds)
      : Promise.resolve({ data: [] as { id: string; name: string; price: number }[] }),
    supplementIds.length
      ? supabase.from("supplements").select("id, name, price").in("id", supplementIds)
      : Promise.resolve({ data: [] as { id: string; name: string; price: number }[] }),
  ]);

  if (!products) {
    return NextResponse.json({ error: "Produits introuvables" }, { status: 400 });
  }

  let deliveryFee = 500;
  if (body.deliveryZoneId) {
    const { data: zone } = await supabase
      .from("delivery_zones")
      .select("fee_min")
      .eq("id", body.deliveryZoneId)
      .maybeSingle();
    if (zone) deliveryFee = zone.fee_min;
  }

  const preparedLines = body.lines.map((line) => {
    const product = products.find((p) => p.id === line.productId);
    const variant = variants?.find((v) => v.id === line.productVariantId);
    const unitPrice = variant?.price ?? product?.base_price ?? 0;
    const lineSupplements = line.supplementIds
      .map((id) => supplements?.find((s) => s.id === id))
      .filter(Boolean) as { id: string; name: string; price: number }[];
    const supplementsTotal = lineSupplements.reduce((s, x) => s + x.price, 0);
    const lineTotal = (unitPrice + supplementsTotal) * line.quantity;

    return {
      productId: line.productId,
      productVariantId: line.productVariantId,
      productName: product?.name ?? "Produit",
      variantName: variant?.name ?? null,
      unitPrice,
      quantity: line.quantity,
      lineTotal,
      note: line.note ?? null,
      supplements: lineSupplements,
    };
  });

  const subtotal = preparedLines.reduce((s, l) => s + l.lineTotal, 0);
  const total = subtotal + deliveryFee;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        whatsapp_phone: phone,
        full_name: body.fullName,
        email: body.email,
        address_details: body.addressDetails,
        delivery_lat: body.deliveryLat,
        delivery_lng: body.deliveryLng,
      },
      { onConflict: "whatsapp_phone" }
    )
    .select("id")
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: profileError?.message ?? "Profil introuvable" }, { status: 500 });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      profile_id: profile.id,
      payment_method: body.paymentMethod,
      subtotal,
      delivery_fee: deliveryFee,
      total,
      delivery_address: body.addressDetails,
      delivery_lat: body.deliveryLat,
      delivery_lng: body.deliveryLng,
      delivery_zone_id: body.deliveryZoneId,
      client_note: body.clientNote,
    })
    .select("id, order_number")
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: orderError?.message ?? "Échec de la commande" }, { status: 500 });
  }

  for (const line of preparedLines) {
    const { data: orderItem, error: itemError } = await supabase
      .from("order_items")
      .insert({
        order_id: order.id,
        product_id: line.productId,
        product_variant_id: line.productVariantId,
        product_name: line.productName,
        variant_name: line.variantName,
        unit_price: line.unitPrice,
        quantity: line.quantity,
        line_total: line.lineTotal,
        note: line.note,
      })
      .select("id")
      .single();

    if (itemError || !orderItem) continue;

    if (line.supplements.length) {
      await supabase.from("order_supplements").insert(
        line.supplements.map((s) => ({
          order_item_id: orderItem.id,
          supplement_id: s.id,
          supplement_name: s.name,
          unit_price: s.price,
        }))
      );
    }
  }

  const itemsSummary = preparedLines
    .map((l) => `${l.quantity}x ${l.productName}${l.variantName ? ` (${l.variantName})` : ""}`)
    .join("\n");

  try {
    const sendResult = await sendWhatsappText(
      phone,
      buildOrderConfirmationMessage({
        orderNumber: order.order_number,
        total,
        itemsSummary,
        paymentLabel: paymentLabel(body.paymentMethod),
      })
    );
    await supabase.from("whatsapp_messages").insert({
      profile_id: profile.id,
      order_id: order.id,
      wa_message_id: extractMessageId(sendResult),
      direction: "outbound",
      phone,
      message_type: "text",
      content: "Confirmation de commande",
    });
  } catch (err) {
    // La commande est déjà enregistrée ; l'échec d'envoi WhatsApp ne doit
    // pas faire échouer la création de commande (token expiré, etc.).
    console.error("WhatsApp send failed", err);
  }

  if (body.email) {
    await sendOrderReceiptEmail({
      toEmail: body.email,
      orderNumber: order.order_number,
      itemsSummary: preparedLines.map((l) => ({ name: l.productName, qty: l.quantity, lineTotal: l.lineTotal })),
      subtotal,
      deliveryFee,
      total,
      address: body.addressDetails,
      paymentLabel: paymentLabel(body.paymentMethod),
    });
  }

  await sendAdminOrderNotification({
    orderNumber: order.order_number,
    total,
    phone,
    address: body.addressDetails,
  });

  return NextResponse.json({
    orderId: order.id,
    orderNumber: order.order_number,
    subtotal,
    deliveryFee,
    total,
  });
}

function paymentLabel(method: PaymentMethod): string {
  switch (method) {
    case "cash_livraison":
      return "Cash à la livraison";
    case "momo_livraison":
      return "Mobile Money à la livraison";
    case "momo_avance":
      return "Mobile Money en avance";
  }
}
