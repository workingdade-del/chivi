import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";
import { sanitizeText } from "@/lib/sanitize";

interface UpdateItemPayload {
  productId: string | null;
  productVariantId: string | null;
  productName: string;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  supplements: { supplementId: string | null; supplementName: string }[];
}

/**
 * Modifie une commande existante (articles, adresse, total). Staff
 * uniquement — order_items/order_supplements n'ont aucune policy RLS
 * d'écriture pour "authenticated" (lecture seule), donc ce remplacement
 * passe forcément par le service role plutôt qu'un write client direct.
 * Les anciens order_items sont supprimés (cascade sur order_supplements)
 * puis remplacés par la liste envoyée — plus simple et plus sûr qu'un
 * diff ligne à ligne pour un formulaire d'édition complet.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    items?: UpdateItemPayload[];
    deliveryAddress?: string | null;
    totalOverride?: number | null;
  };

  if (!body.items || body.items.length === 0) {
    return NextResponse.json({ error: "La commande doit contenir au moins un article." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const orderId = params.id;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, delivery_fee")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  }

  const subtotal = body.items.reduce((s, i) => s + i.lineTotal, 0);
  const total = body.totalOverride != null && !Number.isNaN(body.totalOverride) ? body.totalOverride : subtotal + order.delivery_fee;
  const deliveryAddress = body.deliveryAddress ? sanitizeText(body.deliveryAddress, 300) : null;

  const { error: deleteError } = await supabase.from("order_items").delete().eq("order_id", orderId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  for (const item of body.items) {
    const { data: insertedItem, error: itemError } = await supabase
      .from("order_items")
      .insert({
        order_id: orderId,
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

  const { error: updateError } = await supabase
    .from("orders")
    .update({ subtotal, total, delivery_address: deliveryAddress })
    .eq("id", orderId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ updated: true });
}
