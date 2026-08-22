import { createServiceClient } from "@/lib/supabase/server";
import { sendWhatsappText, extractMessageId, normalizePhone, buildStaffLogSummaryMessage, buildStaffLogSavedMessage } from "@/lib/whatsapp";
import { updateStaffLogDraft, emptyStaffLogDraft, type StaffLogDraft } from "@/lib/staff-log-ai";
import { findBestMatch, similarity } from "@/lib/fuzzy-match";
import { findRecentForwardedLocation } from "@/lib/staff-location";
import { classifyStaffIntent } from "@/lib/ai-provider";
import { handleNonOrderIntent } from "@/lib/staff-intent-dispatch";

/** Au-delà de cette inactivité, une session /commande-log en cours est abandonnée silencieusement (pas de message, contrairement au reste du flow). */
const STALE_LOG_SESSION_MINUTES = 15;

const CONFIRMATION_WORDS = ["oui", "ok", "okay", "correct", "confirme", "confirmé", "c'est bon", "cest bon", "parfait", "exact", "c'est ca", "cest ca", "voila", "voilà"];

export function isConfirmationReply(text: string): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  return CONFIRMATION_WORDS.some((w) => normalized === w || normalized.startsWith(`${w} `) || normalized.startsWith(`${w},`));
}

/** Un candidat plat/variante pour le matching flou — voir buildDishCandidates. */
interface DishCandidate {
  matchLabel: string;
  displayLabel: string;
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  unitPrice: number;
}

interface PendingDisambiguation {
  platIndex: number;
  originalText: string;
  options: DishCandidate[];
}

interface StaffLogSessionRow {
  id: string;
  draft: StaffLogDraft;
  awaiting_final_confirmation: boolean;
  pending_disambiguation: PendingDisambiguation | null;
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
    .select("id, draft, awaiting_final_confirmation, pending_disambiguation")
    .eq("staff_phone", staffPhone)
    .eq("status", "awaiting_confirmation")
    .maybeSingle();
  return data as StaffLogSessionRow | null;
}

/** Construit la liste des candidats plat/variante contre lesquels matcher — chaque produit seul (prix de base) ET chaque combinaison produit+variante (prix de la variante), pour que le staff puisse décrire soit le plat de base, soit directement une variante précise ("Frites Alloco poulet Mayo") sans jamais avoir à connaître le libellé exact attendu. */
function buildDishCandidates(
  products: { id: string; name: string; base_price: number }[],
  variants: { id: string; product_id: string; name: string; price: number }[]
): DishCandidate[] {
  const candidates: DishCandidate[] = [];
  for (const p of products) {
    candidates.push({ matchLabel: p.name, displayLabel: p.name, productId: p.id, productName: p.name, variantId: null, variantName: null, unitPrice: p.base_price });
    for (const v of variants.filter((v) => v.product_id === p.id)) {
      candidates.push({
        matchLabel: `${p.name} ${v.name}`,
        displayLabel: `${p.name} (${v.name})`,
        productId: p.id,
        productName: p.name,
        variantId: v.id,
        variantName: v.name,
        unitPrice: v.price,
      });
    }
  }
  return candidates;
}

/**
 * Découpe en mots significatifs (>2 caractères) pour la couverture par mot
 * ci-dessous — même normalisation (accents/casse) que similarity().
 */
