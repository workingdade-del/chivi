import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";
import { sendWhatsappText, buildOrderCancelledMessage, extractMessageId } from "@/lib/whatsapp";
import { sanitizeText } from "@/lib/sanitize";

/** Annule une commande non encore livrée. Staff uniquement (Cuisine ou Admin). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authClient = createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string; notifyClient?: boolean };
  const reason = body.reason ? sanitizeText(body.reason, 300) : null;
  const notifyClient = body.notifyClient !== false;

  const supabase = createServiceClient();
  const orderId = params.id;

  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .select("id, order_number, status, profile_id, order_assignments(id, driver_id)")
    .eq("id", orderId)
    .maybeSingle();

  const order = orderData as unknown as {
    id: string;
    order_number: string;
    status: string;
    profile_id: string | null;
    order_assignments: { id: string; driver_id: string }[];
  } | null;

  if (orderError || !order) {
    return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  }

  if (order.status === "livree" || order.status === "annulee") {
    return NextResponse.json({ error: "Cette commande ne peut plus être annulée." }, { status: 409 });
  }

  const { error: updateError } = await supabase.from("orders").update({ status: "annulee" }).eq("id", orderId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Un livreur déjà assigné à une commande annulée doit être libéré, sinon
  // il reste artificiellement "en_course" pour une livraison qui n'aura
  // jamais lieu. order_assignments.status a une contrainte CHECK qui
  // n'inclut pas "annulee" — le statut de la commande (déjà mis à jour
  // ci-dessus) fait foi, la ligne d'assignation reste inchangée en tant
  // qu'historique.
  const assignment = order.order_assignments?.[0];
  if (assignment) {
    await supabase.from("drivers").update({ status: "libre" }).eq("id", assignment.driver_id);
  }

  if (notifyClient && order.profile_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("whatsapp_phone")
      .eq("id", order.profile_id)
      .maybeSingle();

    if (profile?.whatsapp_phone) {
      try {
        const message = buildOrderCancelledMessage(reason);
        const sendResult = await sendWhatsappText(profile.whatsapp_phone, message);
        await supabase.from("whatsapp_messages").insert({
          profile_id: order.profile_id,
          order_id: order.id,
          wa_message_id: extractMessageId(sendResult),
          direction: "outbound",
          phone: profile.whatsapp_phone,
          message_type: "text",
          content: message,
        });
      } catch (err) {
        console.error("[cancel-order] échec notification WhatsApp client", { orderId, error: err });
      }
    }
  }

  return NextResponse.json({ cancelled: true });
}
