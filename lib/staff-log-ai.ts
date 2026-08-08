import { generateStructuredJson } from "@/lib/ai-provider";

export interface StaffLogDraftItem {
  nom: string;
  quantite: number;
}

export interface StaffLogDraft {
  clientNom: string | null;
  clientTel: string | null;
  plats: StaffLogDraftItem[];
  totalFcfa: number | null;
  localisation: string | null;
  livreurNom: string | null;
  livreurTel: string | null;
}

export function emptyStaffLogDraft(): StaffLogDraft {
  return { clientNom: null, clientTel: null, plats: [], totalFcfa: null, localisation: null, livreurNom: null, livreurTel: null };
}

/**
 * Met à jour la compréhension d'une commande (déjà servie/livrée) décrite en
 * langage libre par le staff, à partir du brouillon actuel + un nouveau
 * message (description initiale OU correction/précision). Contrairement à
 * extractStaffOrder (format /commande rigide), ce prompt reçoit l'état
 * précédent et doit le faire évoluer plutôt que ré-extraire from scratch —
 * c'est ce qui permet les allers-retours de correction en langage naturel
 * ("non c'est 2000f pas 1500f", "ajoute un jus bissap").
 */
export async function updateStaffLogDraft(previousDraft: StaffLogDraft, newMessage: string): Promise<StaffLogDraft | null> {
  const prompt = `Tu aides le staff du restaurant CHIVI (Cotonou, Bénin) à enregistrer, pour la comptabilité, une commande déjà servie/livrée décrite en langage libre (le client a déjà été livré, ce n'est qu'un enregistrement rétroactif).

Voici ta compréhension ACTUELLE de la commande (JSON) :
${JSON.stringify(previousDraft)}

Le staff vient d'écrire (ou de dire, transcrit depuis un message vocal) :
"""${newMessage}"""

Ce message est soit une description initiale, soit une correction/précision sur ta compréhension actuelle (ex: "non c'est 2000f pas 1500f", "ajoute un jus bissap", "le client c'est Marie", "son numéro c'est 0161234567"). Mets à jour ta compréhension : garde identique tout ce qui n'est ni contredit ni complété par ce nouveau message, applique uniquement les changements/ajouts demandés. Réponds UNIQUEMENT en JSON, sans texte autour, avec ce schéma exact :
{
  "client_nom": string ou null,
  "client_tel": string ou null (chiffres uniquement, retire espaces/tirets/plus),
  "plats": [{"nom": string, "quantite": number}],
  "total_fcfa": number ou null (le prix total en FCFA si mentionné),
  "localisation": string ou null,
  "livreur_nom": string ou null,
  "livreur_tel": string ou null (chiffres uniquement)
}`;

  try {
    const raw = await generateStructuredJson(prompt);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      client_nom?: string | null;
      client_tel?: string | null;
      plats?: { nom?: string; quantite?: number }[];
      total_fcfa?: number | null;
      localisation?: string | null;
      livreur_nom?: string | null;
      livreur_tel?: string | null;
    };

    return {
      clientNom: parsed.client_nom?.trim() || null,
      clientTel: parsed.client_tel?.replace(/[^\d]/g, "") || null,
      plats: (parsed.plats ?? [])
        .map((p) => ({ nom: p.nom?.trim() ?? "", quantite: p.quantite && p.quantite > 0 ? Math.round(p.quantite) : 1 }))
        .filter((p) => p.nom.length > 0),
      totalFcfa: typeof parsed.total_fcfa === "number" && parsed.total_fcfa > 0 ? Math.round(parsed.total_fcfa) : null,
      localisation: parsed.localisation?.trim() || null,
      livreurNom: parsed.livreur_nom?.trim() || null,
      livreurTel: parsed.livreur_tel?.replace(/[^\d]/g, "") || null,
    };
  } catch (err) {
    console.error("[staff-log-ai] updateStaffLogDraft FAILED", err);
    return null;
  }
}
