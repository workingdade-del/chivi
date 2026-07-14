import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient, createServiceClient } from "@/lib/supabase/server";
import {
  sendDriverDeliveryAssignment,
  sendWhatsappLocation,
  sendWhatsappText,
  sendWhatsappMedia,
  buildDriverContactReminderMessage,
  extractMessageId,
  normalizePhone,
} from "@/lib/whatsapp";
import { getSignedMediaUrl } from "@/lib/whatsapp-media";
import type { RawLocationInput } from "@/lib/location-confirmation";

const PAYMENT_LABELS: Record<string, string> = {
  cash_livraison: "Cash à la livraison",
  momo_livraison: "Mobile Money à la livraison",
  momo_avance: "Mobile Money déjà payé",
};

/**
 * Retransmet un par un, dans l'ordre d'envoi, chaque élément brut de
 * localisation reçu du client (GPS/texte/audio) — jamais juste l'adresse
 * interprétée par l'IA, l'adressage au Bénin étant souvent imprécis.
 * L'audio est retransmis tel quel (pas la transcription) via une nouvelle
 * URL signée, le fichier original stocké restant privé.
 */
async function forwardLocationInputsToDriver(
  supabase: ReturnType<typeof createServiceClient>,
  driverPhone: string,
  driverId: string,
  orderId: string,
  locationInputs: RawLocationInput[]
) {
  for (const input of locationInputs) {
    try {
      if (input.type === "gps" && input.lat !== undefined && input.lng !== undefined) {
        const sendResult = await sendWhatsappLocation(driverPhone, input.lat, input.lng);
        await supabase.from("whatsapp_messages").insert({
          driver_id: driverId,
          order_id: orderId,
          wa_message_id: extractMessageId(sendResult),
          direction: "outbound",
          phone: driverPhone,
          message_type: "location",
          content: "Position brute du client (transférée)",
        });
      } else if (input.type === "text" && input.content) {
        const sendResult = await sendWhatsappText(driverPhone, `📍 Position décrite par le client : "${input.content}"`);
        await supabase.from("whatsapp_messages").insert({
          driver_id: driverId,
          order_id: orderId,
          wa_message_id: extractMessageId(sendResult),
          direction: "outbound",
          phone: driverPhone,
          message_type: "text",
          content: input.content,
        });
      } else if (input.type === "audio" && input.mediaPath) {
        const signedUrl = await getSignedMediaUrl(supabase, input.mediaPath);
        if (!signedUrl) continue;
        const sendResult = await sendWhatsappMedia({ to: driverPhone, mediaType: "audio", link: signedUrl });
        await supabase.from("whatsapp_messages").insert({
          driver_id: driverId,
          order_id: orderId,
          wa_message_id: extractMessageId(sendResult),
          direction: "outbound",
          phone: driverPhone,
          message_type: "audio",
          content: "Message vocal du client (position, transféré)",
          media_path: input.mediaPath,
        });
      }
    } catch (err) {
      console.error("[assign-order] échec transfert d'un élément de localisation brut au livreur", { orderId, inputType: input.type, error: err });
    }
  }
}

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

  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .select("id, order_number, status, total, payment_method, delivery_address, profile_id, location_inputs, order_assignments(id, driver_id)")
    .eq("id", orderId)
    .maybeSingle();

  const order = orderData as unknown as {
    id: string;
    order_number: string;
    status: string;
    total: number;
    payment_method: string;
    delivery_address: string | null;
    profile_id: string | null;
    location_inputs: RawLocationInput[] | null;
    order_assignments: { id: string; driver_id: string }[];
  } | null;

  if (orderError || !order) {
    return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  }

  if (order.status === "livree" || order.status === "annulee") {
    return NextResponse.json({ error: "Impossible d'assigner un livreur sur une commande livrée ou annulée." }, { status: 409 });
  }

  const { data: driver, error: driverError } = await supabase
    .from("drivers")
    .select("id, name, phone")
    .eq("id", body.driverId)
    .maybeSingle();

  if (driverError || !driver) {
    return NextResponse.json({ error: "Livreur introuvable" }, { status: 404 });
  }

  // Réassignation : un livreur déjà en course sur cette commande doit être
  // libéré avant d'en assigner un nouveau, sinon il reste bloqué
  // "en_course" indéfiniment sur une livraison qui n'est plus la sienne.
  const previousAssignment = order.order_assignments?.[0];
  if (previousAssignment && previousAssignment.driver_id !== driver.id) {
    await supabase.from("drivers").update({ status: "libre" }).eq("id", previousAssignment.driver_id);
  }

  const { error: assignError } = await supabase
    .from("order_assignments")
    .insert({ order_id: orderId, driver_id: driver.id });

  if (assignError) {
    return NextResponse.json({ error: assignError.message }, { status: 500 });
  }

  await supabase.from("orders").update({ status: "en_route" }).eq("id", orderId);
  await supabase.from("drivers").update({ status: "en_course" }).eq("id", driver.id);

  let customerProfile: { full_name: string | null; whatsapp_phone: string } | null = null;
  if (order.profile_id) {
    const { data } = await supabase.from("profiles").select("full_name, whatsapp_phone").eq("id", order.profile_id).maybeSingle();
    customerProfile = data;
  }
  const clientLabel = customerProfile?.full_name || customerProfile?.whatsapp_phone || "Client";

  try {
    const sendResult = await sendDriverDeliveryAssignment({
      to: driver.phone,
      orderNumber: order.order_number,
      orderId: order.id,
      clientLabel,
      amountToCollect: order.payment_method === "momo_avance" ? 0 : order.total,
      paymentLabel: PAYMENT_LABELS[order.payment_method] ?? order.payment_method,
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

    const locationInputs = order.location_inputs ?? [];
    if (locationInputs.length) {
      await forwardLocationInputsToDriver(supabase, driver.phone, driver.id, order.id, locationInputs);
    } else if (order.delivery_address) {
      // Repli pour les commandes sans historique brut (ex : créées avant ce
      // système, ou hors Flow) — au moins l'adresse interprétée est envoyée.
      const fallbackResult = await sendWhatsappText(driver.phone, `📍 Adresse : ${order.delivery_address}`);
      await supabase.from("whatsapp_messages").insert({
        driver_id: driver.id,
        order_id: order.id,
        wa_message_id: extractMessageId(fallbackResult),
        direction: "outbound",
        phone: driver.phone,
        message_type: "text",
        content: order.delivery_address,
      });
    }

    if (customerProfile?.whatsapp_phone) {
      const reminderResult = await sendWhatsappText(
        driver.phone,
        buildDriverContactReminderMessage(`+${normalizePhone(customerProfile.whatsapp_phone)}`)
      );
      await supabase.from("whatsapp_messages").insert({
        driver_id: driver.id,
        order_id: order.id,
        wa_message_id: extractMessageId(reminderResult),
        direction: "outbound",
        phone: driver.phone,
        message_type: "text",
        content: "Rappel contact direct client",
      });
    }
  } catch (err) {
    console.error("[assign-order] échec envoi WhatsApp livreur", { orderId, error: err });
  }

  return NextResponse.json({ assigned: true });
}
