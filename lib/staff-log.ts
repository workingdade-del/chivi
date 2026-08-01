import { createServiceClient } from "@/lib/supabase/server";
import { sendWhatsappText, extractMessageId, normalizePhone, buildStaffLogSummaryMessage, buildStaffLogSavedMessage } from "@/lib/whatsapp";
import { updateStaffLogDraft, emptyStaffLogDraft, type StaffLogDraft } from "@/lib/staff-log-ai";
import { findBestMatch } from "@/lib/fuzzy-match";
import { findRecentForwardedLocation } from "@/lib/staff-location";

/** Au-delà de cette inactivité, une session /commande-log en cours est abandonnée silencieusement (pas de message, contrairement au reste du flow). */
const STALE_LOG_SESSION_MINUTES = 15;

/** Déclencheurs souples menant à la NOUVELLE session conversationnelle (remplace l'ancien format rigide "/commande-log CLIENT: ..."). */
const LOG_TRIGGER_PHRASES = [
  "/commande-log",
  "enregistre cette commande",
  "enregistrer cette commande",
  "enregistre la commande",
  "enregistrer la commande",
  "note cette commande",
  "note la commande",
  "enregistre",
];

export function isLogSessionTrigger(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return LOG_TRIGGER_PHRASES.some((p) => normalized.startsWith(p));
}

const CONFIRMATION_WORDS = ["oui", "ok", "okay", "correct", "confirme", "confirmé", "c'est bon", "cest bon", "parfait", "exact", "c'est ca", "cest ca", "voila", "voilà"];

function isConfirmationReply(text: string): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  return CONFIRMATION_WORDS.some((w) => normalized === w || normalized.startsWith(`${w} `) || normalized.startsWith(`${w},`));
}

interface StaffLogSessionRow {
  id: string;
  draft: StaffLogDraft;
  awaiting_final_confirmation: boolean;
}

/** Abandon silencieux (pas de message envoyé) de toute session /commande-log inactive depuis plus de 15 minutes — évite qu'une conversation oubliée bloque indéfiniment le staff. */
export async function expireStaleLogSession(staffPhone: string): Promise<void> {
  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - STALE_LOG_SESSION_MINUTES * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("staff_log_sessions")
    .update({ status: "abandoned" })
    .eq("staff_phone", staffPhone)
    .eq("status", "awaiting_confirmation")
    .lt("updated_at", cutoff)
    .select("id");
  if (data?.length) {
    console.log("[staff-log] session(s) log expirée(s) silencieusement (inactivité > 15min)", { staffPhone });
  }
}

export async function getActiveLogSession(staffPhone: string): Promise<StaffLogSessionRow | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("staff_log_sessions")
    .select("id, draft, awaiting_final_confirmation")
    .eq("staff_phone", staffPhone)
    .eq("status", "awaiting_confirmation")
    .maybeSingle();
  return data as StaffLogSessionRow | null;
}

interface ResolvedItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface ResolvedDraft {
  ready: boolean;
  clarification: string | null;
  clientName: string;
  clientPhone: string | null;
  clientProfileId: string | null;
  isExistingClient: boolean;
  matchedItems: ResolvedItem[];
  calculatedTotal: number;
  finalTotal: number;
  locationText: string | null;
  matchedDriver: { id: string; name: string; phone: string } | null;
}

/**
 * Fait correspondre le brouillon (compris par l'IA) avec la base réelle —
 * plats du menu, client existant (par téléphone, ou par nom si aucun
 * téléphone n'a été donné), livreur — et détermine s'il manque encore un
 * champ obligatoire (nom, plats, ou téléphone pour un nouveau client).
 */
