import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";
import { sendDriverDeliveryAssignment } from "@/lib/whatsapp";

const PAYMENT_LABELS: Record<string, string> = {
  cash_livraison: "Cash à la livraison",
  momo_livraison: "Mobile Money à la livraison",
  momo_avance: "Mobile Money déjà payé",
};

/** Assigne un livreur à une commande et l'informe par WhatsApp (adresse, montant, bouton "Client livré"). Staff uniquement. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { driverId?: string };
  if (!body.driverId) {
    return NextResponse.json({ error: "driverId requis" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const orderId = params.id;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, order_number, total, payment_method, delivery_address")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  }

  const { data: driver, error: driverError } = await supabase
    .from("drivers")
    .select("id, name, phone")
    .eq("id", body.driverId)
    .maybeSingle();

  if (driverError || !driver) {
    return NextResponse.json({ error: "Livreur introuvable" }, { status: 404 });
  }

  const { error: assignError } = await supabase
    .from("order_assignments")
    .insert({ order_id: orderId, driver_id: driver.id });

  if (assignError) {
    return NextResponse.json({ error: assignError.message }, { status: 500 });
  }

  await supabase.from("orders").update({ status: "en_route" }).eq("id", orderId);
  await supabase.from("drivers").update({ status: "en_course" }).eq("id", driver.id);

  try {
    await sendDriverDeliveryAssignment({
      to: driver.phone,
      driverName: driver.name,
      orderNumber: order.order_number,
      orderId: order.id,
      address: order.delivery_address ?? "Adresse non précisée",
      amountToCollect: order.payment_method === "momo_avance" ? 0 : order.total,
      paymentLabel: PAYMENT_LABELS[order.payment_method] ?? order.payment_method,
    });
    await supabase.from("whatsapp_messages").insert({
      driver_id: driver.id,
      order_id: order.id,
      direction: "outbound",
      phone: driver.phone,
      message_type: "interactive",
      content: `Course assignée ${order.order_number}`,
    });
  } catch (err) {
    console.error("[assign-order] échec envoi WhatsApp livreur", { orderId, error: err });
  }

  return NextResponse.json({ assigned: true });
}
