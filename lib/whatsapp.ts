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