async function resolveDraft(draft: StaffLogDraft): Promise<ResolvedDraft> {
  const supabase = createServiceClient();

  const { data: products } = await supabase.from("products").select("id, name, base_price").eq("is_available", true);
  const matchedItems: ResolvedItem[] = [];
  const unmatchedItemNames: string[] = [];
  for (const plat of draft.plats) {
    const match = findBestMatch(plat.nom, products ?? [], (p) => p.name);
    if (match) {
      matchedItems.push({ productId: match.item.id, productName: match.item.name, quantity: plat.quantite, unitPrice: match.item.base_price, lineTotal: match.item.base_price * plat.quantite });
    } else {
      unmatchedItemNames.push(plat.nom);
    }
  }
  const calculatedTotal = matchedItems.reduce((s, i) => s + i.lineTotal, 0);
  // Le staff peut donner un total différent du calcul (réduction, arrangement réel) — on le respecte tel quel.
  const finalTotal = draft.totalFcfa ?? calculatedTotal;

  let clientPhone = draft.clientTel;
  let clientProfileId: string | null = null;
  let isExistingClient = false;
  if (draft.clientNom) {
    if (clientPhone) {
      const { data: existing } = await supabase.from("profiles").select("id").eq("whatsapp_phone", clientPhone).maybeSingle();
      if (existing) {
        clientProfileId = existing.id;
        isExistingClient = true;
      }
    } else {
      // Aucun numéro donné : on cherche si ce nom correspond à un client déjà
      // connu (seuil élevé — un faux positif associerait la commande au
      // mauvais client). Sinon il faudra demander le numéro (nouveau client).
      const { data: profiles } = await supabase.from("profiles").select("id, whatsapp_phone, full_name").not("full_name", "is", null);
      const match = findBestMatch(draft.clientNom, profiles ?? [], (p) => p.full_name ?? "", 0.75);
      if (match) {
        clientPhone = match.item.whatsapp_phone;
        clientProfileId = match.item.id;
        isExistingClient = true;
      }
    }
  }

  const { data: drivers } = await supabase.from("drivers").select("id, name, phone").eq("is_active", true);
  let matchedDriver: { id: string; name: string; phone: string } | null = null;
  if (draft.livreurTel) {
    matchedDriver = (drivers ?? []).find((d) => normalizePhone(d.phone) === normalizePhone(draft.livreurTel!)) ?? null;
  }
  if (!matchedDriver && draft.livreurNom) {
    matchedDriver = findBestMatch(draft.livreurNom, drivers ?? [], (d) => d.name)?.item ?? null;
  }

  const issues: string[] = [];
  if (!draft.clientNom) issues.push("le nom du client");
  if (draft.plats.length === 0) issues.push("ce qui a été commandé");
  if (unmatchedItemNames.length) issues.push(`le(s) plat(s) suivant(s) non reconnu(s) sur notre menu : ${unmatchedItemNames.join(", ")}`);
  if (draft.clientNom && !clientPhone) issues.push("le numéro du client (nouveau client, jamais vu — sinon précise juste que c'est un client connu)");

  return {
    ready: issues.length === 0,
    clarification: issues.length ? `Il me manque encore : ${issues.join(" ; ")}. Peux-tu préciser ?` : null,
    clientName: draft.clientNom ?? "",
    clientPhone,
    clientProfileId,
    isExistingClient,
    matchedItems,
    calculatedTotal,
    finalTotal,
    locationText: draft.localisation,
    matchedDriver,
  };
}

async function sendToStaff(staffPhone: string, message: string): Promise<void> {
  const supabase = createServiceClient();
  try {
    const sendResult = await sendWhatsappText(staffPhone, message);
    await supabase.from("whatsapp_messages").insert({
      wa_message_id: extractMessageId(sendResult),
      direction: "outbound",
      phone: staffPhone,
      message_type: "text",
      content: message,
    });
  } catch (err) {
    console.error("[staff-log] failed to reply to staff", err);
  }
}

/** Résout le brouillon et envoie soit une question de clarification, soit le résumé final "OUI pour confirmer" — met à jour la session en conséquence. */
async function sendSummaryOrClarification(staffPhone: string, sessionId: string, draft: StaffLogDraft): Promise<void> {
  const supabase = createServiceClient();
  const resolved = await resolveDraft(draft);

  if (!resolved.ready) {
    await supabase.from("staff_log_sessions").update({ draft, awaiting_final_confirmation: false }).eq("id", sessionId);
    await sendToStaff(staffPhone, resolved.clarification!);
    return;
  }

  const itemsSummary = resolved.matchedItems.map((i) => `${i.quantity}x ${i.productName}`).join(", ");
  const summary = buildStaffLogSummaryMessage({
    clientName: resolved.clientName,
    clientPhone: resolved.clientPhone,
    isExistingClient: resolved.isExistingClient,
    itemsSummary,
    total: resolved.finalTotal,
    location: resolved.locationText,
    driverName: resolved.matchedDriver?.name ?? null,
  });
  await supabase.from("staff_log_sessions").update({ draft, awaiting_final_confirmation: true }).eq("id", sessionId);
  await sendToStaff(staffPhone, summary);
}

