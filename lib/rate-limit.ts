const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;

/**
 * Limiteur en mémoire, best-effort : suffisant contre un flood ponctuel
 * sur une instance chaude, mais ne partage rien entre instances
 * serverless ni ne survit à un cold start. Pas de Redis/Upstash configuré
 * dans ce projet — c'est le compromis pragmatique documenté ici plutôt
 * qu'une fausse promesse de limite stricte globale.
 */
const timestampsByKey = new Map<string, number[]>();

export function isRateLimited(key: string, max: number = MAX_REQUESTS, windowMs: number = WINDOW_MS): boolean {
  const now = Date.now();
  const timestamps = (timestampsByKey.get(key) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= max) {
    timestampsByKey.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  timestampsByKey.set(key, timestamps);
  return false;
}
