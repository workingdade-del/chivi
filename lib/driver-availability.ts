const UNAVAILABLE_KEYWORDS = ["pas disponible", "occupe", "plus tard", "non"];
const AVAILABLE_KEYWORDS = ["disponible", "je suis la", "ok"];

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(COMBINING_DIACRITICS, "");
}

/**
 * Détecte une intention de disponibilité dans un message libre d'un livreur.
 * Les mots-clés "indisponible" sont vérifiés en premier car "pas disponible"
 * contient la sous-chaîne "disponible" — sans cet ordre, ce message serait
 * lu comme une confirmation de disponibilité.
 *
 * Renvoie null si aucun mot-clé ne matche (le statut n'est alors pas modifié) —
 * "ok" est un déclencheur volontairement large demandé par le métier ; il peut
 * donc réagir à des messages sans rapport avec la disponibilité.
 */
export function detectAvailabilityIntent(rawText: string): boolean | null {
  const text = stripAccents(rawText.toLowerCase());

  for (const keyword of UNAVAILABLE_KEYWORDS) {
    if (new RegExp(`\\b${keyword}\\b`).test(text)) return false;
  }
  for (const keyword of AVAILABLE_KEYWORDS) {
    if (new RegExp(`\\b${keyword}\\b`).test(text)) return true;
  }
  return null;
}