/** Démarre une nouvelle session /commande-log à partir du premier message (texte libre ou audio transcrit). */
export async function startLogSession(staffPhone: string, initialText: string): Promise<void> {
  const supabase = createServiceClient();

  const updated = await updateStaffLogDraft(emptyStaffLogDraft(), initialText);
  if (!updated) {
    console.error("[staff-log] extraction Groq indisponible pour démarrer la session", { staffPhone });
    return;
  }

  // Position transférée juste avant (comme pour l'ancien pipeline /commande) — pré-remplit la localisation si le staff ne l'a pas décrite en texte.
  if (!updated.localisation) {
    const forwardedLocation = await findRecentForwardedLocation(staffPhone);
    if (forwardedLocation) {
      updated.localisation = `Position GPS transférée (${forwardedLocation.lat.toFixed(5)}, ${forwardedLocation.lng.toFixed(5)})`;
    }
  }

  const { data: session, error } = await supabase.from("staff_log_sessions").insert({ staff_phone: staffPhone, draft: updated }).select("id").single();

  if (error || !session) {
    console.error("[staff-log] failed to create staff_log_sessions row", error);
    return;
  }

  await sendSummaryOrClarification(staffPhone, session.id, updated);
}

/** Poursuit une session /commande-log active : soit une confirmation finale ("oui"), soit une correction/précision en langage libre. */
export async function continueLogSession(staffPhone: string, session: StaffLogSessionRow, replyText: string): Promise<void> {
  if (session.awaiting_final_confirmation && isConfirmationReply(replyText)) {
    await finalizeLogSession(staffPhone, session);
    return;
  }

  const updated = await updateStaffLogDraft(session.draft, replyText);
  if (!updated) {
    console.error("[staff-log] extraction Groq indisponible pour la correction", { staffPhone });
    return;
  }

  await sendSummaryOrClarification(staffPhone, session.id, updated);
}

/** Enregistre définitivement la commande — statut "livree" direct, aucun message au client ni au livreur, seule la confirmation finale part au staff. */
async function finalizeLogSession(staffPhone: string, session: StaffLogSessionRow): Promise<void> {
  const supabase = createServiceClient();
  const resolved = await resolveDraft(session.draft);

  if (!resolved.ready) {
    // Ne devrait pas arriver (on ne propose "OUI ?" que si déjà prêt) — filet de sécurité si l'état a changé entre-temps.
    await supabase.from("staff_log_sessions").update({ awaiting_final_confirmation: false }).eq("id", session.id);
    await sendToStaff(staffPhone, resolved.clarification!);
    return;
  }

  let profileId = resolved.clientProfileId;
  if (!profileId) {
    const { data: profile } = await supabase
      .from("profiles")
      .upsert({ whatsapp_phone: resolved.clientPhone!, full_name: resolved.clientName }, { onConflict: "whatsapp_phone", ignoreDuplicates: false })
      .select("id")
      .single();
    profileId = profile?.id ?? null;
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      profile_id: profileId,
      status: "livree",
      payment_status: "paye",
      payment_method: "cash_livraison",
      subtotal: resolved.finalTotal,
      delivery_fee: 0,
      total: resolved.finalTotal,
      delivery_address: resolved.locationText,
      source: "staff_manual_log",
    })
    .select("id, order_number")
    .single();

  if (orderError || !order) {
    console.error("[staff-log] order insert FAILED", orderError);
    return;
  }

  for (const item of resolved.matchedItems) {
    await supabase.from("order_items").insert({
      order_id: order.id,
      product_id: item.productId,
      product_name: item.productName,
      unit_price: item.unitPrice,
      quantity: item.quantity,
      line_total: item.lineTotal,
    });
  }

  if (resolved.matchedDriver) {
    await supabase.from("order_assignments").insert({
      order_id: order.id,
      driver_id: resolved.matchedDriver.id,
      status: "livree",
      delivered_at: new Date().toISOString(),
    });
  }

  await supabase.from("staff_log_sessions").update({ status: "completed" }).eq("id", session.id);

  await sendToStaff(staffPhone, buildStaffLogSavedMessage(order.order_number, resolved.finalTotal));
}
