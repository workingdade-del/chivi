import Link from "next/link";
import { getOrders, type QuickPeriod } from "@/lib/admin";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/order-status";
import { formatFcfa } from "@/lib/format";
import { RealtimeRefresh } from "@/components/admin/RealtimeRefresh";
import type { OrderStatus } from "@/lib/supabase/types";

const FILTERS: { id: OrderStatus | "all"; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "recue", label: "Reçues" },
  { id: "en_preparation", label: "En préparation" },
  { id: "en_route", label: "En route" },
];

const PERIODS: { id: QuickPeriod | "all"; label: string }[] = [
  { id: "all", label: "Toutes périodes" },
  { id: "jour", label: "Aujourd'hui" },
  { id: "semaine", label: "Cette semaine" },
  { id: "mois", label: "Ce mois" },
];

function buildHref(current: { status: OrderStatus | "all"; period: QuickPeriod | "all"; q: string }, overrides: Partial<typeof current>) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();
  if (merged.status !== "all") params.set("status", merged.status);
  if (merged.period !== "all") params.set("period", merged.period);
  if (merged.q) params.set("q", merged.q);
  const qs = params.toString();
  return `/admin/orders${qs ? `?${qs}` : ""}`;
}

export default async function AdminOrdersPage({ searchParams }: { searchParams: { status?: string; period?: string; q?: string } }) {
  const activeFilter = (searchParams.status as OrderStatus | "all") || "all";
  const activePeriod = (searchParams.period as QuickPeriod | "all") || "all";
  const search = searchParams.q || "";
  const current = { status: activeFilter, period: activePeriod, q: search };

  const orders = await getOrders({
    status: activeFilter === "all" ? undefined : activeFilter,
    period: activePeriod === "all" ? undefined : activePeriod,
    search: search || undefined,
  });

  return (
    <div>
      <RealtimeRefresh tables={["orders"]} />
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <form action="/admin/orders" method="GET" className="flex gap-2 flex-1 min-w-[240px]">
          {activeFilter !== "all" && <input type="hidden" name="status" value={activeFilter} />}
          {activePeriod !== "all" && <input type="hidden" name="period" value={activePeriod} />}
          <input
            type="text"
            name="q"
            defaultValue={search}
            placeholder="Rechercher (client, numéro, commande)…"
            className="flex-1 border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2 text-sm"
          />
          <button type="submit" className="px-4 py-2 rounded-xl text-[13px] font-bold bg-maroon text-gold">
            Rechercher
          </button>
        </form>
        <Link href="/admin/orders/new" className="px-4 py-2 rounded-full text-[13px] font-bold bg-maroon text-gold">
          + Nouvelle commande
        </Link>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <Link
              key={f.id}
              href={buildHref(current, { status: f.id })}
              className={`px-4 py-2 rounded-full text-[13px] font-bold ${
                activeFilter === f.id ? "bg-maroon text-gold" : "bg-white border border-[#e2d6bd] text-[#6d6358] font-semibold"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
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
      </div>

      <div className="bg-white border border-[#ece2cd] rounded-2xl overflow-hidden">
        <div
          className="grid gap-3 px-5 py-3.5 bg-[#faf4e8] border-b border-[#efe6d3] text-[11px] tracking-wide uppercase text-[#9a8b78] font-semibold"
          style={{ gridTemplateColumns: "130px 1.4fr 1fr 120px 1fr 40px" }}
        >
          <span>Commande</span>
          <span>Client</span>
          <span>Statut</span>
          <span>Montant</span>
          <span>Livreur</span>
          <span />
        </div>
        {orders.map((o) => (
          <Link
            key={o.id}
            href={`/admin/orders/${o.id}`}
            className="grid gap-3 px-5 py-4 border-b border-[#f3ecdd] items-center text-sm"
            style={{ gridTemplateColumns: "130px 1.4fr 1fr 120px 1fr 40px" }}
          >
            <span className="font-mega text-maroon-deep">{o.order_number}</span>
            <span>
              <b className="text-ink font-semibold">{o.client_name || "Client"}</b>
              <br />
              <span className="text-xs text-[#9a8b78]">
                {new Date(o.created_at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </span>
            <span>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLORS[o.status]}`}>
                {STATUS_LABELS[o.status]}
              </span>
            </span>
            <span className="font-mega text-ink">{formatFcfa(o.total)}</span>
            <span className="text-[13px] text-[#6d6358]">
              {o.driver_name || <span className="text-chilli font-semibold">À assigner</span>}
            </span>
            <span className="text-[#c9bda6] text-right">›</span>
          </Link>
        ))}
        {orders.length === 0 && <div className="px-5 py-10 text-center text-[#9a8b78] text-sm">Aucune commande.</div>}
      </div>
    </div>
  );
}
