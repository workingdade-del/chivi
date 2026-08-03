/**
 * Utilitaires purs, sûrs à importer depuis un Client Component ("use client")
 * — aucune dépendance serveur (pas de credentials, pas de lib/env-context.ts
 * qui utilise node:async_hooks). Séparé de lib/whatsapp.ts pour que le bundle
 * client n'entraîne jamais accidentellement du code Node-only avec lui.
 */

/** Construit un lien wa.me pré-rempli pour que le client confirme sa commande directement dans son app WhatsApp. */
export function buildWaMeOrderLink(businessNumber: string, orderNumber: string, itemsSummary: string, total: number) {
  const text = `Bonjour CHIVI, je confirme ma commande ${orderNumber} :\n${itemsSummary}\nTotal : ${total.toLocaleString("fr-FR")} FCFA`;
  return `https://wa.me/${businessNumber}?text=${encodeURIComponent(text)}`;
}