function normalizeWords(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

/**
 * Fraction des mots de la requête retrouvés (par similarité, pas égalité
 * stricte — tolère une petite faute de frappe par mot) dans le libellé
 * candidat. Contrairement à similarity() (Levenshtein sur la chaîne
 * entière), cette métrique RÉCOMPENSE le candidat qui explique LE PLUS de ce
 * que le staff a dit : un plat de base dont le nom est un préfixe exact du
 * message ("Frites Alloco CHIVI" vs "Frites Alloco chivi variante poulet
 * mayo") gagne un bonus "inclusion" à 0.9 avec similarity() seule, battant à
 * tort une combinaison plat+variante plus complète mais moins similaire
 * caractère-par-caractère — la couverture par mot corrige cet effet.
 */
function queryWordCoverage(query: string, label: string): number {
  const queryWords = normalizeWords(query);
  const labelWords = normalizeWords(label);
  if (queryWords.length === 0 || labelWords.length === 0) return 0;
  let matched = 0;
  for (const qw of queryWords) {
    const best = Math.max(0, ...labelWords.map((lw) => similarity(qw, lw)));
    if (best >= 0.75) matched += 1;
  }
  return matched / queryWords.length;
}

/** Score combiné : couverture par mot (dominante) + similarité caractère entière (tolère les fautes de frappe sur un plat unique, sans variante à départager). */
function dishScore(query: string, label: string): number {
  return queryWordCoverage(query, label) * 0.7 + similarity(query, label) * 0.3;
}

/**
 * Seuils du matching plat/variante — délibérément permissifs par rapport à
 * findBestMatch (0.55 par défaut) : le staff décrit rarement un plat avec le
 * libellé exact du menu ("Jus pamplemousse" au lieu de "Jus Pamplemousse
 * (Youki)"), et un rejet silencieux en dessous du seuil forçait le staff à
 * deviner la formulation exacte par essais-erreurs. Au-dessus de
 * HIGH_CONFIDENCE, on accepte directement ; entre les deux seuils, on
 * propose les meilleurs candidats au lieu d'échouer platement.
 */
const DISH_MATCH_HIGH_CONFIDENCE = 0.8;
const DISH_MATCH_LOW_THRESHOLD = 0.35;
/** Écart en dessous duquel deux candidats sont considérés "à égalité" plutôt que l'un strictement meilleur que l'autre. */
const DISH_MATCH_TIE_MARGIN = 0.05;

interface DishMatchResult {
  certain: DishCandidate | null;
  ambiguous: DishCandidate[];
}

function matchDish(query: string, candidates: DishCandidate[]): DishMatchResult {
  const scored = candidates.map((c) => ({ c, score: dishScore(query, c.matchLabel) })).sort((a, b) => b.score - a.score);
  if (!scored.length || scored[0].score < DISH_MATCH_LOW_THRESHOLD) return { certain: null, ambiguous: [] };

  // Regroupe les candidats dont le score est quasi égal au meilleur — sans
  // ça, un score maximal partagé par plusieurs candidats DISTINCTS (ex:
  // "jus youki" qui correspond aussi bien à 3 parfums différents) choisirait
  // arbitrairement le premier au lieu de demander de préciser.
  const topScore = scored[0].score;
  const contenders: DishCandidate[] = [];
  const seenLabels = new Set<string>();
  for (const s of scored) {
    if (s.score < topScore - DISH_MATCH_TIE_MARGIN) break;
    if (seenLabels.has(s.c.displayLabel)) continue;
    seenLabels.add(s.c.displayLabel);
    contenders.push(s.c);
  }

  if (topScore >= DISH_MATCH_HIGH_CONFIDENCE) {
    if (contenders.length === 1) return { certain: contenders[0], ambiguous: [] };
    // Égalité entre le produit de base et SES PROPRES variantes (aucune
    // variante précise mentionnée) : le produit de base est l'interprétation
    // par défaut la plus sûre. Une égalité entre produits DIFFÉRENTS reste ambiguë.
    const sameProduct = contenders.every((c) => c.productId === contenders[0].productId);
    if (sameProduct) {
      const base = contenders.find((c) => c.variantId === null);
      if (base) return { certain: base, ambiguous: [] };
    }
    return { certain: null, ambiguous: contenders.slice(0, 3) };
  }

  const top: DishCandidate[] = [];
  const seen = new Set<string>();
  for (const s of scored) {
    if (s.score < DISH_MATCH_LOW_THRESHOLD) break;
    if (seen.has(s.c.displayLabel)) continue;
    seen.add(s.c.displayLabel);
    top.push(s.c);
    if (top.length >= 3) break;
  }
  return { certain: null, ambiguous: top };
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
  discountAmount: number;
  finalTotal: number;
  locationText: string | null;
  matchedDriver: { id: string; name: string; phone: string } | null;
  pendingDisambiguation: PendingDisambiguation | null;
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

  const dishCandidates = buildDishCandidates(products ?? [], variantRows ?? []);
  const matchedItems: ResolvedItem[] = [];
  const unmatchedItemNames: string[] = [];
  let pendingDisambiguation: PendingDisambiguation | null = null;

  for (let i = 0; i < draft.plats.length; i++) {
    const plat = draft.plats[i];
    // 1. Matching par nom contre plats ET variantes combinés (plus permissif
    // que l'ancien matching produit-seul) — couvre directement une
    // formulation de variante ("Frites Alloco poulet Mayo") sans dépendre
    // uniquement d'un prix explicite pour la sélectionner.
    const nameMatch = matchDish(plat.nom, dishCandidates);

    if (nameMatch.certain) {
      const c = nameMatch.certain;
      let unitPrice = c.unitPrice;
      let variantId = c.variantId;
      let variantName = c.variantName;
      // Si le nom a résolu vers le produit de BASE (pas de variante trouvée
      // par nom) mais qu'un prix précis a aussi été donné, le prix reste le
      // signal le plus fiable pour choisir ENTRE les variantes d'un même
      // plat (ex: "Atassi variante de 1200f" — le nom seul ne distingue pas
      // la variante, mais le prix si).
      if (variantId === null && plat.prixUnitaire != null) {
        const productVariants = (variantRows ?? []).filter((v) => v.product_id === c.productId);
        const variantMatch = productVariants.find((v) => v.price === plat.prixUnitaire);
        if (variantMatch) {
          unitPrice = variantMatch.price;
          variantId = variantMatch.id;
          variantName = variantMatch.name;
        } else {
          unitPrice = plat.prixUnitaire;
        }
      }
      matchedItems.push({ productId: c.productId, productName: c.productName, variantId, variantName, quantity: plat.quantite, unitPrice, lineTotal: unitPrice * plat.quantite });
      continue;
    }

    if (nameMatch.ambiguous.length > 0) {
      // Une seule désambiguïsation à la fois — si un autre plat est déjà en
      // attente, celui-ci reste simplement "non résolu" pour ce tour ; il
      // sera re-proposé au tour suivant une fois le premier tranché.
      if (!pendingDisambiguation) {
        pendingDisambiguation = { platIndex: i, originalText: plat.nom, options: nameMatch.ambiguous };
      }
      unmatchedItemNames.push(plat.nom);
      continue;
    }

    unmatchedItemNames.push(plat.nom);
  }
  const rawCalculatedTotal = matchedItems.reduce((s, i) => s + i.lineTotal, 0);
  const discountAmount = draft.reductionFcfa ?? 0;
  const calculatedTotal = Math.max(0, rawCalculatedTotal - discountAmount);
  // Le staff peut donner un total différent du calcul (arrangement réel) — on le respecte tel quel, réduction déjà incluse dedans si mentionnée en même temps.
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
    pendingDisambiguation,
    calculatedTotal,
    finalTotal: draft.totalFcfa ?? calculatedTotal,
  });

  // La désambiguïsation numérotée prend le pas sur le message générique
  // "il me manque..." — c'est l'action concrète et immédiate à donner au
  // staff, plutôt qu'une simple liste de champs manquants.
  let clarification: string | null = issues.length ? `Il me manque encore : ${issues.join(" ; ")}. Peux-tu préciser ?` : null;
  if (pendingDisambiguation) {
    const optionsList = pendingDisambiguation.options.map((o, idx) => `${idx + 1}) ${o.displayLabel}`).join("\n");
    clarification = `Je ne suis pas sûr du plat "${pendingDisambiguation.originalText}" — vouliez-vous dire :\n${optionsList}\nRéponds avec le numéro, ou précise autrement.`;
  }

  return {
    ready: issues.length === 0,
    clarification,
    clientName: draft.clientNom ?? "",
    clientPhone,
    clientProfileId,
    isExistingClient,
    matchedItems,
    calculatedTotal,
    discountAmount,
    finalTotal,
    locationText: draft.localisation,
    matchedDriver,
    pendingDisambiguation,
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
    await supabase
      .from("staff_log_sessions")
      .update({ draft, awaiting_final_confirmation: false, pending_disambiguation: resolved.pendingDisambiguation })
      .eq("id", sessionId);
    await sendToStaff(staffPhone, resolved.clarification!);
    return;
  }

  // Prêt : aucune désambiguïsation ne peut rester en attente (elle aurait
  // empêché `ready`), mais on la nettoie explicitement par sécurité.
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
    discountAmount: resolved.discountAmount,
    location: resolved.locationText,
    driverName: resolved.matchedDriver?.name ?? null,
  });
  await supabase.from("staff_log_sessions").update({ draft, awaiting_final_confirmation: true, pending_disambiguation: null }).eq("id", sessionId);
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

