import Groq from "groq-sdk";

const GROQ_MODEL = "llama-3.1-8b-instant";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Appelle Groq (Llama 3.1 8B Instant) avec un system prompt + l'historique de conversation. Serveur uniquement. */
export async function generateGroqReply(systemPrompt: string, history: ChatTurn[]): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY n'est pas configurée");
  }

  const groq = new Groq({ apiKey });

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.6,
    max_tokens: 400,
    messages: [{ role: "system", content: systemPrompt }, ...history],
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) {
    throw new Error(`Réponse Groq vide: ${JSON.stringify(completion)}`);
  }
  return text.trim();
}
