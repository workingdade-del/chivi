/**
 * Indicateurs de pilotage : point mort mensuel et recommandations de prix par
 * produit. Fonctions pures — aucune requête, aucun calcul de marge existant modifié.
 */

export type BreakEvenStatus = "au_dessus" | "au_niveau" | "en_dessous";

export type BreakEvenResult =
  | { ok: false; reason: "no_fixed_costs" | "no_margin_rate" | "no_sales" }
  | {
      ok: true;
      breakEven: number;
      status: BreakEvenStatus;
      /** CA réalisé − point mort (FCFA, signé). */
      gap: number;
      /** Écart en % du point mort (signé). */
      gapPct: number;
      /** CA réalisé / point mort, en % (non plafonné). */
      progressPct: number;
    };

export const BREAK_EVEN_REASONS: Record<"no_fixed_costs" | "no_margin_rate" | "no_sales", string> = {
  no_fixed_costs: "Aucun coût fixe classé pour ce mois — classez vos dépenses fixes (loyer, personnel, abonnements…) dans Dépenses pour calculer le point mort.",
  no_margin_rate: "Taux de marge nul ou négatif sur ce mois — le point mort n'a pas de sens (vérifiez les coûts des plats).",
  no_sales: "Aucune vente sur ce mois — taux de marge indéterminé, point mort non calculable.",
};

/** Point mort = coûts fixes ÷ taux de marge sur coûts variables (marge brute ÷ CA). */
export function computeBreakEven(opts: { fixedCosts: number; revenue: number; grossMargin: number; tolerancePct: number }): BreakEvenResult {
  if (opts.fixedCosts <= 0) return { ok: false, reason: "no_fixed_costs" };
  if (opts.revenue <= 0) return { ok: false, reason: "no_sales" };
  const rate = opts.grossMargin / opts.revenue;
  if (rate <= 0) return { ok: false, reason: "no_margin_rate" };

  const breakEven = Math.round(opts.fixedCosts / rate);
  const gap = opts.revenue - breakEven;
  const gapPct = breakEven > 0 ? Math.round((gap / breakEven) * 1000) / 10 : 0;
  const status: BreakEvenStatus = Math.abs(gapPct) <= opts.tolerancePct ? "au_niveau" : gap > 0 ? "au_dessus" : "en_dessous";
  return { ok: true, breakEven, status, gap, gapPct, progressPct: breakEven > 0 ? Math.round((opts.revenue / breakEven) * 100) : 0 };
}

export const BREAK_EVEN_LABELS: Record<BreakEvenStatus, string> = {
  au_dessus: "Au-dessus du point mort",
  au_niveau: "Au niveau du point mort",
  en_dessous: "En dessous du point mort",
};

export type PriceBadge = "hausse" | "baisse" | null;

export interface ProductPricingInput {
  revenue: number;
  qty: number;
  /** Coût variable unitaire moyen ; null = non renseigné. */
  unitCost: number | null;
  marginPct: number | null;
  salesSharePct: number;
}

export interface ProductPricing {
  /** Prix conseillé = coût variable unitaire ÷ (1 − marge cible), arrondi à la dizaine supérieure. */
  suggestedPrice: number | null;
  avgPrice: number | null;
  badge: PriceBadge;
}

export function computeProductPricing(
  p: ProductPricingInput,
  ctx: { productCount: number; targetMarginPct: number; priceCutMarginGapPct: number; priceCutLowSalesPct: number }
): ProductPricing {
  const avgPrice = p.qty > 0 ? Math.round(p.revenue / p.qty) : null;
  if (p.unitCost === null || p.marginPct === null) return { suggestedPrice: null, avgPrice, badge: null };

  const suggestedPrice = Math.ceil(p.unitCost / (1 - ctx.targetMarginPct / 100) / 10) * 10;
  const avgShare = ctx.productCount > 0 ? 100 / ctx.productCount : 0;
  const lowSales = p.salesSharePct < avgShare * (ctx.priceCutLowSalesPct / 100);

  let badge: PriceBadge = null;
  if (p.marginPct < ctx.targetMarginPct) badge = "hausse";
  else if (p.marginPct >= ctx.targetMarginPct + ctx.priceCutMarginGapPct && lowSales) badge = "baisse";
  return { suggestedPrice, avgPrice, badge };
}

export const PRICE_BADGE_LABELS: Record<Exclude<PriceBadge, null>, string> = {
  hausse: "Prix à ajuster à la hausse",
  baisse: "Baisse de prix envisageable",
};
