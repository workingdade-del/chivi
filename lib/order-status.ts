import type { OrderStatus } from "@/lib/supabase/types";

/** Cycle complet : la cuisine pilote recue→en_preparation→prete ;
 * l'admin assigne un livreur puis pilote prete→en_route→livree. */
export const NEXT_STATUS: Record<OrderStatus, OrderStatus> = {
  recue: "en_preparation",
  en_preparation: "prete",
  prete: "en_route",
  en_route: "livree",
  livree: "livree",
  annulee: "annulee",
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  recue: "Reçue",
  en_preparation: "En préparation",
  prete: "Prête",
  en_route: "En route",
  livree: "Livrée",
  annulee: "Annulée",
};

/** Statuts que la cuisine affiche sur son tableau de tickets. */
export const CUISINE_STATUSES: OrderStatus[] = ["recue", "en_preparation", "prete"];

/**
 * Le client ne voit que 4 étapes (Reçue/En préparation/En route/Livrée) —
 * "Prête" (en cuisine, en attente d'un livreur) est encore vécu comme
 * "en préparation" côté client, qui ne distingue pas les deux.
 */
export const CLIENT_TIMELINE: OrderStatus[] = ["recue", "en_preparation", "en_route", "livree"];

export function clientTimelineIndex(status: OrderStatus): number {
  if (status === "prete") return 1;
  const idx = CLIENT_TIMELINE.indexOf(status);
  return idx === -1 ? 0 : idx;
}
