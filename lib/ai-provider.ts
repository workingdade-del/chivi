import Anthropic from "@anthropic-ai/sdk";
import Groq from "groq-sdk";
import { createServiceClient } from "@/lib/supabase/server";
import { generateGroqReply, type ChatTurn } from "@/lib/groq";
import {
  queryRevenueSummary,
  queryTopDish,
  queryMarginSummary,
  queryDriverDeliveryCount,
  type QueryPeriod,
} from "@/lib/business-queries";

/**
 * Sélection du modèle IA pour la conversation WhatsApp (Admin →
 * Paramètres → Intelligence Artificielle), lue à chaque appel depuis
 * system_settings — un changement de réglage s'applique donc
 * immédiatement, sans redéploiement.
 *
 * IMPORTANT : ce choix ne concerne QUE la génération de réponse
 * conversationnelle (texte). La transcription des messages vocaux reste
 * TOUJOURS sur Groq Whisper (lib/groq.ts::transcribeAudio), quel que soit
 * le modèle sélectionné ici — Claude n'a pas d'API de transcription audio
 * native équivalente. Si "claude" est sélectionné, seule la génération de
 * texte bascule vers Claude ; l'audio entrant est toujours transcrit par
 * Groq Whisper avant d'être transmis au modèle choisi.
 */
export async function getAiModel(): Promise<"groq" | "claude"> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("system_settings").select("ai_model").eq("id", true).maybeSingle();
  return data?.ai_model === "claude" ? "claude" : "groq";
}

const CLAUDE_MODEL = "claude-sonnet-5";

/**
 * generateClaudeJson/answerWithClaude n'avaient pas de try/catch local —
 * une erreur API se propageait jusqu'à l'appelant (staff-log-ai.ts,
 * staff-query.ts) qui ne loggue que `err.message`, un texte parfois trop
 * générique ("400 {...}" tronqué) pour diagnostiquer sans deviner. Ici on
 * capture les champs structurés que l'API Anthropic renvoie explicitement
 * (status HTTP, type d'erreur, corps JSON complet) AVANT de relancer
 * l'erreur telle quelle, pour que le comportement (fallback, message
 * staff) reste identique mais que le log contienne la raison exacte.
 */
function logClaudeError(context: string, err: unknown, extra: Record<string, unknown>): void {
  if (err instanceof Anthropic.APIError) {
    console.error(`[ai-provider] ${context} — erreur API Anthropic`, {
      ...extra,
      status: err.status,
      type: err.type,
      requestID: err.requestID,
      body: err.error,
      message: err.message,
    });
  } else {
    console.error(`[ai-provider] ${context} — erreur non-API`, { ...extra, errorMessage: err instanceof Error ? err.message : String(err) });
  }
}

async function generateClaudeReply(systemPrompt: string, history: ChatTurn[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY n'est pas configurée");
  }

  const anthropic = new Anthropic({ apiKey });
  // `temperature` n'est plus accepté par ce modèle (erreur API confirmée en
  // production : "`temperature` is deprecated for this model") — retiré ici
  // et sur tous les autres appels Anthropic de ce fichier plutôt que de
  // deviner un paramètre de remplacement ; comportement par défaut du modèle.
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 400,
    system: systemPrompt,
    messages: history.map((turn) => ({ role: turn.role, content: turn.content })),
  });

  const text = message.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") {
    throw new Error(`Réponse Claude vide: ${JSON.stringify(message)}`);
  }
  return text.text.trim();
}

/** Point d'entrée unique pour la conversation IA — dispatché vers Groq ou Claude selon system_settings.ai_model. */
export async function generateAiReply(systemPrompt: string, history: ChatTurn[]): Promise<string> {
  const model = await getAiModel();
  return model === "claude" ? generateClaudeReply(systemPrompt, history) : generateGroqReply(systemPrompt, history);
}

const GROQ_MODEL = "llama-3.1-8b-instant";

