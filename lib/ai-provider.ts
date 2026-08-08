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

async function generateClaudeReply(systemPrompt: string, history: ChatTurn[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY n'est pas configurée");
  }

  const anthropic = new Anthropic({ apiKey });
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 400,
    temperature: 0.6,
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
 * Claude n'a pas d'équivalent direct au response_format:"json_object" de
 * Groq/OpenAI — on force un JSON propre via la technique standard du
 * "prefill" (démarrer le tour assistant par "{"). Claude ne réécrit pas ce
 * préfixe dans sa réponse, donc on le rajoute nous-mêmes avant de renvoyer
 * le texte complet à parser.
 */
async function generateClaudeJson(prompt: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[ai-provider] ANTHROPIC_API_KEY absente — extraction JSON ignorée");
    return null;
  }
  const anthropic = new Anthropic({ apiKey });
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 600,
    temperature: 0.1,
    messages: [
      { role: "user", content: `${prompt}\n\nRéponds UNIQUEMENT avec l'objet JSON demandé, sans texte autour.` },
      { role: "assistant", content: "{" },
    ],
  });
  const text = message.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") return null;
  return "{" + text.text.trim();
}

/**
 * Point d'entrée unique pour l'extraction structurée (JSON) — utilisé par
 * lib/staff-log-ai.ts. Dispatché vers Groq ou Claude selon
 * system_settings.ai_model, comme generateAiReply.
 */
export async function generateStructuredJson(prompt: string): Promise<string | null> {
  const model = await getAiModel();
  return model === "claude" ? generateClaudeJson(prompt) : generateGroqJson(prompt);
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

  const first = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 400,
    temperature: 0.2,
    system: BUSINESS_QUESTION_SYSTEM_PROMPT,
    tools: CLAUDE_TOOLS,
    messages,
  });

  const toolUse = first.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    const text = first.content.find((block) => block.type === "text");
    return text && text.type === "text" ? text.text.trim() : "Je n'ai pas pu répondre à cette question.";
  }

  const result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>);
  messages.push({ role: "assistant", content: first.content });
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) }],
  });

  const second = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 400,
    temperature: 0.2,
    system: BUSINESS_QUESTION_SYSTEM_PROMPT,
    tools: CLAUDE_TOOLS,
    messages,
  });

  const text = second.content.find((block) => block.type === "text");
  return text && text.type === "text" ? text.text.trim() : "Je n'ai pas pu répondre à cette question.";
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