/**
 * Résout une réponse de désambiguïsation ("1", "2 la petite", ou juste le
 * libellé) DE FAÇON DÉTERMINISTE — jamais re-devinée par l'IA. L'IA a
 * démontré, sur cette même conversation (duplication de plats, dérive du
 * numéro client), qu'elle ne préserve pas fiablement un état structuré d'un
 * tour à l'autre ; un choix numéroté est simple et sans ambiguïté à
 * résoudre en code, donc on ne lui délègue pas cette étape.
 */
function tryResolveDisambiguationReply(pending: PendingDisambiguation, replyText: string): DishCandidate | null {
  const trimmed = replyText.trim();
  const numMatch = trimmed.match(/^(\d+)/);
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10) - 1;
    return pending.options[idx] ?? null;
  }
  return findBestMatch(trimmed, pending.options, (o) => o.displayLabel, 0.5)?.item ?? null;
}

function applyDisambiguationChoice(draft: StaffLogDraft, platIndex: number, candidate: DishCandidate): StaffLogDraft {
  const plats = [...draft.plats];
  const original = plats[platIndex];
  if (!original) return draft;
  // matchLabel (pas displayLabel) : ré-exécuté contre matchDish au prochain
  // resolveDraft, il doit matcher ce MÊME candidat avec un score de 1
  // (identique) pour ne jamais retomber en ambigu ou pire, sur un autre
  // candidat — displayLabel a un formatage (parenthèses) qui n'a aucune
  // raison de rester identique après normalisation. prixUnitaire n'est PAS
  // touché ici : une fois le nom certain, la variante vient directement du
  // candidat (pas d'un lookup par prix), donc le laisser tel quel évite
  // qu'un prix coïncidant par hasard avec une autre variante ne la
  // sélectionne à tort.
  plats[platIndex] = { ...original, nom: candidate.matchLabel };
  return { ...draft, plats };
}