async function generateGroqJson(prompt: string): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn("[ai-provider] GROQ_API_KEY absente — extraction JSON ignorée");
    return null;
  }
  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.1,
    max_tokens: 600,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });
  return completion.choices[0]?.message?.content?.trim() ?? null;
}

/**
 * Extraction JSON forcée côté Claude via structured outputs
 * (output_config.format) — PAS la technique de "prefill" (démarrer le tour
 * assistant par "{") utilisée avant : Claude Sonnet 5 (et toute la famille
 * 4.6+) rejette un tour assistant en fin de conversation avec une erreur 400
 * ("prefill" non supporté), ce qui cassait systématiquement cette extraction
 * même après le fix du paramètre temperature — deux bugs distincts sur le
 * même appel. output_config.format est la méthode officiellement supportée
 * pour contraindre la sortie JSON sur ce modèle.
 */
async function generateClaudeJson(prompt: string, schema: Record<string, unknown>): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[ai-provider] ANTHROPIC_API_KEY absente — extraction JSON ignorée");
    return null;
  }
  const anthropic = new Anthropic({ apiKey });
  try {
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 600,
      output_config: { format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: prompt }],
    });
    const text = message.content.find((block) => block.type === "text");
    if (!text || text.type !== "text") return null;
    return text.text.trim();
  } catch (err) {
    logClaudeError("generateClaudeJson", err, { promptPreview: prompt.slice(0, 200) });
    throw err;
  }
}

/**
 * Point d'entrée unique pour l'extraction structurée (JSON) — utilisé par
 * lib/staff-log-ai.ts. Dispatché vers Groq ou Claude selon
 * system_settings.ai_model, comme generateAiReply. `schema` n'est utilisé que
 * côté Claude (structured outputs) — Groq force déjà un JSON valide via
 * response_format:"json_object" sans avoir besoin du schéma exact.
 */
export async function generateStructuredJson(prompt: string, schema: Record<string, unknown>): Promise<string | null> {
  const model = await getAiModel();
  return model === "claude" ? generateClaudeJson(prompt, schema) : generateGroqJson(prompt);
}

// ============================================================
// Interface de question Admin (lib/staff-query.ts) — l'IA répond aux
// questions business ("quel est le total du jour ?") en appelant une
// vraie fonction DB via tool calling, jamais en inventant un chiffre.
// Un seul aller-retour d'outil est géré (suffisant pour toutes les
// questions visées : chaque question correspond à un seul appel).
// ============================================================

const PERIOD_ENUM = ["today", "week", "month"] as const;
const PERIOD_DESC = "today = aujourd'hui, week = cette semaine (lundi à dimanche), month = ce mois-ci";

/** Exécute l'appel d'outil demandé par le modèle contre une vraie requête DB — jamais de valeur inventée. */
async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const period = (PERIOD_ENUM as readonly string[]).includes(input.period as string) ? (input.period as QueryPeriod) : "today";
  switch (name) {
    case "get_revenue_summary":
      return queryRevenueSummary(period);
    case "get_top_dish":
      return queryTopDish(period);
    case "get_margin_summary":
      return queryMarginSummary(period);
    case "get_driver_delivery_count":
      return queryDriverDeliveryCount(String(input.driverName ?? ""), period);
    default:
      return { error: `Outil inconnu: ${name}` };
  }
}

const BUSINESS_QUESTION_SYSTEM_PROMPT = `Tu es l'assistant business de CHIVI (dark kitchen à Cotonou, Bénin), utilisé par le staff via WhatsApp pour poser des questions sur l'activité (revenus, commandes, plats vendus, marge, livreurs). Réponds TOUJOURS en français, de façon brève et directe (1-3 phrases, adaptée à WhatsApp).

RÈGLE ABSOLUE : tu n'as JAMAIS le droit d'inventer ou d'estimer un chiffre. Pour toute question portant sur un montant, un nombre de commandes, un plat, une marge ou un livreur, tu DOIS appeler l'outil correspondant et baser ta réponse UNIQUEMENT sur son résultat. Si aucun outil ne correspond à la question, dis clairement que tu ne peux pas y répondre pour l'instant plutôt que de deviner.`;

