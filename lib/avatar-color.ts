/**
 * WhatsApp Cloud API ne donne accès qu'à la photo de profil business
 * (whatsapp_business_profile, la nôtre) — il n'existe aucun endpoint pour
 * récupérer la photo de profil personnelle d'un contact (client ou
 * livreur) : confirmé en interrogeant directement l'API Graph, qui rejette
 * toute tentative ("Tried accessing nonexisting field"). C'est une
 * restriction de confidentialité de la plateforme, pas une limite
 * technique de notre implémentation. On retombe donc sur un avatar à
 * initiales sur fond coloré déterministe, comme WhatsApp le fait lui-même.
 */
const PALETTE = [
  { bg: "#F4EAD2", text: "#7C0000" },
  { bg: "#DCEEE3", text: "#1B7A44" },
  { bg: "#E1E9FA", text: "#2B5FB0" },
  { bg: "#F6E2E0", text: "#B23A2E" },
  { bg: "#EFE1F5", text: "#6B3FA0" },
  { bg: "#FDE9C8", text: "#A6740A" },
  { bg: "#E0F0F1", text: "#1B7A8C" },
  { bg: "#F0E4D7", text: "#8A5A2B" },
];

export function avatarColorFor(key: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
