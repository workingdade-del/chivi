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

const WHISPER_MODEL = "whisper-large-v3";

/** Transcrit un audio (message vocal WhatsApp) via Groq Whisper. Serveur uniquement. */
export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY n'est pas configurée");
  }

  const groq = new Groq({ apiKey });
  const extension = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "wav";
  const file = new File([new Uint8Array(buffer)], `audio.${extension}`, { type: mimeType });

  const transcription = await groq.audio.transcriptions.create({
    file,
    model: WHISPER_MODEL,
    language: "fr",
  });

  return transcription.text.trim();
}
