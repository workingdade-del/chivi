import { createClient } from "@/lib/supabase/server";

export interface SystemSettings {
  isPaused: boolean;
  pauseReason: string | null;
  pausedAt: string | null;
}

const DEFAULT_SETTINGS: SystemSettings = { isPaused: false, pauseReason: null, pausedAt: null };

export async function getSystemSettings(): Promise<SystemSettings> {
  const supabase = createClient();
  const { data } = await supabase
    .from("system_settings")
    .select("is_paused, pause_reason, paused_at")
    .eq("id", true)
    .maybeSingle();

  if (!data) return DEFAULT_SETTINGS;

  return { isPaused: data.is_paused, pauseReason: data.pause_reason, pausedAt: data.paused_at };
}

export interface PricingSettings {
  targetMarginPct: number;
  breakEvenTolerancePct: number;
  priceCutMarginGapPct: number;
  priceCutLowSalesPct: number;
}

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  targetMarginPct: 40,
  breakEvenTolerancePct: 2,
  priceCutMarginGapPct: 15,
  priceCutLowSalesPct: 50,
};

/** Seuils de pilotage (Paramètres). Retombe sur les défauts si la migration 0048 n'est pas encore appliquée. */
export async function getPricingSettings(): Promise<PricingSettings> {
  const supabase = createClient();
  const { data } = await supabase
    .from("system_settings")
    .select("target_margin_pct, break_even_tolerance_pct, price_cut_margin_gap_pct, price_cut_low_sales_pct")
    .eq("id", true)
    .maybeSingle();
  if (!data) return DEFAULT_PRICING_SETTINGS;
  return {
    targetMarginPct: data.target_margin_pct,
    breakEvenTolerancePct: data.break_even_tolerance_pct,
    priceCutMarginGapPct: data.price_cut_margin_gap_pct,
    priceCutLowSalesPct: data.price_cut_low_sales_pct,
  };
}
