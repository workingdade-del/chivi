import { createServiceClient } from "@/lib/supabase/server";
import { sendWhatsappText, extractMessageId } from "@/lib/whatsapp";
import { answerBusinessQuestion, getAiModel } from "@/lib/ai-provider";

/**
 * La détection "est-ce une question business ?" se fait désormais via
 * classifyStaffIntent (lib/ai-provider.ts), un routeur IA appelé depuis
 * lib/staff-order.ts et lib/staff-log.ts — remplace l'ancienne heuristique
 * par mots-clés, trop rigide (toute formulation non prévue passait entre
 * les mailles, ex: "Fais-moi le point de la semaine" a dû être patché
 * manuellement mot par mot avant ce changement).
 */

/** Répond à une question business posée par le staff — l'IA passe toujours par une vraie requête DB (voir lib/ai-provider.ts::answerBusinessQuestion), jamais d'estimation. */
export async function handleStaffQuestion(staffPhone: string, question: string): Promise<void> {
  const supabase = createServiceClient();
  let answer: string;
  try {
    answer = await answerBusinessQuestion(question);
  } catch (err) {
    // Message générique envoyé au staff volontairement vague — mais l'erreur
    // RÉELLE (clé API manquante/invalide, timeout, erreur de parsing...) doit
    // être visible dans les logs serveur pour diagnostiquer, avec le modèle
    // actif au moment de l'appel (Groq ou Claude — jamais OpenAI, non utilisé
    // dans ce projet).
    const model = await getAiModel().catch(() => "inconnu");
    console.error("[staff-query] échec de réponse à la question business", {
      staffPhone,
      question,
      model,
      errorMessage: err instanceof Error ? err.message : String(err),
      error: err,
    });
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
