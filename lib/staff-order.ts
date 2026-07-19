import { createServiceClient } from "@/lib/supabase/server";
import {
  sendWhatsappText,
  sendWhatsappLocation,
  sendDriverDeliveryAssignment,
  buildDriverContactReminderMessage,
  buildStaffOrderClientConfirmationMessage,
  buildStaffOrderStaffConfirmationMessage,
  buildStaffOrderErrorMessage,
  buildStaffOrderOutOfZoneMessage,
  extractMessageId,
  normalizePhone,
} from "@/lib/whatsapp";
import { extractStaffOrder } from "@/lib/staff-order-ai";
import { extractLocationFromText } from "@/lib/location-ai";
import { findBestMatch } from "@/lib/fuzzy-match";
import { searchPlace } from "@/lib/nominatim";
import { haversineKm, computeDeliveryFee, KITCHEN_ORIGIN } from "@/lib/distance";
import type { PaymentMethod } from "@/lib/supabase/types";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash_livraison: "Cash à la livraison",
  momo_livraison: "Mobile Money à la livraison",
  momo_avance: "Mobile Money en avance",
};

/** Fenêtre pendant laquelle une position WhatsApp transférée par le staff est associée à la commande /commande en cours. */
const LOCATION_WINDOW_MINUTES = 5;

interface StaffInboundMessage {
  id: string;
  type: string;
  text?: { body: string };
  location?: { latitude: number; longitude: number };
}

interface MatchedOrderLine {
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

/**
 * Point d'entrée unique pour TOUT message reçu d'un numéro staff (support
 * WhatsApp classique) — ne doit jamais déclencher l'IA conversationnelle ni
 * le flow de commande client. Une position transférée est associée à la
 * commande /commande la plus récente (< 5 min) ; tout autre texte non
 * préfixé par "/commande" est simplement journalisé, sans réponse
 * automatique (le staff peut écrire des notes libres à lui-même).
 */
export async function handleStaffOrderSubmission(supportPhone: string, message: StaffInboundMessage): Promise<void> {
  const supabase = createServiceClient();

  await supabase.from("whatsapp_messages").insert({
    wa_message_id: message.id,
    direction: "inbound",
    phone: supportPhone,
    message_type: message.type,
    content:
      message.type === "text" ? (message.text?.body ?? null) : message.type === "location" ? "Position transférée par le staff" : null,
    payload: message as unknown as Record<string, unknown>,
  });

  if (message.type === "location" && message.location) {
    await attachForwardedLocationToRecentOrder(supportPhone, message.location.latitude, message.location.longitude);
    return;
  }

  const text = message.type === "text" ? (message.text?.body ?? "").trim() : "";
  if (!text.toLowerCase().startsWith("/commande")) {
    console.log("[staff-order] message staff ignoré (pas de /commande)", { supportPhone, type: message.type });
    return;
  }

  await processStaffOrderCommand(supportPhone, text);
}

/**
 * Si le staff a transféré la position GPS du client juste après le texte
 * /commande (donc trop tard pour être trouvée par findRecentForwardedLocation
 * au moment du parsing), on la rattache à la commande /commande la plus
 * récente (< 5 min) et on recalcule le tarif à partir des coordonnées
 * réelles — plus fiable que la description texte.
 */
async function attachForwardedLocationToRecentOrder(supportPhone: string, lat: number, lng: number): Promise<void> {
  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - LOCATION_WINDOW_MINUTES * 60 * 1000).toISOString();

