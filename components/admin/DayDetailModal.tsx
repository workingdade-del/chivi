"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatFcfa } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/order-status";
import type { OrderStatus } from "@/lib/supabase/types";

interface DayOrder {
  id: string;
  order_number: string;
  total: number;
  status: OrderStatus;
  created_at: string;
  profiles: { full_name: string | null; whatsapp_phone: string } | null;
  order_items: { product_name: string; quantity: number }[];
}

/** date: "YYYY-MM-DD" (jour Cotonou) — le +01:00 explicite dans les bornes ISO évite de recalculer le fuseau côté client. */
export function DayDetailModal({ date, onClose }: { date: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<DayOrder[]>([]);

  useEffect(() => {
    const supabase = createClient();
    const start = `${date}T00:00:00.000+01:00`;
    const end = new Date(new Date(start).getTime() + 24 * 60 * 60 * 1000).toISOString();

    supabase
      .from("orders")
      .select("id, order_number, total, status, created_at, profiles(full_name, whatsapp_phone), order_items(product_name, quantity)")
      .gte("created_at", start)
      .lt("created_at", end)
      .neq("status", "annulee")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setOrders((data ?? []) as unknown as DayOrder[]);
        setLoading(false);
      });
  }, [date]);

  const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
  const dishCounts = new Map<string, number>();
  for (const o of orders) {
    for (const item of o.order_items) {
      dishCounts.set(item.product_name, (dishCounts.get(item.product_name) ?? 0) + item.quantity);
    }
  }
  const topDishes = [...dishCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const dateLabel = new Date(`${date}T12:00:00.000+01:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Porto-Novo",
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-ink text-lg capitalize">{dateLabel}</h3>
          <button onClick={onClose} className="text-[#9a8b78]">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-[#9a8b78]">Chargement…</div>
        ) : (
          <>
            <div className="flex gap-3 mb-4">
              <div className="flex-1 bg-[#faf4e8] rounded-xl p-3.5">
                <div className="font-mega text-xl text-maroon-deep">{orders.length}</div>
                <div className="text-[11px] text-[#9a8b78]">commandes</div>
              </div>
              <div className="flex-1 bg-[#faf4e8] rounded-xl p-3.5">
                <div className="font-mega text-lg text-maroon-deep">{formatFcfa(totalRevenue)}</div>
                <div className="text-[11px] text-[#9a8b78]">revenus</div>
              </div>
            </div>

            {topDishes.length > 0 && (
              <>
                <div className="font-bold text-[13px] text-ink mb-2">Plats vendus</div>
                <div className="flex flex-col gap-1.5 mb-4">
                  {topDishes.map(([name, qty]) => (
                    <div key={name} className="flex justify-between text-[13px] text-[#6d6358]">
                      <span>{name}</span>
                      <b className="text-maroon-deep">{qty}</b>
                    </div>
                  ))}
                </div>
                <div className="h-px bg-[#efe6d3] mb-4" />
              </>
            )}

            <div className="font-bold text-[13px] text-ink mb-2">Commandes</div>
            <div className="flex flex-col gap-1">
              {orders.map((o) => (
                <Link
                  key={o.id}
                  href={`/admin/orders/${o.id}`}
                  className="flex items-center justify-between py-2.5 border-b border-[#f3ecdd] last:border-b-0 text-sm"
                >
                  <div>
                    <span className="font-mega text-maroon-deep">{o.order_number}</span>
                    <span className="text-[#9a8b78] ml-2">{o.profiles?.full_name || o.profiles?.whatsapp_phone || "Client"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mega text-ink">{formatFcfa(o.total)}</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-status-green-bg text-status-green-deep">
                      {STATUS_LABELS[o.status]}
                    </span>
                  </div>
                </Link>
              ))}
              {orders.length === 0 && <div className="text-center text-[#9a8b78] text-sm py-6">Aucune commande ce jour-là.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
