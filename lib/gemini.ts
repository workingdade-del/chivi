const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export interface GeminiTurn {
  role: "user" | "model";
  text: string;
}

/** Appelle Gemini avec un system prompt + l'historique de conversation. Serveur uniquement. */
export async function generateGeminiReply(systemPrompt: string, history: GeminiTurn[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY n'est pas configurée");
  }

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
      generationConfig: { temperature: 0.6, maxOutputTokens: 400 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const text: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`Réponse Gemini vide: ${JSON.stringify(data)}`);
  }
  return text.trim();
}