  const { data: recentOrders } = await supabase
    .from("orders")
    .select("id, order_number, subtotal")
    .eq("source", "staff_manual")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1);

  const order = recentOrders?.[0];
  if (!order) {
    console.log("[staff-order] position transférée reçue mais aucune commande staff récente à associer", { supportPhone });
    return;
  }

  const distanceKm = haversineKm(KITCHEN_ORIGIN.lat, KITCHEN_ORIGIN.lng, lat, lng);
  const { fee } = computeDeliveryFee(distanceKm);
  const newFee = fee ?? 500;
  const newTotal = order.subtotal + newFee;

  await supabase.from("orders").update({ delivery_lat: lat, delivery_lng: lng, delivery_fee: newFee, total: newTotal }).eq("id", order.id);
  console.log("[staff-order] position GPS transférée associée rétroactivement à la commande", { orderId: order.id, orderNumber: order.order_number });

  await replyToStaff(supportPhone, `📍 Position GPS associée à la commande ${order.order_number} (tarif mis à jour : ${newFee.toLocaleString("fr-FR")} FCFA).`);
}

/** Position WhatsApp envoyée par le staff dans les LOCATION_WINDOW_MINUTES précédant le /commande — GPS réel prioritaire sur la description texte. */
async function findRecentForwardedLocation(supportPhone: string): Promise<{ lat: number; lng: number } | null> {
  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - LOCATION_WINDOW_MINUTES * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("whatsapp_messages")
    .select("payload")
    .eq("phone", supportPhone)
    .eq("message_type", "location")
    .eq("direction", "inbound")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1);

  const payload = data?.[0]?.payload as { location?: { latitude: number; longitude: number } } | null;
  if (!payload?.location) return null;
  return { lat: payload.location.latitude, lng: payload.location.longitude };
}

async function replyToStaff(supportPhone: string, message: string): Promise<void> {
  const supabase = createServiceClient();
  try {
    const sendResult = await sendWhatsappText(supportPhone, message);
    await supabase.from("whatsapp_messages").insert({
      wa_message_id: extractMessageId(sendResult),
      direction: "outbound",
      phone: supportPhone,
      message_type: "text",
      content: message,
    });
  } catch (err) {
    console.error("[staff-order] failed to reply to staff", err);
  }
}

/**
 * Parse (Groq), valide, fait correspondre plats/livreur avec la base, puis
 * crée la commande. N'importe quel champ obligatoire manquant ou ambigu
 * (client, tel, plats, localisation) interrompt le traitement AVANT toute
 * écriture en base — jamais de commande partielle.
 */