const GROQ_TOOLS: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_revenue_summary",
      description: "Chiffre d'affaires et nombre de commandes pour une période.",
      parameters: {
        type: "object",
        properties: { period: { type: "string", enum: PERIOD_ENUM as unknown as string[], description: PERIOD_DESC } },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_dish",
      description: "Le plat le plus vendu (en quantité) pour une période.",
      parameters: {
        type: "object",
        properties: { period: { type: "string", enum: PERIOD_ENUM as unknown as string[], description: PERIOD_DESC } },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_margin_summary",
      description: "Marge (coûts ingrédients/emballage) pour une période, avec le % de ventes dont le coût est connu.",
      parameters: {
        type: "object",
        properties: { period: { type: "string", enum: PERIOD_ENUM as unknown as string[], description: PERIOD_DESC } },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_driver_delivery_count",
      description: "Nombre de livraisons effectuées par un livreur donné (recherche par nom, insensible à la casse) sur une période.",
      parameters: {
        type: "object",
        properties: {
          driverName: { type: "string", description: "Nom (ou partie du nom) du livreur" },
          period: { type: "string", enum: PERIOD_ENUM as unknown as string[], description: PERIOD_DESC },
        },
        required: ["driverName", "period"],
      },
    },
  },
];

async function answerWithGroq(question: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY n'est pas configurée");
  const groq = new Groq({ apiKey });

  const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: BUSINESS_QUESTION_SYSTEM_PROMPT },
    { role: "user", content: question },
  ];

  const first = await groq.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.2,
    max_tokens: 400,
    tools: GROQ_TOOLS,
    messages,
  });

  const choice = first.choices[0];
  const toolCalls = choice?.message?.tool_calls;
  if (!toolCalls || toolCalls.length === 0) {
    return choice?.message?.content?.trim() || "Je n'ai pas pu répondre à cette question.";
  }

  messages.push(choice.message);
  for (const call of toolCalls) {
    const input = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
    const result = await executeTool(call.function.name, input);
    messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
  }

  const second = await groq.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.2,
    max_tokens: 400,
    messages,
  });

  return second.choices[0]?.message?.content?.trim() || "Je n'ai pas pu répondre à cette question.";
}

const CLAUDE_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_revenue_summary",
    description: "Chiffre d'affaires et nombre de commandes pour une période.",
    input_schema: {
      type: "object",
      properties: { period: { type: "string", enum: PERIOD_ENUM as unknown as string[], description: PERIOD_DESC } },
      required: ["period"],
    },
  },
  {
    name: "get_top_dish",
    description: "Le plat le plus vendu (en quantité) pour une période.",
    input_schema: {
      type: "object",
      properties: { period: { type: "string", enum: PERIOD_ENUM as unknown as string[], description: PERIOD_DESC } },
      required: ["period"],
    },
  },
  {
    name: "get_margin_summary",
    description: "Marge (coûts ingrédients/emballage) pour une période, avec le % de ventes dont le coût est connu.",
    input_schema: {
      type: "object",
      properties: { period: { type: "string", enum: PERIOD_ENUM as unknown as string[], description: PERIOD_DESC } },
      required: ["period"],
    },
  },
  {
    name: "get_driver_delivery_count",
    description: "Nombre de livraisons effectuées par un livreur donné (recherche par nom, insensible à la casse) sur une période.",
    input_schema: {
      type: "object",
      properties: {
        driverName: { type: "string", description: "Nom (ou partie du nom) du livreur" },
        period: { type: "string", enum: PERIOD_ENUM as unknown as string[], description: PERIOD_DESC },
      },
      required: ["driverName", "period"],
    },
  },
];

