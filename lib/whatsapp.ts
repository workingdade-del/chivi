const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export interface WhatsappSendResponse {
  messages?: { id: string }[];
}

/** Extrait le wamid retourné par Meta — à stocker sur la ligne whatsapp_messages sortante pour pouvoir relier les callbacks de statut de livraison ensuite. */
export function extractMessageId(response: WhatsappSendResponse): string | null {
  return response.messages?.[0]?.id ?? null;
}

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

/** Télécharge un média WhatsApp (ex : message vocal) — deux appels : résoudre l'URL, puis récupérer les octets. Serveur uniquement. */
export async function downloadWhatsappMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const metaRes = await fetch(`${GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!metaRes.ok) {
    throw new Error(`Échec résolution média WhatsApp (${metaRes.status}): ${await metaRes.text()}`);
  }
  const meta = (await metaRes.json()) as { url: string; mime_type: string };

  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token()}` } });
  if (!fileRes.ok) {
    throw new Error(`Échec téléchargement média WhatsApp (${fileRes.status})`);
  }
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return { buffer, mimeType: meta.mime_type };
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

export function buildLocationConfirmationMessage(address: string): string {
  return `📍 J'ai détecté votre position : ${address}\nEst-ce bien votre lieu de livraison ?\nRépondez OUI pour confirmer ou décrivez mieux votre position.`;
}

export function buildLocationNotFoundMessage(): string {
  return "🤔 Je n'ai pas trouvé cet endroit précisément.\nPouvez-vous envoyer votre localisation WhatsApp ?\n(Appuyez sur 📎 puis choisissez Localisation)";
}

export function buildLocationRequestMessage(): string {
  return "Parfait, ta commande est enregistrée ! 📍 Décris ta position (quartier, repère…) ou envoie ta localisation WhatsApp (📎 → Localisation) pour qu'on calcule les frais de livraison.";
}

/** Envoie le WhatsApp Flow de commande CHIVI. flowToken identifie la session (panier) côté data endpoint. Serveur uniquement. */
export async function sendWhatsappFlow(to: string, flowToken: string) {
  const flowId = process.env.WHATSAPP_FLOW_ID;
  if (!flowId) {
    throw new Error("WHATSAPP_FLOW_ID n'est pas configurée");
  }

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
        type: "flow",
        body: { text: "Commande tes plats CHIVI directement ici 🍽️" },
        action: {
          name: "flow",
          parameters: {
            flow_message_version: "3",
            flow_token: flowToken,
            flow_id: flowId,
            flow_cta: "Commander",
            flow_action: "navigate",
            flow_action_payload: { screen: "CATEGORIES" },
          },
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

export function buildDeliveryFeeMessage(distanceKm: number, fee: number): string {
  return `📍 Position reçue ! Tu es à environ ${distanceKm.toFixed(1)} km de notre cuisine.\nFrais de livraison estimés : ${fee.toLocaleString("fr-FR")} FCFA.`;
}

export function buildDeliveryFeePendingMessage(): string {
  return "Patientez quelques secondes, je vérifie le prix de la course avec notre livreur 🙏";
}

export function buildDriverQuoteRequestMessage(distanceKm: number): string {
  return `📍 Nouvelle demande de livraison à ${distanceKm.toFixed(1)} km (hors zone tarifée). Quel tarif proposes-tu ? Réponds simplement avec le montant en FCFA (ex : 1500).`;
}

export function buildDeliveryFeeConfirmedMessage(fee: number): string {
  return `✅ Prix confirmé avec notre livreur : ${fee.toLocaleString("fr-FR")} FCFA pour la livraison.`;
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
