/**
 * Defense en profondeur pour les entrees libres stockees en base
 * (React echappe deja l'affichage, mais on ne fait jamais confiance a
 * une chaine libre venant du client ou de WhatsApp) : retire les balises
 * HTML et les caracteres de controle, tronque a une longueur raisonnable.
 */
export function sanitizeText(input: string, maxLength = 500): string {
  let result = "";
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    const isControl = (code >= 0 && code <= 31) || code === 127;
    if (!isControl) result += char;
  }
  return result.replace(/<[^>]*>/g, "").trim().slice(0, maxLength);
}
