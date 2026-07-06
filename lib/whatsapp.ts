const GRAPH_BASE = "https://graph.facebook.com/v21.0";

function phoneNumberId(): string {
  return process.env.WHATSAPP_PHONE_NUMBER_ID!;
}

function token(): string {
  return process.env.WHATSAPP_TOKEN!;
}

/** Envoie un message texte WhatsApp via l'API Cloud de Meta. Serveur uniquement. */
export async function sendWhatsappText(to: string, body: string) {
  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(to),
      type: "text",
      text: { body, preview_url: false },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${detail}`);
  }

  return res.json();
}

/** Retire tout caractère non numérique (l'API attend un format E.164 sans "+"). */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

export const DRIVER_AVAILABLE_BUTTON_ID = "driver_available";
export const DRIVER_UNAVAILABLE_BUTTON_ID = "driver_unavailable";

/** Demande de disponibilité livreur avec boutons interactifs (✅/❌). Serveur uniquement. */
export async function sendWhatsappAvailabilityRequest(to: string, driverName: string) {
  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(to),
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: `Bonjour ${driverName}, es-tu disponible pour des livraisons CHIVI maintenant ?` },
        action: {
          buttons: [
            { type: "reply", reply: { id: DRIVER_AVAILABLE_BUTTON_ID, title: "✅ Disponible" } },
            { type: "reply", reply: { id: DRIVER_UNAVAILABLE_BUTTON_ID, title: "❌ Non disponible" } },
          ],
        },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${detail}`);
  }

  return res.json();
}

export const DELIVERY_DONE_BUTTON_PREFIX = "delivery_done:";

/** Message livreur à l'assignation : adresse + montant à collecter + bouton "Client livré". Serveur uniquement. */
export async function sendDriverDeliveryAssignment(params: {
  to: string;
  driverName: string;
  orderNumber: string;
  orderId: string;
  address: string;
  amountToCollect: number;
  paymentLabel: string;
}) {
  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(params.to),
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: [
            `Nouvelle course ${params.orderNumber}, ${params.driverName} 🛵`,
            "",
            `📍 Adresse : ${params.address}`,
            `💰 À collecter : ${params.amountToCollect.toLocaleString("fr-FR")} FCFA (${params.paymentLabel})`,
          ].join("\n"),
        },
        action: {
          buttons: [
            {
              type: "reply",
              reply: { id: `${DELIVERY_DONE_BUTTON_PREFIX}${params.orderId}`, title: "✅ Client livré" },
            },
          ],
        },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${detail}`);
  }

  return res.json();
}

export function buildPostDeliveryFeedbackMessage(): string {
  return "🎉 Votre commande a bien été livrée ! Bon appétit 😋\nN'hésitez pas à nous donner votre avis en répondant à ce message. Merci de choisir CHIVI !";
}

export function buildOrderConfirmationMessage(params: {
  orderNumber: string;
  total: number;
  itemsSummary: string;
  paymentLabel: string;
}): string {
  const total = params.total.toLocaleString("fr-FR");
  return [
    `CHIVI — Commande ${params.orderNumber} reçue !`,
    "",
    params.itemsSummary,
    "",
    `Total : ${total} FCFA`,
    `Paiement : ${params.paymentLabel}`,
    "",
    "La cuillère ne ment jamais. On prépare ça tout de suite.",
  ].join("\n");
}

export function buildWaMeOrderLink(businessNumber: string, orderNumber: string, itemsSummary: string, total: number) {
  const text = `Bonjour CHIVI, je confirme ma commande ${orderNumber} :\n${itemsSummary}\nTotal : ${total.toLocaleString("fr-FR")} FCFA`;
  return `https://wa.me/${businessNumber}?text=${encodeURIComponent(text)}`;
}

export function buildPauseAutoReply(reason: string): string {
  return `Bonjour ! 😔 Nous sommes momentanément indisponibles.\nRaison : ${reason}.\nNous reviendrons très bientôt. Pour toute urgence, contactez notre support : wa.me/22959398724`;
}

export function buildResumeMessage(): string {
  return "Bonne nouvelle ! 🎉 CHIVI est de nouveau disponible. Vous pouvez commander maintenant !";
}
