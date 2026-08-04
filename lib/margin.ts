import { createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Marge par plat calculée EN TEMPS RÉEL contre les coûts actuels de
 * product_costs / product_variants — jamais une valeur figée au moment de
 * la commande. Une variante commandée utilise exclusivement son propre
 * coût (product_variants.ingredient_cost/packaging_cost) si elle en a un ;
 * sans variante, on retombe sur product_costs du plat parent. Un coût à 0
 * (valeur par défaut, jamais renseigné) est traité comme "inconnu", pas
 * comme "gratuit" — sinon la marge afficherait à tort 100%.
 */

export interface OrderItemForMargin {
  product_id: string | null;
  product_variant_id: string | null;
  quantity: number;
  line_total: number;
}

interface CostRow {
  ingredient_cost: number;
  packaging_cost: number;
}

export interface CostMaps {
  products: Map<string, CostRow>;
  variants: Map<string, CostRow>;
}

export async function loadCostMaps(client?: SupabaseClient<Database>): Promise<CostMaps> {
  const supabase = client ?? createServiceClient();
  const [{ data: productCosts }, { data: variantCosts }] = await Promise.all([
    supabase.from("product_costs").select("product_id, ingredient_cost, packaging_cost"),
    supabase.from("product_variants").select("id, ingredient_cost, packaging_cost"),
  ]);

  const products = new Map<string, CostRow>();
  for (const row of productCosts ?? []) {
    products.set(row.product_id, { ingredient_cost: row.ingredient_cost, packaging_cost: row.packaging_cost });
  }
  const variants = new Map<string, CostRow>();
  for (const row of variantCosts ?? []) {
    variants.set(row.id, { ingredient_cost: row.ingredient_cost, packaging_cost: row.packaging_cost });
  }
  return { products, variants };
}

export interface ItemMarginResult {
  revenue: number;
  unitCost: number | null; // null = coût non renseigné
  cost: number | null;
  margin: number | null;
  costKnown: boolean;
}

export function computeItemMargin(item: OrderItemForMargin, costs: CostMaps): ItemMarginResult {
  let unitCost: number | null = null;

  if (item.product_variant_id) {
    const row = costs.variants.get(item.product_variant_id);
    unitCost = row ? row.ingredient_cost + row.packaging_cost : 0;
  } else if (item.product_id) {
    const row = costs.products.get(item.product_id);
    unitCost = row ? row.ingredient_cost + row.packaging_cost : 0;
  }

  const costKnown = unitCost !== null && unitCost > 0;
  const cost = costKnown ? unitCost! * item.quantity : null;
  const margin = costKnown ? item.line_total - cost! : null;

  return { revenue: item.line_total, unitCost: costKnown ? unitCost : null, cost, margin, costKnown };
}

export interface MarginSummary {
  totalRevenue: number;
  knownRevenue: number;
  knownCost: number;
  knownMargin: number;
  /** % du CA dont le coût est renseigné — la marge ci-dessus ne porte que sur cette part. */
  coveragePct: number;
}

export function summarizeMargins(items: OrderItemForMargin[], costs: CostMaps): MarginSummary {
  let totalRevenue = 0;
  let knownRevenue = 0;
  let knownCost = 0;

  for (const item of items) {
    totalRevenue += item.line_total;
    const r = computeItemMargin(item, costs);
    if (r.costKnown) {
      knownRevenue += r.revenue;
      knownCost += r.cost!;
    }
  }

  return {
    totalRevenue,
    knownRevenue,
    knownCost,
    knownMargin: knownRevenue - knownCost,
    coveragePct: totalRevenue > 0 ? Math.round((knownRevenue / totalRevenue) * 100) : 0,
  };
}

export interface DishMarginRow {
  name: string;
  qty: number;
  revenue: number;
  cost: number | null;
  margin: number | null;
  costKnown: boolean;
}

interface NamedOrderItemForMargin extends OrderItemForMargin {
  label: string; // ex: "Spaghetti CHIVI — Aileron"
}

/** Regroupe par plat/variante (label), triable ensuite par contribution marge totale (qty × marge unitaire). */
export function marginByDish(items: NamedOrderItemForMargin[], costs: CostMaps): DishMarginRow[] {
  const byLabel = new Map<string, DishMarginRow>();

  for (const item of items) {
    const r = computeItemMargin(item, costs);
    const existing = byLabel.get(item.label);
    if (!existing) {
      byLabel.set(item.label, {
        name: item.label,
        qty: item.quantity,
        revenue: r.revenue,
        cost: r.cost,
        margin: r.margin,
        costKnown: r.costKnown,
      });
    } else {
      existing.qty += item.quantity;
      existing.revenue += r.revenue;
      if (r.costKnown && existing.costKnown) {
        existing.cost = (existing.cost ?? 0) + (r.cost ?? 0);
        existing.margin = (existing.margin ?? 0) + (r.margin ?? 0);
      } else {
        // Un plat dont certaines lignes ont un coût connu et d'autres non
        // (ex: coût renseigné en cours de période) — la marge agrégée
        // devient elle-même non fiable, on la marque "inconnue".
        existing.costKnown = false;
        existing.cost = null;
        existing.margin = null;
      }
    }
  }

  return Array.from(byLabel.values()).sort((a, b) => {
    const contribA = a.margin ?? -Infinity;
    const contribB = b.margin ?? -Infinity;
    return contribB - contribA;
  });
}

export type { NamedOrderItemForMargin };
