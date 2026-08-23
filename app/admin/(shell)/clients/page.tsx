import Link from "next/link";
import { getClients, type QuickPeriod } from "@/lib/admin";
import { formatFcfa } from "@/lib/format";

const PERIODS: { id: QuickPeriod | "all"; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "jour", label: "Aujourd'hui" },
  { id: "semaine", label: "Cette semaine" },
  { id: "mois", label: "Ce mois" },
];

function buildHref(current: { period: QuickPeriod | "all"; q: string }, overrides: Partial<typeof current>) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();
  if (merged.period !== "all") params.set("period", merged.period);
  if (merged.q) params.set("q", merged.q);
  const qs = params.toString();
  return `/admin/clients${qs ? `?${qs}` : ""}`;
}

export default async function AdminClientsPage({ searchParams }: { searchParams: { period?: string; q?: string } }) {
  const activePeriod = (searchParams.period as QuickPeriod | "all") || "all";
  const search = searchParams.q || "";
  const current = { period: activePeriod, q: search };

  const clients = await getClients({
    period: activePeriod === "all" ? undefined : activePeriod,
    search: search || undefined,
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <form action="/admin/clients" method="GET" className="flex gap-2 flex-1 min-w-[240px]">
          {activePeriod !== "all" && <input type="hidden" name="period" value={activePeriod} />}
          <input
            type="text"
            name="q"
            defaultValue={search}
            placeholder="Rechercher (nom, numéro)…"
            className="flex-1 border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2 text-sm"
          />
          <button type="submit" className="px-4 py-2 rounded-xl text-[13px] font-bold bg-maroon text-gold">
            Rechercher
          </button>
        </form>
        <Link href="/admin/clients/new" className="px-4 py-2 rounded-full text-[13px] font-bold bg-maroon text-gold">
          + Nouveau client
        </Link>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[#9a8b78] mr-1">Nouveaux clients :</span>
        {PERIODS.map((p) => (
          <Link
            key={p.id}
            href={buildHref(current, { period: p.id })}
            className={`px-4 py-2 rounded-full text-[13px] font-bold ${
              activePeriod === p.id ? "bg-maroon text-gold" : "bg-white border border-[#e2d6bd] text-[#6d6358] font-semibold"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="bg-white border border-[#ece2cd] rounded-2xl overflow-hidden">
      <div
        className="grid gap-3 px-5 py-3.5 bg-[#faf4e8] border-b border-[#efe6d3] text-[11px] tracking-wide uppercase text-[#9a8b78] font-semibold"
        style={{ gridTemplateColumns: "1.6fr 1.2fr 1fr 1fr 40px" }}
      >
        <span>Client</span>
        <span>WhatsApp</span>
        <span>Commandes</span>
        <span>Total dépensé</span>
        <span />
      </div>
      {clients.map((c) => (
        <Link
          key={c.id}
          href={`/admin/clients/${c.id}`}
          className="grid gap-3 px-5 py-4 border-b border-[#f3ecdd] items-center text-sm"
          style={{ gridTemplateColumns: "1.6fr 1.2fr 1fr 1fr 40px" }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-[38px] h-[38px] flex-none rounded-full bg-[#f4ead2] text-maroon flex items-center justify-center font-mega">
              {c.name[0]?.toUpperCase()}
            </div>
            <b className="font-semibold text-ink">{c.name}</b>
          </div>
          <span className="text-[13px] text-[#6d6358]">{c.phone}</span>
          <span className="text-[#6d6358]">{c.orderCount}</span>
          <span className="font-mega text-maroon-deep">{formatFcfa(c.spent)}</span>
          <span className="text-[#c9bda6] text-right">›</span>
        </Link>
      ))}
      {clients.length === 0 && <div className="px-5 py-10 text-center text-[#9a8b78] text-sm">Aucun client pour le moment.</div>}
      </div>
    </div>
  );
}
