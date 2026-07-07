import Groq from "groq-sdk";

const GROQ_MODEL = "llama-3.1-8b-instant";

export interface ExtractedLocation {
  lieu: string;
  quartier: string;
  rechercheNominatim: string;
}

/**
 * Demande à Groq d'identifier un lieu de livraison à Cotonou, Bénin depuis
 * une description libre (texte ou audio transcrit). `rechercheNominatim`
 * est la requête à passer telle quelle à Nominatim. Retourne null si
 * GROQ_API_KEY absente ou si la réponse n'est pas un JSON exploitable —
 * dans ce cas l'appelant doit demander la localisation GPS.
 */
export async function extractLocationFromText(text: string): Promise<ExtractedLocation | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn("[location-ai] GROQ_API_KEY absente — extraction de lieu ignorée");
    return null;
  }

  const prompt = `Tu es un assistant de livraison à Cotonou, Bénin. Le client décrit son lieu : '${text}'. Identifie le quartier ou landmark précis. Réponds UNIQUEMENT en JSON : {lieu: '', quartier: '', recherche_nominatim: ''}`;

  try {
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.2,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return null;

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      lieu?: string;
      quartier?: string;
      recherche_nominatim?: string;
    };

    return {
      lieu: parsed.lieu ?? "",
      quartier: parsed.quartier ?? "",
      rechercheNominatim: parsed.recherche_nominatim ?? "",
    };
  } catch (err) {
    console.error("[location-ai] extractLocationFromText FAILED", err);
    return null;
  }
}
