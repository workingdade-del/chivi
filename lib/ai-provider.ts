import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";
import { generateGroqReply, type ChatTurn } from "@/lib/groq";

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
