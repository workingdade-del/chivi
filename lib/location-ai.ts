import Groq from "groq-sdk";

const GROQ_MODEL = "llama-3.1-8b-instant";

export interface ExtractedLocation {
  lieu: string;
  quartier: string;
  landmark: string;
  lat: number | null;
  lng: number | null;
}

/**
 * Demande à Groq d'identifier un lieu de livraison à Cotonou/Abomey-Calavi
 * depuis une description libre (texte ou audio transcrit). Retourne null
 * si GROQ_API_KEY absente ou si la réponse n'est pas un JSON exploitable —
 * dans ce cas l'appelant doit retomber sur "envoyez votre position GPS".
 */
export async function extractLocationFromText(text: string): Promise<ExtractedLocation | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn("[location-ai] GROQ_API_KEY absente — extraction de lieu ignorée");
    return null;
  }

  const prompt = `Tu es un assistant de livraison à Cotonou, Bénin. Le client décrit son lieu de livraison : '${text}'. Identifie le quartier, le landmark ou l'adresse précise à Cotonou ou Abomey-Calavi. Réponds uniquement en JSON strict, sans texte autour : {"lieu": "", "quartier": "", "landmark": "", "coordonnees_estimees": {"lat": null, "lng": null}}`;

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
      landmark?: string;
      coordonnees_estimees?: { lat?: number | string | null; lng?: number | string | null };
    };

    const lat = parsed.coordonnees_estimees?.lat;
    const lng = parsed.coordonnees_estimees?.lng;

    return {
      lieu: parsed.lieu ?? "",
      quartier: parsed.quartier ?? "",
      landmark: parsed.landmark ?? "",
      lat: lat !== undefined && lat !== null && lat !== "" ? Number(lat) : null,
      lng: lng !== undefined && lng !== null && lng !== "" ? Number(lng) : null,
    };
  } catch (err) {
    console.error("[location-ai] extractLocationFromText FAILED", err);
    return null;
  }
}
