import Link from "next/link";
import { getReport, getFirstOrderMonth, currentCotonouMonth, type ReportData } from "@/lib/admin";
import { formatFcfa } from "@/lib/format";

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

  const [rep, compareRep] = await Promise.all([
    customRange ? getReport("jour", customRange) : getReport("mois", undefined, month),
    compareMonth && !customRange ? getReport("mois", undefined, compareMonth) : Promise.resolve(null),
  ]);

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

      {compareRep && compareMonth && <ComparisonTable a={rep} b={compareRep} labelA={monthLabel(month)} labelB={monthLabel(compareMonth)} />}

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
        </div>
        {rep.dishMarginRows.map((d) => {
          const lowMargin = d.costKnown && d.marginPct !== null && d.marginPct < threshold;
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
                </>
              ) : (
                <>
                  <span className="text-[#b0a596]">—</span>
                  <span className="text-[#6d6358]">{formatFcfa(d.revenue)}</span>
                  <span className="text-[#b0a596] italic" style={{ gridColumn: "span 3" }}>
                    Coût non renseigné
                  </span>
                </>
              )}
            </div>
          );
        })}
        {rep.dishMarginRows.length === 0 && (
          <div className="px-5 py-8 text-center text-[#9a8b78] text-sm">Aucune vente sur cette période.</div>
        )}
        {rep.dishMarginRows.length > 0 && <DishTotalRow rows={rep.dishMarginRows} threshold={threshold} />}
      </div>
    </div>
  );
}

const DISH_COLS = "1.5fr 50px 70px 1fr 1fr 1fr 1fr 1.1fr";

function DishTotalRow({ rows, threshold }: { rows: ReportData["dishMarginRows"]; threshold: number }) {
  const qty = rows.reduce((sum, r) => sum + r.qty, 0);
  const revenue = rows.reduce((sum, r) => sum + r.revenue, 0);
  const known = rows.filter((r) => r.costKnown);
  const knownQty = known.reduce((sum, r) => sum + r.qty, 0);
  const knownRevenue = known.reduce((sum, r) => sum + r.revenue, 0);
  const knownCost = known.reduce((sum, r) => sum + (r.cost ?? 0), 0);
  const knownMargin = knownRevenue - knownCost;
  const marginPct = knownRevenue > 0 ? Math.round((knownMargin / knownRevenue) * 100) : null;
  const unitCost = knownQty > 0 ? Math.round(knownCost / knownQty) : null;
  const partial = known.length < rows.length;
  const low = marginPct !== null && marginPct < threshold;

  return (
    <div className="border-t border-[#efe6d3] bg-[#faf4e8]">
      <div className="grid gap-3 px-5 py-3.5 items-center text-sm font-bold text-ink" style={{ gridTemplateColumns: DISH_COLS }}>
        <span>Total</span>
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
      </div>
      {partial && (
        <div className="px-5 pb-3 text-xs text-[#9a8b78]">
          Coût, marge et % marge du total : uniquement sur les plats dont le coût est renseigné ({known.length}/{rows.length}).
        </div>
      )}
    </div>
  );
}

function ComparisonTable({ a, b, labelA, labelB }: { a: ReportData; b: ReportData; labelA: string; labelB: string }) {
  const lines: { label: string; va: number; vb: number; money: boolean }[] = [
    { label: "Chiffre d'affaires", va: a.revenue, vb: b.revenue, money: true },
    { label: "Coûts (denrées)", va: a.costs, vb: b.costs, money: true },
    { label: "Marge brute", va: a.grossMargin, vb: b.grossMargin, money: true },
    { label: "Marge brute (%)", va: a.margin, vb: b.margin, money: false },
    { label: "Commandes", va: a.orders, vb: b.orders, money: false },
  ];
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
    </div>
  );
}
