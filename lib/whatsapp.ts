import { CATEGORY_LABELS } from "@/lib/product-categories";

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

export const NEW_CONVERSATION_TEMPLATE_NAME = "chivi_nouvelle_commande";

export type TemplateStatus = "APPROVED" | "PENDING" | "REJECTED" | "NOT_FOUND";

/** Interroge Meta en direct pour l'état d'approbation du template — pas de cache local, la fréquence d'usage (démarrage de conversation hors fenêtre 24h) est trop faible pour le justifier. */
export async function getTemplateStatus(name: string): Promise<TemplateStatus> {
  const wabaId = process.env.WHATSAPP_WABA_ID;
  if (!wabaId) return "NOT_FOUND";

  const res = await fetch(`${GRAPH_BASE}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) return "NOT_FOUND";

  const body = (await res.json()) as { data?: { status?: string }[] };
  const status = body.data?.[0]?.status;
  if (status === "APPROVED" || status === "PENDING" || status === "REJECTED") return status;
  return "NOT_FOUND";
}

/** Envoie le template approuvé chivi_nouvelle_commande — seul type de message autorisé hors fenêtre de 24h. */
export async function sendOrderTemplateMessage(to: string, customerName: string) {
  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(to),
      type: "template",
      template: {
        name: NEW_CONVERSATION_TEMPLATE_NAME,
        language: { code: "fr" },
        components: [{ type: "body", parameters: [{ type: "text", text: customerName }] }],
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`WhatsApp template send failed (${res.status}): ${detail}`);
  }

  return res.json();
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

/**
 * Envoie un média (image, audio ou document) via une URL — WhatsApp Cloud
 * API télécharge le fichier lui-même à cette adresse, donc l'URL doit rester
 * accessible le temps de la requête (URL signée Supabase à courte durée de
 * vie). L'audio ne supporte pas de légende côté API Meta.
 */
export async function sendWhatsappMedia(params: {
  to: string;
  mediaType: "image" | "audio" | "document";
  link: string;
  caption?: string;
  filename?: string;
}) {
  const mediaPayload: Record<string, unknown> =
    params.mediaType === "audio"
      ? { link: params.link }
      : params.mediaType === "document"
        ? { link: params.link, caption: params.caption, filename: params.filename }
        : { link: params.link, caption: params.caption };

  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(params.to),
      type: params.mediaType,
      [params.mediaType]: mediaPayload,
    }),
  });

  // Un envoi média accepté (200 OK) ne garantit pas la lecture correcte côté
  // destinataire — un format/mime_type incompatible peut être accepté par
  // l'API puis échouer silencieusement (ou être visible uniquement dans le
  // callback asynchrone "statuses"). On logue donc systématiquement la
  // réponse complète de Meta, pas seulement en cas d'échec HTTP.
  const rawBody = await res.text();
  console.log("[whatsapp-media] réponse Meta à l'envoi", {
    mediaType: params.mediaType,
    status: res.status,
    link: params.link,
    body: rawBody,
  });

  if (!res.ok) {
    throw new Error(`WhatsApp send failed (${res.status}): ${rawBody}`);
  }

  return JSON.parse(rawBody);
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
  return `📍 J'ai trouvé : ${address}.\nC'est bien ça ?`;
}

export const LOCATION_CONFIRM_BUTTON_ID = "location_confirm";
export const LOCATION_REJECT_BUTTON_ID = "location_reject";

/** Boutons "✅ Oui c'est ça" / "❌ Non, je précise" pour confirmer l'adresse détectée (GPS ou texte). Le texte libre "OUI"/"NON" reste accepté en repli, voir handleLocationTextReply. */
export async function sendLocationConfirmationButtons(to: string, address: string) {
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
        body: { text: buildLocationConfirmationMessage(address) },
        action: {
          buttons: [
            { type: "reply", reply: { id: LOCATION_CONFIRM_BUTTON_ID, title: "✅ Oui c'est ça" } },
            { type: "reply", reply: { id: LOCATION_REJECT_BUTTON_ID, title: "❌ Non, je précise" } },
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

export function buildLocationRejectionPromptMessage(): string {
  return "D'accord 🙏 Décris-moi plus précisément l'endroit (texte ou message vocal), ou envoie directement ta position (📎 → Localisation).";
}

export function buildSessionExpiredMessage(): string {
  return "Il semble que votre commande précédente n'a pas été terminée. Voulez-vous recommencer ? Tapez menu pour voir nos plats 🍽️";
}

export function buildLocationNotFoundMessage(): string {
  return "🤔 Je n'ai pas trouvé cet endroit précisément.\nPouvez-vous envoyer votre localisation WhatsApp ?\n(Appuyez sur 📎 puis choisissez Localisation)";
}

export function buildLocationRequestMessage(): string {
  return [
    "Parfait ! 📍 Où souhaitez-vous être livré ? Vous pouvez :",
    "- Envoyer votre position (📎 → Localisation)",
    "- Décrire votre adresse en texte",
    "- Envoyer un message vocal avec l'adresse",
  ].join("\n");
}

export function buildFlowWelcomeMessage(): string {
  return "Bonjour ! 😊 Bienvenue chez CHIVI. Découvrez notre menu et composez votre commande directement ici 👇";
}

export function buildOutOfZoneMessage(): string {
  return "😔 Désolé, cette adresse semble en dehors de notre zone de livraison actuelle (Cotonou et Abomey-Calavi). Nous ne pouvons pas livrer à cet endroit pour le moment.";
}

export function buildLocationEscalationMessage(): string {
  return "Je n'arrive pas à localiser précisément votre position. 😔 Un membre de notre équipe va vous contacter pour finaliser votre commande.";
}

export function buildOrderCancelledByCustomerMessage(): string {
  return "Commande annulée. N'hésitez pas à recommencer quand vous voulez ! 😊";
}

export function buildOrderRecapMessage(params: {
  lines: { productName: string; variantName: string | null; quantity: number; lineTotal: number }[];
  subtotal: number;
  deliveryFee: number;
  address: string;
}): string {
  const itemsText = params.lines
    .map((l) => `${l.quantity}x ${l.productName}${l.variantName ? ` (${l.variantName})` : ""} — ${l.lineTotal.toLocaleString("fr-FR")} FCFA`)
    .join("\n");
  const total = params.subtotal + params.deliveryFee;
  return [
    "📋 Récapitulatif de votre commande :",
    itemsText,
    `Sous-total : ${params.subtotal.toLocaleString("fr-FR")} FCFA`,
    `Livraison : ${params.deliveryFee.toLocaleString("fr-FR")} FCFA`,
    "_(le prix de livraison peut légèrement varier, vous serez notifié en cas de changement)_",
    `💰 Total : ${total.toLocaleString("fr-FR")} FCFA`,
    `📍 Livraison : ${params.address}`,
  ].join("\n");
}

export const ORDER_VALIDATE_BUTTON_ID = "order_validate";
export const ORDER_CANCEL_BUTTON_ID = "order_cancel";

/** Boutons "✅ Valider" / "❌ Annuler" sous le récapitulatif de commande. */
export async function sendOrderRecapButtons(to: string, recapText: string) {
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
        body: { text: recapText },
        action: {
          buttons: [
            { type: "reply", reply: { id: ORDER_VALIDATE_BUTTON_ID, title: "✅ Valider" } },
            { type: "reply", reply: { id: ORDER_CANCEL_BUTTON_ID, title: "❌ Annuler" } },
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

export const PAYMENT_CASH_BUTTON_ID = "payment_cash_livraison";
export const PAYMENT_MOMO_LIVRAISON_BUTTON_ID = "payment_momo_livraison";
export const PAYMENT_MOMO_AVANCE_BUTTON_ID = "payment_momo_avance";

/** Boutons de choix du mode de paiement (3 = maximum autorisé par l'API WhatsApp). */
export async function sendPaymentMethodButtons(to: string) {
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
        body: { text: "💳 Comment souhaitez-vous payer ?" },
        action: {
          buttons: [
            { type: "reply", reply: { id: PAYMENT_CASH_BUTTON_ID, title: "Cash livraison" } },
            { type: "reply", reply: { id: PAYMENT_MOMO_LIVRAISON_BUTTON_ID, title: "Momo livraison" } },
            { type: "reply", reply: { id: PAYMENT_MOMO_AVANCE_BUTTON_ID, title: "Momo avance" } },
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
            // Les catégories sont fournies directement ici plutôt que de
            // dépendre uniquement de l'appel INIT au data endpoint : un
            // flow_action_payload avec `screen` mais sans `data` est un cas
            // ambigu côté Meta — observé en réel avec la liste vide sous
            // "Choisis une catégorie" alors que l'endpoint répond
            // correctement quand on le teste directement. Comme les
            // catégories sont statiques (aucune dépendance BDD), les fournir
            // ici garantit le premier rendu quel que soit le comportement
            // exact de Meta vis-à-vis de INIT.
            flow_action_payload: {
              screen: "CATEGORIES",
              data: { categories: Object.entries(CATEGORY_LABELS).map(([id, title]) => ({ id, title })) },
            },
          },
        },
      },
    }),
  });

  // Un Flow non publié (status DRAFT côté Meta) est rejeté silencieusement
  // du point de vue du client — l'appel échoue avec un code Graph API
  // explicite mais rien n'est jamais envoyé, et sans ce log complet
  // l'échec n'était visible nulle part (pas de ligne whatsapp_messages,
  // pas de détail d'erreur).
  const rawBody = await res.text();
  console.log("[whatsapp-flow] réponse Meta à l'envoi du Flow", { to: normalizePhone(to), flowId, flowToken, status: res.status, body: rawBody });

  if (!res.ok) {
    throw new Error(`WhatsApp send failed (${res.status}): ${rawBody}`);
  }

  return JSON.parse(rawBody);
}

export const DELIVERY_DONE_BUTTON_PREFIX = "delivery_done:";

/**
 * Message livreur à l'assignation : en-tête (commande, client, montant) +
 * bouton "Client livré". Les données de localisation brutes du client (GPS,
 * texte, audio) sont envoyées séparément juste après, un par un, dans
 * l'ordre où le client les a envoyées — voir la route d'assignation qui
 * boucle sur order.location_inputs et appelle sendWhatsappLocation /
 * sendWhatsappText / sendWhatsappMedia selon le type. Serveur uniquement.
 */
export async function sendDriverDeliveryAssignment(params: {
  to: string;
  orderNumber: string;
  orderId: string;
  clientLabel: string;
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
            `📦 Nouvelle course - Commande ${params.orderNumber}`,
            `Client : ${params.clientLabel}`,
            `Montant à collecter : ${params.amountToCollect.toLocaleString("fr-FR")} FCFA (${params.paymentLabel})`,
            "Voici les informations de localisation du client :",
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

/** Retransmet un pin de localisation exact (GPS brut envoyé par le client) au livreur. Serveur uniquement. */
export async function sendWhatsappLocation(to: string, lat: number, lng: number) {
  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(to),
      type: "location",
      location: { latitude: lat, longitude: lng },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${detail}`);
  }

  return res.json();
}