/** Poursuit une session /commande-log active : soit une confirmation finale ("oui"), soit une réponse à une désambiguïsation de plat en attente, soit une correction/précision en langage libre (log_order), soit une question business ou un message social qui interrompt temporairement sans toucher la session — voir classifyStaffIntent. */
export async function continueLogSession(staffPhone: string, session: StaffLogSessionRow, replyText: string): Promise<void> {
  console.log("[staff-log] continueLogSession", { staffPhone, sessionId: session.id, awaitingFinalConfirmation: session.awaiting_final_confirmation, hasPendingDisambiguation: !!session.pending_disambiguation, replyText });

  if (session.awaiting_final_confirmation && isConfirmationReply(replyText)) {
    await finalizeLogSession(staffPhone, session);
    return;
  }

  if (session.pending_disambiguation) {
    const chosen = tryResolveDisambiguationReply(session.pending_disambiguation, replyText);
    if (chosen) {
      console.log("[staff-log] désambiguïsation résolue", { staffPhone, sessionId: session.id, chosen: chosen.displayLabel });
      const updatedDraft = applyDisambiguationChoice(session.draft, session.pending_disambiguation.platIndex, chosen);
      await sendSummaryOrClarification(staffPhone, session.id, updatedDraft);
      return;
    }
    // La réponse ne ressemble à aucune option proposée — on abandonne cette
    // désambiguïsation (persistée à null par sendSummaryOrClarification au
    // prochain resolveDraft) et on retraite le message normalement
    // ci-dessous (nouvelle intention, ou nouvelle tentative de description).
    console.log("[staff-log] réponse ne correspond à aucune option de désambiguïsation — retraitement normal", { staffPhone, sessionId: session.id, replyText });
  }

  // Une question business, une action client (renommer/changer numéro) ou
  // un message social peut arriver EN PLEIN MILIEU d'une session
  // /commande-log active — le check global dans staff-order.ts ne voit
  // JAMAIS ce cas puisqu'une session active court-circuite tout avant
  // d'atteindre ce check. Sans ce garde-fou ICI, le message était absorbé à
  // tort comme une correction de la commande en cours (updateStaffLogDraft
  // le traitait comme du texte à intégrer au draft, produisant un nouveau
  // résumé, ou pire, dupliquant/corrompant le draft). La session active
  // n'est PAS touchée dans tous ces cas : le staff peut reprendre sa
  // commande juste après. classifyStaffIntent reçoit un résumé du draft en
  // cours pour distinguer "continue cette commande" de "change de sujet".
  const intent = await classifyStaffIntent(replyText, summarizeDraftForContext(session.draft)).catch((err) => {
    console.error("[staff-log] classification d'intention échouée pendant une session active — repli sur log_order", { staffPhone, sessionId: session.id, errorMessage: err instanceof Error ? err.message : String(err) });
    return { tool: "log_order" as const };
  });
  console.log("[staff-log] intention classifiée pendant une session active", { staffPhone, sessionId: session.id, intent: intent.tool, replyText });

  if (await handleNonOrderIntent(staffPhone, intent, replyText)) {
    console.log("[staff-log] intention non-log_order traitée pendant une session active — session laissée intacte", { staffPhone, sessionId: session.id, intent: intent.tool });
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
      discount_amount: resolved.discountAmount,
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
