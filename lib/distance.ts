export const KITCHEN_ORIGIN = { lat: 6.395904, lng: 2.352314 }; // Godomey Nonhouenou

/** Distance à vol d'oiseau (km) — suffisant pour une estimation de tarif de livraison. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export interface DeliveryFeeResult {
  distanceKm: number;
  fee: number | null;
  needsConfirmation: boolean;
}

/** Grille tarifaire CHIVI. Au-delà de 15km, on ne devine pas — on demande confirmation au livreur. */
export function computeDeliveryFee(distanceKm: number): DeliveryFeeResult {
  if (distanceKm > 15) return { distanceKm, fee: null, needsConfirmation: true };
  if (distanceKm >= 12) return { distanceKm, fee: 1200, needsConfirmation: false };
  if (distanceKm >= 9) return { distanceKm, fee: 1000, needsConfirmation: false };
  if (distanceKm >= 5) return { distanceKm, fee: 700, needsConfirmation: false };
  return { distanceKm, fee: 500, needsConfirmation: false };
}