async function answerWithClaude(question: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY n'est pas configurée");
  const anthropic = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];

  let first: Anthropic.Message;
  try {
    first = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      system: BUSINESS_QUESTION_SYSTEM_PROMPT,
      tools: CLAUDE_TOOLS,
      messages,
    });
  } catch (err) {
    logClaudeError("answerWithClaude — premier appel (avant tool use)", err, { question });
    throw err;
  }

  const toolUses = first.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (toolUses.length === 0) {
    const text = first.content.find((block) => block.type === "text");
    return text && text.type === "text" ? text.text.trim() : "Je n'ai pas pu répondre à cette question.";
  }

  // Une question large ("fais-moi le point de la semaine") peut pousser
  // Claude à demander PLUSIEURS outils dans le même tour (revenus + plat
  // vedette...) — l'API exige un tool_result pour CHAQUE tool_use du tour
  // précédent dans le message suivant, sinon elle rejette l'appel entier
  // avec une erreur 400 (silencieusement transformée en message générique
  // côté staff). Ne traiter que le premier tool_use cassait ces questions.
  const toolResults = await Promise.all(
    toolUses.map(async (toolUse) => ({
      type: "tool_result" as const,
      tool_use_id: toolUse.id,
      content: JSON.stringify(await executeTool(toolUse.name, toolUse.input as Record<string, unknown>)),
    }))
  );
  messages.push({ role: "assistant", content: first.content });
  messages.push({ role: "user", content: toolResults });

  try {
    const second = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      system: BUSINESS_QUESTION_SYSTEM_PROMPT,
      tools: CLAUDE_TOOLS,
      messages,
    });
    const text = second.content.find((block) => block.type === "text");
    return text && text.type === "text" ? text.text.trim() : "Je n'ai pas pu répondre à cette question.";
  } catch (err) {
    logClaudeError("answerWithClaude — second appel (après tool use)", err, { question, toolNames: toolUses.map((t) => t.name) });
    throw err;
  }
}

/**
 * Point d'entrée unique pour l'interface de question Admin — dispatché
 * vers Groq ou Claude selon system_settings.ai_model. Le modèle DOIT
 * passer par un tool call réel (lib/business-queries.ts) pour tout
 * chiffre — jamais d'estimation. Voir lib/staff-query.ts pour la
 * détection "est-ce une question ?" et l'envoi de la réponse au staff.
 */
export async function answerBusinessQuestion(question: string): Promise<string> {
  const model = await getAiModel();
  return model === "claude" ? answerWithClaude(question) : answerWithGroq(question);
}

// ============================================================
// Routeur d'intentions staff (lib/staff-order.ts, lib/staff-log.ts) —
// remplace la détection par mots-clés (listes "quel est", "combien", "le
// point"...), fragile par construction : toute formulation non prévue
// (nouveau tournure, faute, dialecte) passait entre les mailles. Un seul
// appel IA par message décide entre les intentions réelles supportées ;
// "small_talk" n'est PAS un outil — c'est le cas où le modèle ne choisit
// aucun outil et répond directement en texte libre (accusé social bref),
// exactement le comportement demandé ("pas un vrai outil, un cas de sortie").
// ============================================================

export type StaffIntent =
  | { tool: "log_order" }
  | { tool: "query_business_stats" }
  | { tool: "small_talk"; reply: string };