export function buildDriverContactReminderMessage(clientPhoneDisplay: string): string {
  return `📞 Besoin de précision ? Tu peux contacter directement le client : ${clientPhoneDisplay}\n(l'adressage au Bénin n'est pas toujours exact, n'hésite pas à l'appeler)`;
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

/** Confirmation envoyée au VRAI client après une commande soumise manuellement par le staff (numéro support classique). */
export function buildStaffOrderClientConfirmationMessage(params: { clientName: string; itemsSummary: string; total: number }): string {
  return [
    `Bonjour ${params.clientName} ! Votre commande CHIVI a été enregistrée ✅`,
    params.itemsSummary,
    `Total : ${params.total.toLocaleString("fr-FR")} FCFA`,
    "",
    "Un livreur vous contactera bientôt. Merci !",
  ].join("\n");
}

/** Récapitulatif envoyé au staff (numéro support) une fois la commande manuelle créée. */
export function buildStaffOrderStaffConfirmationMessage(params: {
  orderNumber: string;
  clientName: string;
  driverName: string | null;
  total: number;
}): string {
  const driverPart = params.driverName ? `livreur ${params.driverName} notifié` : "⚠️ aucun livreur reconnu, assignation manuelle requise";
  return `✅ Commande ${params.orderNumber} créée pour ${params.clientName}, ${driverPart}, total ${params.total.toLocaleString("fr-FR")} FCFA`;
}

/** Message d'erreur envoyé au staff quand le parsing échoue ou qu'un champ obligatoire manque — aucune commande n'est créée. */
export function buildStaffOrderErrorMessage(issues: string[]): string {
  return [
    "❌ Je n'ai pas pu créer la commande :",
    ...issues.map((issue) => `- ${issue}`),
    "",
    "Corrige et renvoie le message /commande complet.",
  ].join("\n");
}

export function buildStaffOrderOutOfZoneMessage(address: string): string {
  return `❌ L'adresse "${address}" semble en dehors de notre zone de livraison (Cotonou / Abomey-Calavi). Commande non créée — vérifie l'adresse avec le client.`;
}

export function buildWaMeOrderLink(businessNumber: string, orderNumber: string, itemsSummary: string, total: number) {
  const text = `Bonjour CHIVI, je confirme ma commande ${orderNumber} :\n${itemsSummary}\nTotal : ${total.toLocaleString("fr-FR")} FCFA`;
  return `https://wa.me/${businessNumber}?text=${encodeURIComponent(text)}`;
}

export function buildPauseAutoReply(reason: string): string {
  return `Bonjour ! 😔 Nous sommes momentanément indisponibles.\nRaison : ${reason}.\nNous reviendrons très bientôt. Pour toute urgence, contactez notre support : wa.me/22959398724`;
}

export function buildOrderCancelledMessage(reason?: string | null): string {
  const parts = ["Votre commande a été annulée."];
  if (reason?.trim()) parts.push(`${reason.trim()}.`);
  parts.push("Contactez-nous si besoin.");
  return parts.join(" ");
}

export function buildResumeMessage(): string {
  return "Bonne nouvelle ! 🎉 CHIVI est de nouveau disponible. Vous pouvez commander maintenant !";
}

/** Récupère l'URL de la photo de profil business WhatsApp actuelle, si définie. */
export async function getBusinessProfilePhotoUrl(): Promise<string | null> {
  const res = await fetch(
    `${GRAPH_BASE}/${phoneNumberId()}/whatsapp_business_profile?fields=profile_picture_url`,
    { headers: { Authorization: `Bearer ${token()}` } }
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: { profile_picture_url?: string }[] };
  return body.data?.[0]?.profile_picture_url ?? null;
}

/**
 * Met à jour la photo de profil business WhatsApp. Contrairement à l'envoi
 * de médias dans une conversation (un simple lien suffit), ce champ exige un
 * "handle" obtenu via l'API Resumable Upload de Meta — un flux en 3 étapes
 * distinct de l'API Cloud classique :
 *   1. Créer une session d'upload (taille + type du fichier).
 *   2. Y déposer les octets → on récupère un handle "h".
 *   3. Référencer ce handle dans whatsapp_business_profile.
 */
export async function updateBusinessProfilePhoto(buffer: Buffer, mimeType: string): Promise<void> {
  const appId = process.env.META_APP_ID;
  if (!appId) throw new Error("META_APP_ID n'est pas configurée");

  const sessionRes = await fetch(
    `${GRAPH_BASE}/${appId}/uploads?file_length=${buffer.length}&file_type=${encodeURIComponent(mimeType)}&access_token=${encodeURIComponent(token())}`,
    { method: "POST" }
  );
  if (!sessionRes.ok) {
    throw new Error(`Échec création session d'upload Meta (${sessionRes.status}): ${await sessionRes.text()}`);
  }
  const session = (await sessionRes.json()) as { id: string };

  const uploadRes = await fetch(`${GRAPH_BASE}/${session.id}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${token()}`,
      file_offset: "0",
    },
    body: new Uint8Array(buffer),
  });
  if (!uploadRes.ok) {
    throw new Error(`Échec upload photo profil (${uploadRes.status}): ${await uploadRes.text()}`);
  }
  const uploaded = (await uploadRes.json()) as { h: string };

  const profileRes = await fetch(`${GRAPH_BASE}/${phoneNumberId()}/whatsapp_business_profile`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", profile_picture_handle: uploaded.h }),
  });
  if (!profileRes.ok) {
    throw new Error(`Échec mise à jour photo profil (${profileRes.status}): ${await profileRes.text()}`);
  }
}
