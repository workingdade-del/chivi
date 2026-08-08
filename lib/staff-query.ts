import { createServiceClient } from "@/lib/supabase/server";
import { sendWhatsappText, extractMessageId } from "@/lib/whatsapp";
import { answerBusinessQuestion } from "@/lib/ai-provider";

/**
 * Heuristique rapide (pas d'appel IA) pour distinguer une QUESTION business
 * ("quel est le total du jour ?") d'une description de commande à
 * enregistrer ("2 Atassi pour Marie") — sans elle, /commande-log
 * absorberait aussi les questions et démarrerait une session d'enregistrement
 * à tort. Volontairement permissive (mieux vaut un faux positif — traité
 * comme question, qui échoue proprement — qu'un faux négatif qui déclenche
 * une fausse commande).
 */
const QUESTION_WORDS = [
  "quel est",
  "quelle est",
  "quel a été",
  "quelle a été",
  "combien",
  "quels sont",
  "quelles sont",
  "est-ce que",
  "est ce que",
  "comment va",
  "comment se porte",
];

export function isBusinessQuestion(text: string): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (normalized.endsWith("?")) return true;
  return QUESTION_WORDS.some((w) => normalized.startsWith(w) || normalized.includes(` ${w} `));
}

/** Répond à une question business posée par le staff — l'IA passe toujours par une vraie requête DB (voir lib/ai-provider.ts::answerBusinessQuestion), jamais d'estimation. */
export async function handleStaffQuestion(staffPhone: string, question: string): Promise<void> {
  const supabase = createServiceClient();
  let answer: string;
  try {
    answer = await answerBusinessQuestion(question);
  } catch (err) {
    console.error("[staff-query] échec de réponse à la question business", { staffPhone, question, error: err });
    answer = "Désolé, je n'ai pas pu calculer cette réponse pour le moment.";
  }

  try {
    const sendResult = await sendWhatsappText(staffPhone, answer);
    await supabase.from("whatsapp_messages").insert({
      wa_message_id: extractMessageId(sendResult),
      direction: "outbound",
      phone: staffPhone,
      message_type: "text",
      content: answer,
    });
  } catch (err) {
    console.error("[staff-query] échec envoi réponse au staff", { staffPhone, error: err });
  }
}
