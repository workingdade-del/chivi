/**
 * Correspondance approximative sans dépendance externe — utilisé pour faire
 * correspondre les noms de plats/variantes/suppléments/livreurs dictés par
 * le staff (fautes de frappe, formulation libre) avec les entrées réelles
 * en base. Combine Levenshtein normalisé et un bonus d'inclusion (l'un
 * contient l'autre), qui capture bien les cas réels ("spaghetti" vs
 * "Spaghetti CHIVI").
 */

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/** Score de similarité 0..1 (1 = identique). */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return 1 - dist / maxLen;
}

/** Meilleur candidat au-dessus du seuil, ou null si aucun n'est assez proche. */
export function findBestMatch<T>(
  query: string,
  candidates: T[],
  getName: (c: T) => string,
  threshold = 0.55
): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const candidate of candidates) {
    const score = similarity(query, getName(candidate));
    if (!best || score > best.score) best = { item: candidate, score };
  }
  return best && best.score >= threshold ? best : null;
}
