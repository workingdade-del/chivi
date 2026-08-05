import Link from "next/link";
import { getReport, type ReportPeriod } from "@/lib/admin";
import { formatFcfa } from "@/lib/format";

const PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: "jour", label: "Aujourd'hui" },
  { id: "semaine", label: "Cette semaine" },
  { id: "mois", label: "Ce mois" },
  { id: "annee", label: "Cette année" },
];

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: { period?: string; customStart?: string; customEnd?: string };
}) {
  const period = (searchParams.period as ReportPeriod) || "jour";
  const customRange =
    searchParams.customStart && searchParams.customEnd
      ? { start: searchParams.customStart, end: searchParams.customEnd }
      : undefined;
  const rep = await getReport(period, customRange);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex gap-2 flex-wrap">
          {PERIODS.map((p) => (
            <Link
              key={p.id}
              href={`/admin/reports?period=${p.id}`}
              className={`px-4 py-2 rounded-full text-[13px] font-bold ${
                !customRange && period === p.id ? "bg-maroon text-gold" : "bg-white border border-[#e2d6bd] text-[#6d6358] font-semibold"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>

        <form action="/admin/reports" method="GET" className="flex items-end gap-2">
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
        </form>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-maroon rounded-2xl p-5 text-white">
          <div className="text-xs text-cream/70 uppercase tracking-wide">Revenus {rep.label}</div>
          <div className="font-mega text-3xl text-gold mt-2.5">{formatFcfa(rep.revenue)}</div>
          <div className="text-xs text-cream mt-1.5">{rep.orders} commandes</div>
        </div>
        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="text-xs text-[#9a8b78] uppercase tracking-wide">Coûts (denrées + livraison)</div>
          <div className="font-mega text-3xl text-ink mt-2.5">{formatFcfa(rep.costs)}</div>
          <div className="text-xs text-[#9a8b78] mt-1.5">dont {formatFcfa(rep.deliveryCosts)} livraison</div>
        </div>
        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="text-xs text-[#9a8b78] uppercase tracking-wide">Bénéfice net</div>
          <div className="font-mega text-3xl text-status-green-deep mt-2.5">{formatFcfa(rep.profit)}</div>
          <div className="text-xs text-status-green-deep mt-1.5 font-semibold">Marge {rep.margin}%</div>
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
          <span>Coûts</span>
          <span>Bénéfice</span>
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
        <div
          className="grid gap-3 px-5 py-3.5 bg-[#faf4e8] border-b border-[#efe6d3] text-[11px] tracking-wide uppercase text-[#9a8b78] font-semibold"
          style={{ gridTemplateColumns: "1.6fr 80px 1fr 1fr 1fr" }}
        >
          <span>Plat / variante</span>
          <span>Qté</span>
          <span>Revenus</span>
          <span>Coût</span>
          <span>Marge</span>
        </div>
        {rep.dishMarginRows.map((d) => (
          <div
            key={d.name}
            className="grid gap-3 px-5 py-3 border-b border-[#f3ecdd] items-center text-sm last:border-b-0"
            style={{ gridTemplateColumns: "1.6fr 80px 1fr 1fr 1fr" }}
          >
            <span className="font-semibold text-ink">{d.name}</span>
            <span className="text-[#6d6358]">{d.qty}</span>
            <span className="text-[#6d6358]">{formatFcfa(d.revenue)}</span>
            {d.costKnown ? (
              <>
                <span className="text-[#6d6358]">{formatFcfa(d.cost!)}</span>
                <span className={`font-mega ${d.margin! >= 0 ? "text-status-green-deep" : "text-chilli"}`}>{formatFcfa(d.margin!)}</span>
              </>
            ) : (
              <span className="text-[#b0a596] italic col-span-2">Coût non renseigné</span>
            )}
          </div>
        ))}
        {rep.dishMarginRows.length === 0 && (
          <div className="px-5 py-8 text-center text-[#9a8b78] text-sm">Aucune vente sur cette période.</div>
        )}
      </div>
    </div>
  );
}
