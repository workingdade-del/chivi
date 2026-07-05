import Link from "next/link";
import { getReport, type ReportPeriod } from "@/lib/admin";
import { formatFcfa } from "@/lib/format";

const PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: "jour", label: "Aujourd'hui" },
  { id: "semaine", label: "Cette semaine" },
  { id: "mois", label: "Ce mois" },
];

export default async function AdminReportsPage({ searchParams }: { searchParams: { period?: string } }) {
  const period = (searchParams.period as ReportPeriod) || "jour";
  const rep = await getReport(period);

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {PERIODS.map((p) => (
          <Link
            key={p.id}
            href={`/admin/reports?period=${p.id}`}
            className={`px-4 py-2 rounded-full text-[13px] font-bold ${
              period === p.id ? "bg-maroon text-gold" : "bg-white border border-[#e2d6bd] text-[#6d6358] font-semibold"
            }`}
          >
            {p.label}
          </Link>
        ))}
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
        {rep.rows.map((r) => (
          <div
            key={r.label}
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
      </div>
    </div>
  );
}