function routerSystemPrompt(draftContext: string | null): string {
  const base = `Tu es le routeur d'intentions de l'assistant staff de CHIVI (dark kitchen, Cotonou, Bénin), utilisé par l'équipe support via WhatsApp. Pour le message du staff ci-dessous, détermine son intention RÉELLE et appelle l'outil correspondant :

- "log_order" : le staff décrit (ou précise/corrige) une commande déjà servie/livrée à enregistrer pour la comptabilité — plats, client, prix, quantités, localisation, livreur.
- "query_business_stats" : le staff pose une question chiffrée sur l'activité business — revenus, marge, plat le plus vendu, nombre de livraisons d'un livreur, bilan de la journée/semaine/mois...

Si le message est purement social ou conversationnel (salutation, remerciement, accusé de réception comme "ok", "super", "merci", "d'accord", "nickel") SANS intention d'action détectable, N'APPELLE AUCUN OUTIL — réponds directement par un texte court et naturel en français (une phrase suffit), sans jamais redemander une information de commande.`;

  if (!draftContext) return base;

  return `${base}

CONTEXTE IMPORTANT : une commande est actuellement en cours de clarification avec ce staff (${draftContext}). Si le nouveau message continue clairement cette commande (précision de plat, quantité, prix, nom ou numéro du client, adresse, livreur...), appelle "log_order" comme d'habitude. Si le message signale une intention TOTALEMENT différente (question chiffrée, ou message purement social), traite-la comme telle — la commande en cours de clarification restera intacte et pourra être reprise juste après, ne t'en préoccupe pas.`;
}

const ROUTER_TOOL_SCHEMAS = [
  { name: "log_order", description: "Enregistrer ou continuer de préciser une commande déjà servie/livrée (client, plats, prix, quantités, localisation, livreur)." },
  { name: "query_business_stats", description: "Répondre à une question chiffrée sur l'activité business (revenus, marge, plats vendus, livraisons d'un livreur, bilan...)." },
] as const;

const GROQ_ROUTER_TOOLS: Groq.Chat.Completions.ChatCompletionTool[] = ROUTER_TOOL_SCHEMAS.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: { type: "object", properties: {}, required: [] } },
}));

const CLAUDE_ROUTER_TOOLS: Anthropic.Tool[] = ROUTER_TOOL_SCHEMAS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: { type: "object", properties: {}, required: [] },
}));

async function classifyIntentWithGroq(message: string, draftContext: string | null): Promise<StaffIntent> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY n'est pas configurée");
  const groq = new Groq({ apiKey });

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.1,
    max_tokens: 300,
    tools: GROQ_ROUTER_TOOLS,
    messages: [
      { role: "system", content: routerSystemPrompt(draftContext) },
      { role: "user", content: message },
    ],
  });

  const choice = completion.choices[0];
  const toolCall = choice?.message?.tool_calls?.[0];
  if (toolCall?.function.name === "log_order") return { tool: "log_order" };
  if (toolCall?.function.name === "query_business_stats") return { tool: "query_business_stats" };
  return { tool: "small_talk", reply: choice?.message?.content?.trim() || "👍" };
}

async function classifyIntentWithClaude(message: string, draftContext: string | null): Promise<StaffIntent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY n'est pas configurée");
  const anthropic = new Anthropic({ apiKey });

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      system: routerSystemPrompt(draftContext),
      tools: CLAUDE_ROUTER_TOOLS,
      messages: [{ role: "user", content: message }],
    });

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolUse?.name === "log_order") return { tool: "log_order" };
    if (toolUse?.name === "query_business_stats") return { tool: "query_business_stats" };

    const text = response.content.find((b) => b.type === "text");
    return { tool: "small_talk", reply: text && text.type === "text" ? text.text.trim() : "👍" };
  } catch (err) {
    logClaudeError("classifyStaffIntent", err, { message, hasDraftContext: !!draftContext });
    throw err;
  }
}

/**
 * Point d'entrée unique du routeur d'intentions staff — dispatché vers Groq
 * ou Claude selon system_settings.ai_model, comme le reste du fichier.
 * `draftContext` (résumé court d'une commande en cours de clarification, ou
 * null) donne au modèle le contexte nécessaire pour distinguer "le staff
 * continue cette commande" de "le staff change complètement de sujet" —
 * voir lib/staff-log.ts::continueLogSession.
 */
export async function classifyStaffIntent(message: string, draftContext: string | null): Promise<StaffIntent> {
  const model = await getAiModel();
  return model === "claude" ? classifyIntentWithClaude(message, draftContext) : classifyIntentWithGroq(message, draftContext);
}
