import Link from "next/link";
import { getReport, getFirstOrderMonth, currentCotonouMonth, type ReportData } from "@/lib/admin";
import { formatFcfa } from "@/lib/format";
import { getPricingSettings, type PricingSettings } from "@/lib/system-settings";
import {
  computeBreakEven,
  computeProductPricing,
  BREAK_EVEN_LABELS,
  BREAK_EVEN_REASONS,
  PRICE_BADGE_LABELS,
  type BreakEvenResult,
} from "@/lib/pricing";

const DEFAULT_LOW_MARGIN = 30;

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}

function isMonth(v: string | undefined): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

function pctDelta(a: number, b: number): string {
  if (b === 0) return a === 0 ? "0 %" : "—";
  const p = Math.round(((a - b) / Math.abs(b)) * 100);
  return `${p > 0 ? "+" : ""}${p} %`;
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: { month?: string; compare?: string; seuil?: string; customStart?: string; customEnd?: string };
}) {
  const nowMonth = currentCotonouMonth();
  const firstMonth = await getFirstOrderMonth();
  // Jamais dans le futur, jamais avant la première commande.
  const clamp = (m: string) => (m > nowMonth ? nowMonth : m < firstMonth ? firstMonth : m);
  const month = isMonth(searchParams.month) ? clamp(searchParams.month) : nowMonth;
  const compareMonth = isMonth(searchParams.compare) ? clamp(searchParams.compare) : null;
  const threshold = Math.min(100, Math.max(0, parseInt(searchParams.seuil ?? "", 10) || DEFAULT_LOW_MARGIN));
  const customRange =
    searchParams.customStart && searchParams.customEnd
      ? { start: searchParams.customStart, end: searchParams.customEnd }
      : undefined;

  const [rep, compareRep, pricing] = await Promise.all([
    customRange ? getReport("jour", customRange) : getReport("mois", undefined, month),
    compareMonth && !customRange ? getReport("mois", undefined, compareMonth) : Promise.resolve(null),
    getPricingSettings(),
  ]);
  const breakEvenOf = (r: ReportData) =>
    computeBreakEven({ fixedCosts: r.fixedCosts, revenue: r.revenue, grossMargin: r.grossMargin, tolerancePct: pricing.breakEvenTolerancePct });
  const breakEven = breakEvenOf(rep);
  const compareBreakEven = compareRep ? breakEvenOf(compareRep) : null;
  const periodWord = customRange ? "de la période" : "du mois";
  const totalDishRevenue = rep.dishMarginRows.reduce((sum, r) => sum + r.revenue, 0);
  // Coûts fixes alloués au prorata du CA (convention).
  const allocFixed = (revenue: number) => (rep.fixedCosts > 0 && totalDishRevenue > 0 ? Math.round((rep.fixedCosts * revenue) / totalDishRevenue) : 0);

  const monthOptions: string[] = [];
  for (let m = nowMonth; m >= firstMonth; m = shiftMonth(m, -1)) monthOptions.push(m);

  const href = (o: { month?: string; compare?: string | null }) => {
    const params = new URLSearchParams();
    params.set("month", o.month ?? month);
    const c = o.compare === undefined ? compareMonth : o.compare;
    if (c) params.set("compare", c);
    if (threshold !== DEFAULT_LOW_MARGIN) params.set("seuil", String(threshold));
    return `/admin/reports?${params.toString()}`;
  };

  const navBtn = "px-3 py-1.5 rounded-full border border-[#e2d6bd] bg-white text-maroon font-bold";
  const navBtnOff = "px-3 py-1.5 rounded-full border border-[#efe6d3] text-[#c9bda6] font-bold";

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {month > firstMonth ? (
            <Link href={href({ month: shiftMonth(month, -1) })} className={navBtn} aria-label="Mois précédent">
              ‹
            </Link>
          ) : (
            <span className={navBtnOff}>‹</span>
          )}
          <form action="/admin/reports" method="GET" className="flex items-center gap-2">
            {compareMonth && <input type="hidden" name="compare" value={compareMonth} />}
            {threshold !== DEFAULT_LOW_MARGIN && <input type="hidden" name="seuil" value={threshold} />}
            <select name="month" defaultValue={month} className="border-2 border-[#e6dcc4] rounded-xl px-3 py-1.5 text-[13px] capitalize">
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
            <button type="submit" className="px-3 py-1.5 rounded-xl text-[13px] font-bold border-2 border-[#e6dcc4] text-[#6d6358]">
              Voir
            </button>
          </form>
          {month < nowMonth ? (
            <Link href={href({ month: shiftMonth(month, 1) })} className={navBtn} aria-label="Mois suivant">
              ›
            </Link>
          ) : (
            <span className={navBtnOff}>›</span>
          )}
          {month !== nowMonth && (
            <Link href={href({ month: nowMonth })} className="text-[12px] font-semibold text-maroon underline">
              Mois en cours
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {compareMonth ? (
            <>
              <form action="/admin/reports" method="GET" className="flex items-center gap-2">
                <input type="hidden" name="month" value={month} />
                {threshold !== DEFAULT_LOW_MARGIN && <input type="hidden" name="seuil" value={threshold} />}
                <span className="text-[12px] font-bold uppercase tracking-wide text-[#9a8b78]">Comparer à</span>
                <select name="compare" defaultValue={compareMonth} className="border-2 border-[#e6dcc4] rounded-xl px-3 py-1.5 text-[13px] capitalize">
                  {monthOptions.map((m) => (
                    <option key={m} value={m}>
                      {monthLabel(m)}
                    </option>
                  ))}
                </select>
                <button type="submit" className="px-3 py-1.5 rounded-xl text-[13px] font-bold border-2 border-[#e6dcc4] text-[#6d6358]">
                  OK
                </button>
              </form>
              <Link href={href({ compare: null })} className="text-[12px] font-semibold text-maroon underline">
                Quitter la comparaison
              </Link>
            </>
          ) : (
            <Link
              href={href({ compare: month > firstMonth ? shiftMonth(month, -1) : month })}
              className="px-4 py-2 rounded-full text-[13px] font-bold bg-white border border-[#e2d6bd] text-[#6d6358]"
            >
              Comparer
            </Link>
          )}
        </div>
      </div>

      <details className="mb-4 bg-white border border-[#ece2cd] rounded-2xl px-4 py-3" open={!!customRange}>
        <summary className="cursor-pointer text-[13px] font-bold text-[#6d6358]">Avancé — plage de dates personnalisée</summary>
        <form action="/admin/reports" method="GET" className="flex items-end gap-2 mt-3 flex-wrap">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-[#9a8b78] mb-1">Du</label>
            <input
              type="date"
              name="customStart"
              defaultValue={searchParams.customStart}
              className="border-2 border-[#e6dcc4] rounded-xl px-2.5 py-1.5 text-[13px]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-[#9a8b78] mb-1">Au</label>
            <input
              type="date"
              name="customEnd"
              defaultValue={searchParams.customEnd}
              className="border-2 border-[#e6dcc4] rounded-xl px-2.5 py-1.5 text-[13px]"
            />
          </div>
          <button type="submit" className={`px-4 py-2 rounded-xl text-[13px] font-bold ${customRange ? "bg-maroon text-gold" : "border-2 border-[#e6dcc4] text-[#6d6358]"}`}>
            Appliquer
          </button>
          {customRange && (
            <Link href="/admin/reports" className="text-[12px] font-semibold text-maroon underline pb-2">
              Revenir au mois
            </Link>
          )}
        </form>
      </details>

      {compareRep && compareMonth && (
        <ComparisonTable
          a={rep}
          b={compareRep}
          labelA={monthLabel(month)}
          labelB={monthLabel(compareMonth)}
          beA={breakEven}
          beB={compareBreakEven!}
        />
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-maroon rounded-2xl p-5 text-white">
          <div className="text-xs text-cream/70 uppercase tracking-wide">Revenus {rep.label}</div>
          <div className="font-mega text-3xl text-gold mt-2.5">{formatFcfa(rep.revenue)}</div>
          <div className="text-xs text-cream mt-1.5">{rep.orders} commandes</div>
        </div>
        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="text-xs text-[#9a8b78] uppercase tracking-wide">Coûts (denrées)</div>
          <div className="font-mega text-3xl text-ink mt-2.5">{formatFcfa(rep.costs)}</div>
          <div className="text-xs text-[#9a8b78] mt-1.5">Ingrédients + emballage des plats vendus</div>
        </div>
        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="text-xs text-[#9a8b78] uppercase tracking-wide">Marge brute (ingrédients)</div>
          <div className="font-mega text-3xl text-status-green-deep mt-2.5">{formatFcfa(rep.grossMargin)}</div>
          <div className="text-xs text-status-green-deep mt-1.5 font-semibold">Marge {rep.margin}%</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="text-xs text-[#9a8b78] uppercase tracking-wide">Dépenses générales</div>
          <div className="font-mega text-3xl text-ink mt-2.5">{formatFcfa(rep.expenses)}</div>
          <div className="text-xs text-[#9a8b78] mt-1.5">Loyer, salaires, achats divers (hors denrées)</div>
        </div>
        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="text-xs text-[#9a8b78] uppercase tracking-wide">Bénéfice net (avec charges)</div>
          <div className={`font-mega text-3xl mt-2.5 ${rep.netProfit >= 0 ? "text-status-green-deep" : "text-chilli"}`}>
            {formatFcfa(rep.netProfit)}
          </div>
          <div className={`text-xs mt-1.5 font-semibold ${rep.netProfit >= 0 ? "text-status-green-deep" : "text-chilli"}`}>
            Marge nette {rep.netMargin}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="text-xs text-[#9a8b78] uppercase tracking-wide">Coûts fixes {periodWord}</div>
          <div className="font-mega text-3xl text-ink mt-2.5">{formatFcfa(rep.fixedCosts)}</div>
          <div className="text-xs text-[#9a8b78] mt-1.5">Dépenses marquées « fixe » (hors ingrédients/emballage, déjà dans les coûts variables).</div>
          {rep.unclassifiedExpensesCount > 0 && (
            <Link href={customRange ? "/admin/expenses?type=a_classer" : `/admin/expenses?type=a_classer&month=${month}`} className="inline-block mt-2.5 text-[12px] font-semibold text-[#a6740a] underline">
              {rep.unclassifiedExpensesCount} dépense{rep.unclassifiedExpensesCount > 1 ? "s" : ""} à classer →
            </Link>
          )}
        </div>
        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="text-xs text-[#9a8b78] uppercase tracking-wide">Coûts variables</div>
          <div className="font-mega text-3xl text-ink mt-2.5">{formatFcfa(rep.costs)}</div>
          <div className="text-xs text-[#9a8b78] mt-1.5">Coût ingrédients/emballage des plats vendus (Gestion Menu).</div>
        </div>
      </div>

      <BreakEvenCard result={breakEven} revenue={rep.revenue} periodWord={periodWord} coveragePct={rep.dishMarginCoveragePct} />

      <div className="bg-white border border-[#ece2cd] rounded-2xl overflow-hidden mt-4">
        <div
          className="grid gap-3 px-5 py-3.5 bg-[#faf4e8] border-b border-[#efe6d3] text-[11px] tracking-wide uppercase text-[#9a8b78] font-semibold"
          style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr" }}
        >
          <span>{rep.rowHead}</span>
          <span>Commandes</span>
          <span>Revenus</span>
          <span>Coûts (denrées)</span>
          <span>Marge brute</span>
        </div>
        {rep.rows.map((r, i) => (
          <div
            key={`${r.label}-${i}`}
            className="grid gap-3 px-5 py-3.5 border-b border-[#f3ecdd] items-center text-sm capitalize"
            style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr" }}
          >
            <span className="font-semibold text-ink">{r.label}</span>
            <span className="text-[#6d6358]">{r.orders}</span>
            <span className="font-mega text-maroon-deep">{formatFcfa(r.revenue)}</span>
            <span className="text-[#6d6358]">{formatFcfa(r.costs)}</span>
            <span className="font-mega text-status-green-deep">{formatFcfa(r.profit)}</span>
          </div>
        ))}
        {rep.rows.length === 0 && <div className="px-5 py-8 text-center text-[#9a8b78] text-sm">Aucune donnée sur cette période.</div>}
      </div>

      <div className="bg-white border border-[#ece2cd] rounded-2xl p-5 mt-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs text-[#9a8b78] uppercase tracking-wide">Marge plats (coûts ingrédients) — {rep.label}</div>
          <div className="font-mega text-2xl text-maroon-deep mt-1.5">{formatFcfa(rep.dishMargin)}</div>
          <div className="text-xs text-[#9a8b78] mt-1">
            Recalculée en temps réel depuis les coûts actuels de chaque plat/variante — distincte du « Bénéfice » ci-dessus.
          </div>
        </div>
        {rep.dishMarginCoveragePct < 90 && (
          <div className="text-[13px] text-[#a6740a] bg-[#fff6e5] border-l-[3px] border-amber rounded-lg px-3.5 py-2.5 max-w-sm leading-snug">
            ⚠️ Marge calculée sur {rep.dishMarginCoveragePct}% des ventes de la période — coûts manquants pour certains plats.
          </div>
        )}
      </div>

      <div className="bg-white border border-[#ece2cd] rounded-2xl overflow-hidden mt-4">
        <div className="flex items-center justify-between flex-wrap gap-2 px-5 py-3.5 border-b border-[#efe6d3]">
          <div className="font-bold text-[15px] text-ink">Marge par plat</div>
          <form action="/admin/reports" method="GET" className="flex items-center gap-2">
            {customRange ? (
              <>
                <input type="hidden" name="customStart" value={customRange.start} />
                <input type="hidden" name="customEnd" value={customRange.end} />
              </>
            ) : (
              <input type="hidden" name="month" value={month} />
            )}
            {compareMonth && !customRange && <input type="hidden" name="compare" value={compareMonth} />}
            <label className="text-[12px] text-[#9a8b78]">« À vérifier » sous</label>
            <input
              type="number"
              name="seuil"
              min={0}
              max={100}
              defaultValue={threshold}
              className="w-16 border-2 border-[#e6dcc4] rounded-xl px-2 py-1 text-[13px]"
            />
            <span className="text-[12px] text-[#9a8b78]">% de marge</span>
            <button type="submit" className="px-3 py-1 rounded-xl text-[12px] font-bold border-2 border-[#e6dcc4] text-[#6d6358]">
              OK
            </button>
          </form>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[1500px]">
            <div
              className="grid gap-3 px-5 py-3.5 bg-[#faf4e8] border-b border-[#efe6d3] text-[11px] tracking-wide uppercase text-[#9a8b78] font-semibold"
              style={{ gridTemplateColumns: DISH_COLS }}
            >
              <span>Plat / variante</span>
              <span>Qté</span>
              <span>% ventes</span>
              <span>Coût unit.</span>
              <span>CA</span>
              <span>Coût</span>
              <span>Marge</span>
              <span>% marge</span>
              <span>Coût fixe alloué</span>
              <span>Marge nette</span>
              <span>Prix conseillé</span>
              <span>Points</span>
              <span>Indicateur</span>
            </div>
            {rep.dishMarginRows.map((d) => {
              const lowMargin = d.costKnown && d.marginPct !== null && d.marginPct < threshold;
              const fixedAlloc = allocFixed(d.revenue);
              const pr = computeProductPricing(d, { productCount: rep.dishMarginRows.length, ...pricingCtx(pricing) });
              return (
                <div
                  key={d.name}
                  className="grid gap-3 px-5 py-3 border-b border-[#f3ecdd] items-center text-sm last:border-b-0"
                  style={{ gridTemplateColumns: DISH_COLS }}
                >
                  <span className="font-semibold text-ink">{d.name}</span>
                  <span className="text-[#6d6358]">{d.qty}</span>
                  <span className="text-[#6d6358]">{d.salesSharePct} %</span>
                  {d.costKnown ? (
                    <>
                      <span className="text-[#6d6358]">{formatFcfa(d.unitCost!)}</span>
                      <span className="text-[#6d6358]">{formatFcfa(d.revenue)}</span>
                      <span className="text-[#6d6358]">{formatFcfa(d.cost!)}</span>
                      <span className={`font-mega ${d.margin! >= 0 ? "text-status-green-deep" : "text-chilli"}`}>{formatFcfa(d.margin!)}</span>
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span className={lowMargin ? "text-chilli font-bold" : "text-[#6d6358]"}>{d.marginPct} %</span>
                        {lowMargin && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#fff6e5] text-[#a6740a]">À vérifier</span>}
                      </span>
                      <span className="text-[#6d6358]">{fixedAlloc > 0 ? formatFcfa(fixedAlloc) : "—"}</span>
                      <span className={`font-mega ${d.margin! - fixedAlloc >= 0 ? "text-status-green-deep" : "text-chilli"}`}>{formatFcfa(d.margin! - fixedAlloc)}</span>
                      <span className="text-[#6d6358]">{pr.suggestedPrice !== null ? formatFcfa(pr.suggestedPrice) : "—"}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[#b0a596]">—</span>
                      <span className="text-[#6d6358]">{formatFcfa(d.revenue)}</span>
                      <span className="text-[#b0a596] italic" style={{ gridColumn: "span 3" }}>
                        Coût non renseigné
                      </span>
                      <span className="text-[#6d6358]">{fixedAlloc > 0 ? formatFcfa(fixedAlloc) : "—"}</span>
                      <span className="text-[#b0a596]">—</span>
                      <span className="text-[#b0a596]">—</span>
                    </>
                  )}
                  <span className="text-[#6d6358]">{d.points ?? 0}</span>
                  <PriceBadgeView badge={pr.badge} />
                </div>
              );
            })}
            {rep.dishMarginRows.length === 0 && (
              <div className="px-5 py-8 text-center text-[#9a8b78] text-sm">Aucune vente sur cette période.</div>
            )}
            {rep.dishMarginRows.length > 0 && <DishTotalRow rows={rep.dishMarginRows} threshold={threshold} fixedCosts={rep.fixedCosts} pricing={pricing} />}
          </div>
        </div>
        <div className="px-5 py-3 text-xs text-[#9a8b78] leading-relaxed border-t border-[#efe6d3]">
          <b>Coût fixe alloué</b> : coûts fixes {periodWord} répartis au prorata du CA de chaque produit (convention). <b>Marge nette</b> = marge − coût fixe alloué.{" "}
          <b>Prix conseillé</b> = coût variable unitaire ÷ (1 − marge cible {pricing.targetMarginPct} %), arrondi à la dizaine. <b>{PRICE_BADGE_LABELS.hausse}</b> : marge sous la cible.{" "}
          <b>{PRICE_BADGE_LABELS.baisse}</b> : marge ≥ cible + {pricing.priceCutMarginGapPct} pts ET part du CA &lt; {pricing.priceCutLowSalesPct} % de la part moyenne.
          Points : fidélité générés par les commandes livrées. Seuils modifiables dans Paramètres.
        </div>
      </div>
    </div>
  );
}

const DISH_COLS = "1.4fr 45px 60px 85px 95px 95px 95px 110px 95px 95px 95px 60px 190px";

function pricingCtx(p: PricingSettings) {
  return { targetMarginPct: p.targetMarginPct, priceCutMarginGapPct: p.priceCutMarginGapPct, priceCutLowSalesPct: p.priceCutLowSalesPct };
}

function PriceBadgeView({ badge }: { badge: "hausse" | "baisse" | null }) {
  if (!badge) return <span />;
  return (
    <span
      className={`text-[11px] font-bold px-2.5 py-1 rounded-full w-fit ${badge === "hausse" ? "bg-[rgba(231,50,35,.1)] text-chilli" : "bg-status-green-bg text-status-green-deep"}`}
    >
      {PRICE_BADGE_LABELS[badge]}
    </span>
  );
}

function DishTotalRow({
  rows,
  threshold,
  fixedCosts,
  pricing,
}: {
  rows: ReportData["dishMarginRows"];
  threshold: number;
  fixedCosts: number;
  pricing: PricingSettings;
}) {
  const qty = rows.reduce((sum, r) => sum + r.qty, 0);
  const revenue = rows.reduce((sum, r) => sum + r.revenue, 0);
  const points = rows.reduce((sum, r) => sum + (r.points ?? 0), 0);
  const known = rows.filter((r) => r.costKnown);
  const knownQty = known.reduce((sum, r) => sum + r.qty, 0);
  const knownRevenue = known.reduce((sum, r) => sum + r.revenue, 0);
  const knownCost = known.reduce((sum, r) => sum + (r.cost ?? 0), 0);
  const knownMargin = knownRevenue - knownCost;
  const marginPct = knownRevenue > 0 ? Math.round((knownMargin / knownRevenue) * 100) : null;
  const unitCost = knownQty > 0 ? Math.round(knownCost / knownQty) : null;
  const partial = known.length < rows.length;
  const low = marginPct !== null && marginPct < threshold;
  const pr = computeProductPricing(
    { revenue: knownRevenue, qty: knownQty, unitCost, marginPct, salesSharePct: 100 },
    { productCount: 1, ...pricingCtx(pricing) }
  );
  const netMargin = knownMargin - fixedCosts;

  return (
    <div className="border-t border-[#efe6d3] bg-[#faf4e8]">
      <div className="grid gap-3 px-5 py-3.5 items-center text-sm font-bold text-ink" style={{ gridTemplateColumns: DISH_COLS }}>
        <span>Tous produits</span>
        <span>{qty}</span>
        <span>100 %</span>
        <span>{unitCost !== null ? formatFcfa(unitCost) : "—"}</span>
        <span>{formatFcfa(revenue)}</span>
        <span>{known.length > 0 ? formatFcfa(knownCost) : "—"}</span>
        <span className={knownMargin >= 0 ? "text-status-green-deep" : "text-chilli"}>{known.length > 0 ? formatFcfa(knownMargin) : "—"}</span>
        <span className="flex items-center gap-1.5 flex-wrap">
          {marginPct !== null ? <span className={low ? "text-chilli" : ""}>{marginPct} %</span> : <span className="text-[#b0a596] italic font-normal">Coût non renseigné</span>}
          {low && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#fff6e5] text-[#a6740a]">À vérifier</span>}
        </span>
        <span>{fixedCosts > 0 ? formatFcfa(fixedCosts) : "—"}</span>
        <span className={netMargin >= 0 ? "text-status-green-deep" : "text-chilli"}>{known.length > 0 ? formatFcfa(netMargin) : "—"}</span>
        <span>{pr.suggestedPrice !== null ? formatFcfa(pr.suggestedPrice) : "—"}</span>
        <span>{points}</span>
        <PriceBadgeView badge={pr.badge} />
      </div>
      {partial && (
        <div className="px-5 pb-3 text-xs text-[#9a8b78] font-normal">
          Coût, marge, % marge et prix conseillé du total : uniquement sur les plats dont le coût est renseigné ({known.length}/{rows.length}).
        </div>
      )}
    </div>
  );
}

function BreakEvenCard({ result, revenue, periodWord, coveragePct }: { result: BreakEvenResult; revenue: number; periodWord: string; coveragePct: number }) {
  return (
    <div className="bg-white border border-[#ece2cd] rounded-2xl p-5 mt-4">
      <div className="text-xs text-[#9a8b78] uppercase tracking-wide">Point mort {periodWord}</div>
      {!result.ok ? (
        <div className="text-[13px] text-[#a6740a] bg-[#fff6e5] border-l-[3px] border-amber rounded-lg px-3.5 py-2.5 mt-2.5 leading-snug">
          {BREAK_EVEN_REASONS[result.reason]}
        </div>
      ) : (
        <>
          <div className="flex items-end justify-between flex-wrap gap-3 mt-2.5">
            <div>
              <div className="font-mega text-3xl text-ink">{formatFcfa(result.breakEven)}</div>
              <div className="text-xs text-[#9a8b78] mt-1">CA à réaliser pour couvrir les coûts fixes</div>
            </div>
            <div className="text-right">
              <div
                className={`text-sm font-bold ${result.status === "au_dessus" ? "text-status-green-deep" : result.status === "au_niveau" ? "text-[#a6740a]" : "text-chilli"}`}
              >
                {BREAK_EVEN_LABELS[result.status]}
              </div>
              <div className="text-xs text-[#6d6358] mt-0.5">
                {result.gap > 0 ? "+" : ""}
                {formatFcfa(result.gap)} ({result.gapPct > 0 ? "+" : ""}
                {result.gapPct} %)
              </div>
            </div>
          </div>
          <div className="mt-3.5">
            <div className="relative h-3 rounded-full bg-[#f0e7d4] overflow-hidden">
              <div
                className={`h-full ${result.progressPct >= 100 ? "bg-[#1b9c53]" : "bg-amber"}`}
                style={{ width: `${Math.min(100, result.progressPct)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-[#9a8b78] mt-1">
              <span>CA réalisé : {formatFcfa(revenue)}</span>
              <span>{result.progressPct} % du point mort</span>
            </div>
          </div>
          {coveragePct < 90 && (
            <div className="text-xs text-[#a6740a] mt-2.5">⚠️ Taux de marge calculé sur {coveragePct} % des ventes (coûts manquants pour certains plats).</div>
          )}
        </>
      )}
    </div>
  );
}

function ComparisonTable({
  a,
  b,
  labelA,
  labelB,
  beA,
  beB,
}: {
  a: ReportData;
  b: ReportData;
  labelA: string;
  labelB: string;
  beA: BreakEvenResult;
  beB: BreakEvenResult;
}) {
  const lines: { label: string; va: number; vb: number; money: boolean }[] = [
    { label: "Chiffre d'affaires", va: a.revenue, vb: b.revenue, money: true },
    { label: "Coûts (denrées)", va: a.costs, vb: b.costs, money: true },
    { label: "Marge brute", va: a.grossMargin, vb: b.grossMargin, money: true },
    { label: "Marge brute (%)", va: a.margin, vb: b.margin, money: false },
    { label: "Commandes", va: a.orders, vb: b.orders, money: false },
    { label: "Coûts fixes", va: a.fixedCosts, vb: b.fixedCosts, money: true },
  ];
  const beText = (r: BreakEvenResult) => (r.ok ? formatFcfa(r.breakEven) : "Non calculable");
  const beStatus = (r: BreakEvenResult) => (r.ok ? `${BREAK_EVEN_LABELS[r.status]} (${r.gap > 0 ? "+" : ""}${formatFcfa(r.gap)})` : "—");
  const fmt = (v: number, money: boolean) => (money ? formatFcfa(v) : String(v));
  const cols = "1.3fr 1fr 1fr 1fr 80px";

  return (
    <div className="bg-white border border-[#ece2cd] rounded-2xl overflow-hidden mb-4">
      <div
        className="grid gap-3 px-5 py-3.5 bg-[#faf4e8] border-b border-[#efe6d3] text-[11px] tracking-wide uppercase text-[#9a8b78] font-semibold"
        style={{ gridTemplateColumns: cols }}
      >
        <span>Comparaison</span>
        <span className="capitalize">{labelA}</span>
        <span className="capitalize">{labelB}</span>
        <span>Écart</span>
        <span>Écart %</span>
      </div>
      {lines.map((l) => {
        const diff = l.va - l.vb;
        return (
          <div key={l.label} className="grid gap-3 px-5 py-3.5 border-b border-[#f3ecdd] items-center text-sm last:border-b-0" style={{ gridTemplateColumns: cols }}>
            <span className="font-semibold text-ink">{l.label}</span>
            <span className="font-mega text-maroon-deep">{fmt(l.va, l.money)}</span>
            <span className="text-[#6d6358]">{fmt(l.vb, l.money)}</span>
            <span className={diff === 0 ? "text-[#6d6358]" : diff > 0 ? "text-status-green-deep font-semibold" : "text-chilli font-semibold"}>
              {diff > 0 ? "+" : ""}
              {l.money ? formatFcfa(diff) : l.label.includes("%") ? `${diff} pts` : diff}
            </span>
            <span className="text-[#6d6358]">{l.label.includes("%") ? "—" : pctDelta(l.va, l.vb)}</span>
          </div>
        );
      })}
      <div className="grid gap-3 px-5 py-3.5 border-b border-[#f3ecdd] items-center text-sm" style={{ gridTemplateColumns: cols }}>
        <span className="font-semibold text-ink">Point mort</span>
        <span className="font-mega text-maroon-deep">{beText(beA)}</span>
        <span className="text-[#6d6358]">{beText(beB)}</span>
        <span className="text-[#6d6358]">{beA.ok && beB.ok ? `${beA.breakEven - beB.breakEven > 0 ? "+" : ""}${formatFcfa(beA.breakEven - beB.breakEven)}` : "—"}</span>
        <span className="text-[#6d6358]">{beA.ok && beB.ok ? pctDelta(beA.breakEven, beB.breakEven) : "—"}</span>
      </div>
      <div className="grid gap-3 px-5 py-3.5 items-start text-[13px]" style={{ gridTemplateColumns: cols }}>
        <span className="font-semibold text-ink text-sm">Statut point mort</span>
        <span className="text-[#6d6358]">{beStatus(beA)}</span>
        <span className="text-[#6d6358]">{beStatus(beB)}</span>
        <span />
        <span />
      </div>
    </div>
  );
}
