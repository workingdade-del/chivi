import { createServiceClient } from "@/lib/supabase/server";
import { sendWhatsappText, extractMessageId, normalizePhone, buildStaffLogSummaryMessage, buildStaffLogSavedMessage } from "@/lib/whatsapp";
import { updateStaffLogDraft, emptyStaffLogDraft, type StaffLogDraft } from "@/lib/staff-log-ai";
import { findBestMatch } from "@/lib/fuzzy-match";
import { findRecentForwardedLocation } from "@/lib/staff-location";
import { handleStaffQuestion } from "@/lib/staff-query";
import { classifyStaffIntent } from "@/lib/ai-provider";

/** Au-delà de cette inactivité, une session /commande-log en cours est abandonnée silencieusement (pas de message, contrairement au reste du flow). */
const STALE_LOG_SESSION_MINUTES = 15;

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

/** Résumé court d'un draft en cours, donné au routeur d'intentions (classifyStaffIntent) pour qu'il distingue "le staff continue cette commande" de "le staff change de sujet". */
function summarizeDraftForContext(draft: StaffLogDraft): string {
  const parts: string[] = [];
  if (draft.clientNom) parts.push(`client : ${draft.clientNom}`);
  if (draft.plats.length) parts.push(`plats : ${draft.plats.map((p) => `${p.quantite}x ${p.nom}`).join(", ")}`);
  if (draft.totalFcfa != null) parts.push(`total : ${draft.totalFcfa} FCFA`);
  return parts.length ? parts.join(" ; ") : "rien de précisé encore";
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
  variantId: string | null;
  variantName: string | null;
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

  // Repli défensif : si l'IA n'a pas isolé de prix par plat (prix_unitaire)
  // mais qu'un total global EST donné pour une commande à un seul article en
  // quantité 1, ce total est sans ambiguïté le prix unitaire de cet article
  // — on ne dépend pas uniquement du bon respect du prompt par le modèle
  // (ex réel : "1x Atassi Chivi variante de 2000 ... Total: 2000").
  if (draft.plats.length === 1 && draft.plats[0].quantite === 1 && draft.plats[0].prixUnitaire == null && draft.totalFcfa != null) {
    draft = { ...draft, plats: [{ ...draft.plats[0], prixUnitaire: draft.totalFcfa }] };
  }

  const { data: products } = await supabase.from("products").select("id, name, base_price").eq("is_available", true).order("id");
  const { data: variantRows } = await supabase.from("product_variants").select("id, product_id, name, price").eq("is_available", true).order("id");
  console.log("[staff-log] resolveDraft — entrée", { draft });
  const matchedItems: ResolvedItem[] = [];
  const unmatchedItemNames: string[] = [];
  for (const plat of draft.plats) {
    const match = findBestMatch(plat.nom, products ?? [], (p) => p.name);
    if (match) {
      let unitPrice = match.item.base_price;
      let variantId: string | null = null;
      let variantName: string | null = null;
      if (plat.prixUnitaire != null) {
        // Le staff a précisé un prix pour CE plat — s'il correspond
        // exactement à une variante connue du menu, on sélectionne CETTE
        // variante (pas le prix de base) ; sinon on respecte quand même le
        // prix annoncé plutôt que d'afficher le prix de base en silence —
        // c'est exactement l'incohérence du bug CHV-2086/2088 ("1x Atassi
        // CHIVI à 1000 FCFA" alors que le staff avait dit 1200).
        const productVariants = (variantRows ?? []).filter((v) => v.product_id === match.item.id);
        const variantMatch = productVariants.find((v) => v.price === plat.prixUnitaire);
        if (variantMatch) {
          unitPrice = variantMatch.price;
          variantId = variantMatch.id;
          variantName = variantMatch.name;
        } else {
          unitPrice = plat.prixUnitaire;
        }
      }
      matchedItems.push({
        productId: match.item.id,
        productName: match.item.name,
        variantId,
        variantName,
        quantity: plat.quantite,
        unitPrice,
        lineTotal: unitPrice * plat.quantite,
      });
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
      // ORDER BY explicite : sans lui, Postgres ne garantit AUCUN ordre de
      // retour stable, donc si deux clients ont un nom proche (ex: deux
      // "Abiola"), findBestMatch pouvait retomber sur un profil DIFFÉRENT
      // d'un appel à l'autre — bug réel observé (même conversation, même
      // client, numéro de téléphone différent entre deux tours).
      const { data: profiles } = await supabase.from("profiles").select("id, whatsapp_phone, full_name").not("full_name", "is", null).order("id");
      const match = findBestMatch(draft.clientNom, profiles ?? [], (p) => p.full_name ?? "", 0.75);
      console.log("[staff-log] resolveDraft — matching client par nom", { clientNom: draft.clientNom, matchScore: match?.score ?? null, matchedProfileId: match?.item.id ?? null, matchedPhone: match?.item.whatsapp_phone ?? null });
      if (match) {
        clientPhone = match.item.whatsapp_phone;
        clientProfileId = match.item.id;
        isExistingClient = true;
      }
    }
  }

  const { data: drivers } = await supabase.from("drivers").select("id, name, phone").eq("is_active", true).order("id");
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

  console.log("[staff-log] resolveDraft — résultat", {
    ready: issues.length === 0,
    clientName: draft.clientNom,
    clientPhone,
    clientProfileId,
    isExistingClient,
    matchedItems,
    unmatchedItemNames,
    calculatedTotal,
    finalTotal: draft.totalFcfa ?? calculatedTotal,
  });

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

  // Une fois le client résolu (téléphone explicite OU correspondance par
  // nom), on FIXE ce téléphone dans le draft persisté. Sans ça, chaque tour
  // relançait un matching flou par nom depuis zéro, qui pouvait retomber sur
  // un PROFIL DIFFÉRENT (bug réel : même conversation, même client "Abiola",
  // numéro différent entre deux tours) — une fois épinglé, il ne peut plus dériver.
  if (resolved.clientPhone && draft.clientTel !== resolved.clientPhone) {
    console.log("[staff-log] client résolu — épinglage du téléphone dans le draft", { sessionId, staffPhone, before: draft.clientTel, after: resolved.clientPhone });
    draft = { ...draft, clientTel: resolved.clientPhone };
  }

  if (!resolved.ready) {
    await supabase.from("staff_log_sessions").update({ draft, awaiting_final_confirmation: false }).eq("id", sessionId);
    await sendToStaff(staffPhone, resolved.clarification!);
    return;
  }

  const summary = buildStaffLogSummaryMessage({
    clientName: resolved.clientName,
    clientPhone: resolved.clientPhone,
    isExistingClient: resolved.isExistingClient,
    items: resolved.matchedItems.map((i) => ({
      productName: i.productName,
      variantName: i.variantName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
    })),
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
  console.log("[staff-log] startLogSession", { staffPhone, initialText });

  const updated = await updateStaffLogDraft(emptyStaffLogDraft(), initialText);
  if (!updated) {
    console.error("[staff-log] échec d'extraction IA pour démarrer la session", { staffPhone });
    // Ne jamais laisser le staff sans réponse — un échec silencieux ici
    // était indiscernable d'un message perdu (aucune trace côté staff).
    await sendToStaff(staffPhone, "Désolé, je n'ai pas pu comprendre ce message. Réessaie en précisant le client et les plats commandés.");
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

/** Poursuit une session /commande-log active : soit une confirmation finale ("oui"), soit une correction/précision en langage libre (log_order), soit une question business ou un message social qui interrompt temporairement sans toucher la session — voir classifyStaffIntent. */
export async function continueLogSession(staffPhone: string, session: StaffLogSessionRow, replyText: string): Promise<void> {
  console.log("[staff-log] continueLogSession", { staffPhone, sessionId: session.id, awaitingFinalConfirmation: session.awaiting_final_confirmation, replyText });

  if (session.awaiting_final_confirmation && isConfirmationReply(replyText)) {
    await finalizeLogSession(staffPhone, session);
    return;
  }

  // Une question business ("fais-moi le point du mois") ou un message social
  // ("super", "merci") peut arriver EN PLEIN MILIEU d'une session
  // /commande-log active — le check global dans staff-order.ts ne voit
  // JAMAIS ce cas puisqu'une session active court-circuite tout avant
  // d'atteindre ce check. Sans ce garde-fou ICI, le message était absorbé à
  // tort comme une correction de la commande en cours (updateStaffLogDraft
  // le traitait comme du texte à intégrer au draft, produisant un nouveau
  // résumé, ou pire, dupliquant/corrompant le draft). La session active
  // n'est PAS touchée dans les deux cas : le staff peut reprendre sa
  // commande juste après. classifyStaffIntent reçoit un résumé du draft en
  // cours pour distinguer "continue cette commande" de "change de sujet".
  const intent = await classifyStaffIntent(replyText, summarizeDraftForContext(session.draft)).catch((err) => {
    console.error("[staff-log] classification d'intention échouée pendant une session active — repli sur log_order", { staffPhone, sessionId: session.id, errorMessage: err instanceof Error ? err.message : String(err) });
    return { tool: "log_order" as const };
  });
  console.log("[staff-log] intention classifiée pendant une session active", { staffPhone, sessionId: session.id, intent: intent.tool, replyText });

  if (intent.tool === "query_business_stats") {
    console.log("[staff-log] question business détectée pendant une session active — session laissée intacte", { staffPhone, sessionId: session.id });
    await handleStaffQuestion(staffPhone, replyText);
    return;
  }
  if (intent.tool === "small_talk") {
    console.log("[staff-log] message social détecté pendant une session active — session laissée intacte", { staffPhone, sessionId: session.id });
    await sendToStaff(staffPhone, intent.reply);
    return;
  }

  const updated = await updateStaffLogDraft(session.draft, replyText);
  if (!updated) {
    console.error("[staff-log] échec d'extraction IA pour la correction", { staffPhone });
    await sendToStaff(staffPhone, "Désolé, je n'ai pas pu comprendre ce message. Réessaie en reformulant la correction.");
    return;
  }

  await sendSummaryOrClarification(staffPhone, session.id, updated);
}

/** Enregistre définitivement la commande — statut "livree" direct, aucun message au client ni au livreur, seule la confirmation finale part au staff. */
async function finalizeLogSession(staffPhone: string, session: StaffLogSessionRow): Promise<void> {
  const supabase = createServiceClient();
  console.log("[staff-log] finalizeLogSession", { staffPhone, sessionId: session.id, draft: session.draft });
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
      product_variant_id: item.variantId,
      product_name: item.productName,
      variant_name: item.variantName,
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