async function processStaffOrderCommand(supportPhone: string, text: string): Promise<void> {
  const supabase = createServiceClient();

  const parsed = await extractStaffOrder(text);
  if (!parsed) {
    await replyToStaff(supportPhone, buildStaffOrderErrorMessage(["Le message n'a pas pu être analysé (service d'extraction indisponible)."]));
    return;
  }

  const forwardedLocation = await findRecentForwardedLocation(supportPhone);

  const issues: string[] = [];
  if (!parsed.clientNom) issues.push("CLIENT manquant.");
  if (!parsed.clientTel) issues.push("TEL manquant.");
  if (!parsed.plats.length) issues.push("PLATS manquant ou vide.");
  if (!parsed.localisation && !forwardedLocation) {
    issues.push("LOCALISATION manquante (ni texte, ni position GPS transférée dans les 5 dernières minutes).");
  }

  const { data: products } = await supabase.from("products").select("id, name, base_price").eq("is_available", true);
  const matchedLines: MatchedOrderLine[] = [];

  for (const plat of parsed.plats) {
    const productMatch = findBestMatch(plat.nom, products ?? [], (p) => p.name);
    if (!productMatch) {
      issues.push(`Plat non reconnu : "${plat.nom}".`);
      continue;
    }

    let unitPrice = productMatch.item.base_price;
    let variantId: string | null = null;
    let variantName: string | null = null;
    if (plat.variante) {
      const { data: variants } = await supabase
        .from("product_variants")
        .select("id, name, price")
        .eq("product_id", productMatch.item.id)
        .eq("is_available", true);
      const variantMatch = findBestMatch(plat.variante, variants ?? [], (v) => v.name);
      if (variantMatch) {
        variantId = variantMatch.item.id;
        variantName = variantMatch.item.name;
        unitPrice = variantMatch.item.price;
      }
      // Variante mentionnée mais non reconnue : on garde le prix de base plutôt
      // que de bloquer toute la commande pour un détail secondaire.
    }

    const supplementIds: string[] = [];
    const supplementNames: string[] = [];
    let supplementsTotal = 0;
    if (plat.supplements.length) {
      const { data: supplements } = await supabase.from("supplements").select("id, name, price").eq("is_available", true);
      for (const supText of plat.supplements) {
        const supMatch = findBestMatch(supText, supplements ?? [], (s) => s.name);
        if (supMatch) {
          supplementIds.push(supMatch.item.id);
          supplementNames.push(supMatch.item.name);
          supplementsTotal += supMatch.item.price;
        }
      }
    }

    const lineTotal = (unitPrice + supplementsTotal) * plat.quantite;
    matchedLines.push({
      productId: productMatch.item.id,
      productName: productMatch.item.name,
      variantId,
      variantName,
      supplementIds,
      supplementNames,
      unitPrice,
      quantity: plat.quantite,
      lineTotal,
    });
  }

  if (issues.length) {
    await replyToStaff(supportPhone, buildStaffOrderErrorMessage(issues));
    return;
  }

  let deliveryAddress: string;
  let deliveryLat: number;
  let deliveryLng: number;
  if (forwardedLocation) {
    deliveryLat = forwardedLocation.lat;
    deliveryLng = forwardedLocation.lng;
    deliveryAddress = parsed.localisation ?? "Position transférée par le staff (GPS)";
  } else {
    // Comme pour le flow client (handleTextLocation) : une description libre
    // ("près de la pharmacie, maison bleue") n'est presque jamais géocodable
    // telle quelle par Nominatim — Groq identifie d'abord le quartier/repère
    // et produit une requête de recherche optimisée.
    const extracted = await extractLocationFromText(parsed.localisation!);
    const searchQuery = extracted?.rechercheNominatim || extracted?.quartier || extracted?.lieu || parsed.localisation!;
    const place = await searchPlace(searchQuery);
    if (!place) {
      await replyToStaff(
        supportPhone,
        buildStaffOrderErrorMessage([`Localisation introuvable : "${parsed.localisation}". Précise l'adresse ou transfère la position GPS du client.`])
      );
      return;
    }
    deliveryAddress = parsed.localisation!;
    deliveryLat = place.lat;
    deliveryLng = place.lng;
  }

  const distanceKm = haversineKm(KITCHEN_ORIGIN.lat, KITCHEN_ORIGIN.lng, deliveryLat, deliveryLng);
  const { fee, needsConfirmation } = computeDeliveryFee(distanceKm);
  if (needsConfirmation || fee === null) {
    await replyToStaff(supportPhone, buildStaffOrderOutOfZoneMessage(deliveryAddress));
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .upsert({ whatsapp_phone: parsed.clientTel!, full_name: parsed.clientNom! }, { onConflict: "whatsapp_phone", ignoreDuplicates: false })
    .select("id")
    .single();

  const { data: drivers } = await supabase.from("drivers").select("id, name, phone").eq("is_active", true);
  let matchedDriver: { id: string; name: string; phone: string } | null = null;
  if (parsed.livreurTel) {
    matchedDriver = (drivers ?? []).find((d) => normalizePhone(d.phone) === normalizePhone(parsed.livreurTel!)) ?? null;
  }
  if (!matchedDriver && parsed.livreurNom) {
    matchedDriver = findBestMatch(parsed.livreurNom, drivers ?? [], (d) => d.name)?.item ?? null;
  }

  const paymentMethod: PaymentMethod = parsed.paiement ?? "cash_livraison";
  const subtotal = matchedLines.reduce((s, l) => s + l.lineTotal, 0);
  const total = subtotal + fee;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      profile_id: profile?.id ?? null,
      payment_method: paymentMethod,
      subtotal,
      delivery_fee: fee,
      total,
      delivery_address: deliveryAddress,
      delivery_lat: deliveryLat,
      delivery_lng: deliveryLng,
      client_note: parsed.note,
      source: "staff_manual",
    })
    .select("id, order_number")
    .single();

  if (orderError || !order) {
    console.error("[staff-order] order insert FAILED", orderError);
    await replyToStaff(supportPhone, buildStaffOrderErrorMessage(["Échec technique lors de la création de la commande — réessaie."]));
    return;
  }

  for (const line of matchedLines) {
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

  const itemsSummary = matchedLines.map((l) => `${l.quantity}x ${l.productName}${l.variantName ? ` (${l.variantName})` : ""}`).join("\n");

  try {
    const sendResult = await sendWhatsappText(
      parsed.clientTel!,
      buildStaffOrderClientConfirmationMessage({ clientName: parsed.clientNom!, itemsSummary, total })
    );
    await supabase.from("whatsapp_messages").insert({
      profile_id: profile?.id ?? null,
      order_id: order.id,
      wa_message_id: extractMessageId(sendResult),
      direction: "outbound",
      phone: parsed.clientTel!,
      message_type: "text",
      content: "Confirmation de commande (soumission staff)",
    });
  } catch (err) {
    console.error("[staff-order] client confirmation send FAILED", err);
  }

  if (matchedDriver) {
    await supabase.from("order_assignments").insert({ order_id: order.id, driver_id: matchedDriver.id });
    await supabase.from("orders").update({ status: "en_route" }).eq("id", order.id);
    await supabase.from("drivers").update({ status: "en_course" }).eq("id", matchedDriver.id);

    try {
      const assignResult = await sendDriverDeliveryAssignment({
        to: matchedDriver.phone,
        orderNumber: order.order_number,
        orderId: order.id,
        clientLabel: parsed.clientNom!,
        amountToCollect: paymentMethod === "momo_avance" ? 0 : total,
        paymentLabel: PAYMENT_LABELS[paymentMethod],
      });
      await supabase.from("whatsapp_messages").insert({
        driver_id: matchedDriver.id,
        order_id: order.id,
        wa_message_id: extractMessageId(assignResult),
        direction: "outbound",
        phone: matchedDriver.phone,
        message_type: "interactive",
        content: `Course assignée ${order.order_number} (soumission staff)`,
      });

      if (forwardedLocation) {
        const locResult = await sendWhatsappLocation(matchedDriver.phone, deliveryLat, deliveryLng);
        await supabase.from("whatsapp_messages").insert({
          driver_id: matchedDriver.id,
          order_id: order.id,
          wa_message_id: extractMessageId(locResult),
          direction: "outbound",
          phone: matchedDriver.phone,
          message_type: "location",
          content: "Position GPS transférée par le staff",
        });
      } else {
        const textResult = await sendWhatsappText(matchedDriver.phone, `📍 Position décrite : "${deliveryAddress}"`);
        await supabase.from("whatsapp_messages").insert({
          driver_id: matchedDriver.id,
          order_id: order.id,
          wa_message_id: extractMessageId(textResult),
          direction: "outbound",
          phone: matchedDriver.phone,
          message_type: "text",
          content: deliveryAddress,
        });
      }

      const reminderResult = await sendWhatsappText(matchedDriver.phone, buildDriverContactReminderMessage(`+${normalizePhone(parsed.clientTel!)}`));
      await supabase.from("whatsapp_messages").insert({
        driver_id: matchedDriver.id,
        order_id: order.id,
        wa_message_id: extractMessageId(reminderResult),
        direction: "outbound",
        phone: matchedDriver.phone,
        message_type: "text",
        content: "Rappel contact direct client",
      });
    } catch (err) {
      console.error("[staff-order] driver assignment send FAILED", err);
    }
  }

  await replyToStaff(
    supportPhone,
    buildStaffOrderStaffConfirmationMessage({
      orderNumber: order.order_number,
      clientName: parsed.clientNom!,
      driverName: matchedDriver?.name ?? null,
      total,
    })
  );
}
