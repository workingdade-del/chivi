import crypto from "crypto";

/**
 * Vérifie la signature Meta (X-Hub-Signature-256) sur le corps brut de
 * la requête. Si META_APP_SECRET n'est pas configurée, on laisse passer
 * en loggant un avertissement plutôt que de casser un webhook qui
 * fonctionne déjà sans elle — le secret doit être ajouté par l'équipe
 * dans Meta App Dashboard > Réglages > Basique, puis dans Vercel.
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    console.warn("[webhook-security] META_APP_SECRET non configurée — signature non vérifiée");
    return true;
  }

  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}
