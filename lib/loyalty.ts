import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export const DEFAULT_POINTS_PER_FCFA = 0.01; // 1 point par 100 FCFA

export interface LoyaltyRates {
  defaultRate: number;
  productRates: Map<string, number>;
}

/** Taux global + taux spéciaux par produit (tolère l'absence de la migration 0049 : retombe sur 1 point / 100 FCFA). */
export async function loadLoyaltyRates(client?: SupabaseClient<Database>): Promise<LoyaltyRates> {
  const supabase = client ?? createClient();
  const [{ data: settings }, { data: products }] = await Promise.all([
    supabase.from("system_settings").select("loyalty_points_per_fcfa").eq("id", true).maybeSingle(),
    supabase.from("products").select("id, loyalty_points_per_fcfa"),
  ]);
  const productRates = new Map<string, number>();
  for (const p of products ?? []) {
    if (p.loyalty_points_per_fcfa !== null && p.loyalty_points_per_fcfa !== undefined) productRates.set(p.id, Number(p.loyalty_points_per_fcfa));
  }
  return { defaultRate: Number(settings?.loyalty_points_per_fcfa ?? DEFAULT_POINTS_PER_FCFA), productRates };
}

/** Points estimés d'une ligne (déjà nette de réduction) — même taux que le trigger : taux produit sinon global. */
export function pointsForLine(line: { product_id: string | null; line_total: number }, rates: LoyaltyRates): number {
  const rate = (line.product_id && rates.productRates.get(line.product_id)) ?? rates.defaultRate;
  return line.line_total * rate;
}

export interface LoyaltyTransaction {
  id: string;
  order_id: string | null;
  points: number;
  type: "gain" | "ajustement" | "annulation";
  note: string | null;
  created_at: string;
}

export async function getClientLoyalty(profileId: string): Promise<{ balance: number; transactions: LoyaltyTransaction[] }> {
  const supabase = createClient();
  const { data } = await supabase
    .from("loyalty_transactions")
    .select("id, order_id, points, type, note, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  const transactions = (data ?? []) as LoyaltyTransaction[];
  return { balance: transactions.reduce((s, t) => s + t.points, 0), transactions };
}

/** Soldes de tous les clients (somme des transactions) — pour la colonne "Points" de la liste. */
export async function getLoyaltyBalances(): Promise<Map<string, number>> {
  const supabase = createClient();
  const { data } = await supabase.from("loyalty_transactions").select("profile_id, points");
  const balances = new Map<string, number>();
  for (const t of data ?? []) balances.set(t.profile_id, (balances.get(t.profile_id) ?? 0) + t.points);
  return balances;
}
