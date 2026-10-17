"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { showToast } from "@/components/shared/Toast";

interface ProductRate {
  id: string;
  name: string;
  /** FCFA pour 1 point ("" = taux global). */
  fcfaPerPoint: string;
}

const rateToFcfa = (rate: number | null | undefined) => (rate && rate > 0 ? String(Math.round(1 / Number(rate))) : "");
const fcfaToRate = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.round((1 / n) * 10000) / 10000 : null;
};

export function LoyaltyPricingSettings() {
  const [fcfaPerPoint, setFcfaPerPoint] = useState("100");
  const [productRates, setProductRates] = useState<ProductRate[]>([]);
  const [targetMargin, setTargetMargin] = useState("40");
  const [tolerance, setTolerance] = useState("2");
  const [priceCutGap, setPriceCutGap] = useState("15");
  const [lowSales, setLowSales] = useState("50");
  const [busyLoyalty, setBusyLoyalty] = useState(false);
  const [busyPricing, setBusyPricing] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("system_settings")
      .select("loyalty_points_per_fcfa, target_margin_pct, break_even_tolerance_pct, price_cut_margin_gap_pct, price_cut_low_sales_pct")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setFcfaPerPoint(rateToFcfa(Number(data.loyalty_points_per_fcfa)) || "100");
        setTargetMargin(String(data.target_margin_pct));
        setTolerance(String(data.break_even_tolerance_pct));
        setPriceCutGap(String(data.price_cut_margin_gap_pct));
        setLowSales(String(data.price_cut_low_sales_pct));
      });
    supabase
      .from("products")
      .select("id, name, loyalty_points_per_fcfa")
      .order("name")
      .then(({ data }) => {
        setProductRates((data ?? []).map((p) => ({ id: p.id, name: p.name, fcfaPerPoint: rateToFcfa(p.loyalty_points_per_fcfa) })));
      });
  }, []);

  async function saveLoyalty() {
    const globalRate = fcfaToRate(fcfaPerPoint);
    if (globalRate === null) {
      showToast("Indiquez un nombre de FCFA par point (≥ 1).", "error");
      return;
    }
    setBusyLoyalty(true);
    const supabase = createClient();
    const { error } = await supabase.from("system_settings").update({ loyalty_points_per_fcfa: globalRate }).eq("id", true);
    let failed = error?.message ?? null;
    if (!failed) {
      for (const p of productRates) {
        const { error: pErr } = await supabase.from("products").update({ loyalty_points_per_fcfa: fcfaToRate(p.fcfaPerPoint) }).eq("id", p.id);
        if (pErr) {
          failed = pErr.message;
          break;
        }
      }
    }
    setBusyLoyalty(false);
    if (failed) showToast(`Échec de l'enregistrement : ${failed}`, "error");
    else showToast("Réglages de fidélité enregistrés");
  }

  async function savePricing() {
    const t = Math.round(Number(targetMargin));
    const tol = Math.round(Number(tolerance));
    const gap = Math.round(Number(priceCutGap));
    const low = Math.round(Number(lowSales));
    if (!(t >= 1 && t <= 99) || !(tol >= 0 && tol <= 100) || !(gap >= 0 && gap <= 100) || !(low >= 1 && low <= 100)) {
      showToast("Valeurs invalides (marge cible 1–99, tolérance 0–100, écart 0–100, ventes faibles 1–100).", "error");
      return;
    }
    setBusyPricing(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("system_settings")
      .update({ target_margin_pct: t, break_even_tolerance_pct: tol, price_cut_margin_gap_pct: gap, price_cut_low_sales_pct: low })
      .eq("id", true);
    setBusyPricing(false);
    if (error) showToast(`Échec de l'enregistrement : ${error.message}`, "error");
    else showToast("Seuils de pilotage enregistrés");
  }

  const inputCls = "border-2 border-[#e6dcc4] rounded-xl px-3 py-2 text-sm w-24";

  return (
    <>
      <div className="bg-white border border-[#ece2cd] rounded-2xl p-6 mt-4">
        <h2 className="font-bold text-lg text-ink mb-1">Points de fidélité</h2>
        <p className="text-sm text-[#9a8b78] mb-4">
          Points crédités à la livraison, calculés sur le sous-total de la commande (hors livraison, net de réduction). Le changement ne s&apos;applique
          qu&apos;aux commandes livrées ensuite.
        </p>
        <div className="flex items-center gap-2 text-sm text-ink mb-4">
          1 point pour
          <input type="number" min={1} value={fcfaPerPoint} onChange={(e) => setFcfaPerPoint(e.target.value)} className={inputCls} />
          FCFA
        </div>

        <div className="text-xs font-bold uppercase tracking-wide text-[#9a8b78] mb-2">Taux spécial par produit (optionnel)</div>
        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto mb-4">
          {productRates.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-ink truncate">{p.name}</span>
              <span className="flex items-center gap-2 flex-none">
                <input
                  type="number"
                  min={1}
                  value={p.fcfaPerPoint}
                  placeholder="global"
                  onChange={(e) => setProductRates((rows) => rows.map((r, j) => (j === i ? { ...r, fcfaPerPoint: e.target.value } : r)))}
                  className={inputCls}
                />
                <span className="text-xs text-[#9a8b78]">FCFA / pt</span>
              </span>
            </div>
          ))}
        </div>
        <button onClick={saveLoyalty} disabled={busyLoyalty} className="bg-maroon text-gold font-bold text-sm rounded-xl px-4 py-2.5 disabled:opacity-50">
          {busyLoyalty ? "Enregistrement…" : "Enregistrer la fidélité"}
        </button>
      </div>

      <div className="bg-white border border-[#ece2cd] rounded-2xl p-6 mt-4">
        <h2 className="font-bold text-lg text-ink mb-1">Pilotage des prix et du point mort</h2>
        <p className="text-sm text-[#9a8b78] mb-4">Seuils utilisés dans Rapports (indicateurs par produit et point mort).</p>
        <div className="flex flex-col gap-3 text-sm text-ink mb-4">
          <label className="flex items-center justify-between gap-3">
            Marge cible (%)
            <input type="number" value={targetMargin} onChange={(e) => setTargetMargin(e.target.value)} className={inputCls} />
          </label>
          <label className="flex items-center justify-between gap-3">
            Tolérance « Au niveau » du point mort (± %)
            <input type="number" value={tolerance} onChange={(e) => setTolerance(e.target.value)} className={inputCls} />
          </label>
          <label className="flex items-center justify-between gap-3">
            « Baisse de prix » : marge au-dessus de la cible d&apos;au moins (points)
            <input type="number" value={priceCutGap} onChange={(e) => setPriceCutGap(e.target.value)} className={inputCls} />
          </label>
          <label className="flex items-center justify-between gap-3">
            « Ventes faibles » : part du CA sous (% de la part moyenne)
            <input type="number" value={lowSales} onChange={(e) => setLowSales(e.target.value)} className={inputCls} />
          </label>
        </div>
        <button onClick={savePricing} disabled={busyPricing} className="bg-maroon text-gold font-bold text-sm rounded-xl px-4 py-2.5 disabled:opacity-50">
          {busyPricing ? "Enregistrement…" : "Enregistrer les seuils"}
        </button>
      </div>
    </>
  );
}
