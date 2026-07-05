import Link from "next/link";
import { getOrders } from "@/lib/admin";
import { STATUS_LABELS } from "@/lib/order-status";
import { formatFcfa } from "@/lib/format";
import type { OrderStatus } from "@/lib/supabase/types";

const FILTERS: { id: OrderStatus | "all"; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "recue", label: "Reçues" },
  { id: "en_preparation", label: "En préparation" },
  { id: "en_route", label: "En route" },
];

const STATUS_BADGE: Record<OrderStatus, string> = {
  recue: "bg-[rgba(255,182,0,.16)] text-[#a6740a]",
  en_preparation: "bg-[rgba(231,50,35,.14)] text-[#c0392b]",
  prete: "bg-[rgba(231,50,35,.14)] text-[#c0392b]",
  en_route: "bg-status-blue-bg text-status-blue",
  livree: "bg-status-green-bg text-status-green-deep",
  annulee: "bg-[#fbe8e6] text-[#c0392b]",
};

export default async function AdminOrdersPage({ searchParams }: { searchParams: { status?: string } }) {
  const activeFilter = (searchParams.status as OrderStatus | "all") || "all";
  const orders = await getOrders(activeFilter === "all" ? undefined : activeFilter);

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={f.id === "all" ? "/admin/orders" : `/admin/orders?status=${f.id}`}
            className={`px-4 py-2 rounded-full text-[13px] font-bold ${
              activeFilter === f.id ? "bg-maroon text-gold" : "bg-white border border-[#e2d6bd] text-[#6d6358] font-semibold"
            }`}
          >
            {f.label}
          </Link>
        ))}
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
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_BADGE[o.status]}`}>
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
