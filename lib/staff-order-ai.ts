import Groq from "groq-sdk";

const GROQ_MODEL = "llama-3.1-8b-instant";

export interface ParsedStaffOrderPlat {
  nom: string;
  quantite: number;
  variante: string | null;
  supplements: string[];
}

export type ParsedStaffPayment = "cash_livraison" | "momo_livraison" | "momo_avance";

export interface ParsedStaffOrder {
  clientNom: string | null;
  clientTel: string | null;
  plats: ParsedStaffOrderPlat[];
  paiement: ParsedStaffPayment | null;
  localisation: string | null;
  livreurNom: string | null;
  livreurTel: string | null;
  note: string | null;
}

const VALID_PAYMENTS: ParsedStaffPayment[] = ["cash_livraison", "momo_livraison", "momo_avance"];

/**
 * Extrait une commande structurée depuis un message staff au format libre
 * "/commande ..." — tolère fautes de frappe, ordre différent des champs,
 * labels manquants. Retourne null si GROQ_API_KEY absente ou réponse
 * inexploitable ; l'appelant doit alors traiter comme un échec de parsing.
 */
export async function extractStaffOrder(text: string): Promise<ParsedStaffOrder | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn("[staff-order-ai] GROQ_API_KEY absente — extraction ignorée");
    return null;
  }

  const prompt = `Tu extrais une commande du restaurant CHIVI (Cotonou, Bénin) rédigée par un membre du staff. Le format habituel, pas toujours respecté à la lettre (fautes de frappe, ordre différent, labels oubliés) :

/commande
CLIENT: [nom]
TEL: [numéro]
PLATS: [liste plats avec quantités et variantes]
PAIEMENT: [Cash/Momo livraison/Momo avance]
LOCALISATION: [description texte]
LIVREUR: [nom] [numéro]
NOTE: [optionnel]

Comprends l'intention même si le format n'est pas exact. Réponds UNIQUEMENT en JSON, sans texte autour, avec ce schéma exact :
{
  "client_nom": string ou null,
  "client_tel": string ou null (chiffres uniquement, retire espaces/tirets/plus),
  "plats": [{"nom": string, "quantite": number, "variante": string ou null, "supplements": string[]}],
  "paiement": "cash_livraison" ou "momo_livraison" ou "momo_avance" ou null,
  "localisation": string ou null,
  "livreur_nom": string ou null,
  "livreur_tel": string ou null (chiffres uniquement),
  "note": string ou null
}

Message à analyser :
"""${text}"""`;

  try {
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.1,
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      client_nom?: string | null;
      client_tel?: string | null;
      plats?: { nom?: string; quantite?: number; variante?: string | null; supplements?: string[] }[];
      paiement?: string | null;
      localisation?: string | null;
      livreur_nom?: string | null;
      livreur_tel?: string | null;
      note?: string | null;
    };

    return {
      clientNom: parsed.client_nom?.trim() || null,
      clientTel: parsed.client_tel?.replace(/[^\d]/g, "") || null,
      plats: (parsed.plats ?? [])
        .map((p) => ({
          nom: p.nom?.trim() ?? "",
          quantite: p.quantite && p.quantite > 0 ? Math.round(p.quantite) : 1,
          variante: p.variante?.trim() || null,
          supplements: (p.supplements ?? []).map((s) => s.trim()).filter(Boolean),
        }))
        .filter((p) => p.nom.length > 0),
      paiement: parsed.paiement && VALID_PAYMENTS.includes(parsed.paiement as ParsedStaffPayment) ? (parsed.paiement as ParsedStaffPayment) : null,
      localisation: parsed.localisation?.trim() || null,
      livreurNom: parsed.livreur_nom?.trim() || null,
      livreurTel: parsed.livreur_tel?.replace(/[^\d]/g, "") || null,
      note: parsed.note?.trim() || null,
    };
  } catch (err) {
    console.error("[staff-order-ai] extractStaffOrder FAILED", err);
    return null;
  }
}
