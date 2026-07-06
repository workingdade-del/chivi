"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatFcfa } from "@/lib/format";
import { CLIENT_TIMELINE, STATUS_LABELS, clientTimelineIndex } from "@/lib/order-status";
import type { OrderDetailData } from "@/lib/admin";

const PAYMENT_LABELS: Record<string, string> = {
  cash_livraison: "Cash à la livraison",
  momo_livraison: "Mobile Money à la livraison",
  momo_avance: "Mobile Money en avance",
};

interface Driver {
  id: string;
  name: string;
  phone: string;
  status: string;
}

export function OrderDetailScreen({ order, drivers }: { order: OrderDetailData; drivers: Driver[] }) {
  const router = useRouter();
  const [assigning, setAssigning] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState("");
  const [busy, setBusy] = useState(false);

  const assignment = order.order_assignments?.[0];
  const driver = assignment?.drivers ?? null;
  const timelineIndex = clientTimelineIndex(order.status);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-order-detail:${order.id}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `id=eq.${order.id}` },
        () => router.refresh()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "order_assignments" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, () => router.refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  async function handleAssign() {
    if (!selectedDriver) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("order_assignments").insert({ order_id: order.id, driver_id: selectedDriver });
    await supabase.from("orders").update({ status: "en_route" }).eq("id", order.id);
    await supabase.from("drivers").update({ status: "en_course" }).eq("id", selectedDriver);
    setBusy(false);
    router.refresh();
  }

  async function handleMarkDelivered() {
    setBusy(true);
    const supabase = createClient();
    await supabase.from("orders").update({ status: "livree" }).eq("id", order.id);
    if (assignment) {
      await supabase
        .from("order_assignments")
        .update({ status: "livree", delivered_at: new Date().toISOString() })
        .eq("id", assignment.id);
    }
    if (driver) {
      await supabase.from("drivers").update({ status: "libre" }).eq("id", driver.id);
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
      <div className="bg-white border border-[#ece2cd] rounded-2xl p-[22px]">
        <div className="flex justify-between items-start">
          <div>
            <div className="font-mega text-3xl text-maroon-deep leading-none">{order.order_number}</div>
            <div className="text-[13px] text-[#9a8b78] mt-1.5">
              {new Date(order.created_at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} ·{" "}
              {PAYMENT_LABELS[order.payment_method]}
            </div>
          </div>
          <span className="text-[13px] font-bold px-3.5 py-1.5 rounded-full bg-[rgba(231,50,35,.14)] text-[#c0392b]">
            {STATUS_LABELS[order.status]}
          </span>
        </div>
        <div className="h-px bg-[#efe6d3] my-5" />
        <div className="flex flex-col gap-3.5">
          {order.order_items.map((item) => (
            <div key={item.id} className="flex gap-3.5 items-start">
              <span className="font-mega text-[19px] text-amber min-w-[1.6em]">{item.quantity}×</span>
              <div className="flex-1">
                <div className="font-semibold text-[15px] text-ink">{item.product_name}</div>
                <div className="text-[13px] text-[#9a8b78] mt-0.5">
                  {[item.variant_name, ...item.order_supplements.map((s) => s.supplement_name)].filter(Boolean).join(" · ")}
                </div>
              </div>
              <span className="font-mega text-[15px] text-maroon-deep">{formatFcfa(item.line_total)}</span>
            </div>
          ))}
        </div>
        {order.client_note && (
          <div className="bg-[#fff6e5] border-l-[3px] border-amber rounded-lg px-3.5 py-3 mt-4.5 text-[13.5px] text-[#6d5a3c] leading-snug">
            <b className="text-[#a6740a] uppercase text-[11px] tracking-wide">Note client</b>
            <br />
            {order.client_note}
          </div>
        )}
        <div className="h-px bg-[#efe6d3] my-4.5" />
        <Row label="Sous-total" value={formatFcfa(order.subtotal)} />
        <Row label="Livraison" value={formatFcfa(order.delivery_fee)} />
        <div className="flex justify-between items-center pt-1.5">
          <span className="font-bold text-ink">Total</span>
          <span className="font-mega text-[22px] text-maroon-deep">{formatFcfa(order.total)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="font-bold text-sm text-ink mb-3.5">Suivi</div>
          {CLIENT_TIMELINE.map((status, i) => {
            const done = i <= timelineIndex;
            return (
              <div key={status} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-[26px] h-[26px] rounded-full flex items-center justify-center text-xs font-bold ${
                      done ? "bg-amber text-maroon-deep" : "bg-[#f3ecdd] text-[#b9ad9c] border border-[#e2d6bd]"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </div>
                  {i < CLIENT_TIMELINE.length - 1 && <div className="w-0.5 flex-1 min-h-4 bg-[#efe6d3]" />}
                </div>
                <div className="pb-3.5">
                  <div className={`font-semibold text-[13.5px] ${done ? "text-ink" : "text-[#b0a596]"}`}>
                    {STATUS_LABELS[status]}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="font-bold text-sm text-ink mb-1.5">Livreur assigné</div>
          {driver && (
            <div className="flex items-center gap-2.5 mt-2">
              <div className="w-10 h-10 rounded-full bg-maroon text-gold flex items-center justify-center font-mega">
                {driver.name[0]}
              </div>
              <div>
                <div className="font-semibold text-ink">{driver.name}</div>
                <div className="text-xs text-[#9a8b78]">{driver.phone}</div>
              </div>
            </div>
          )}
          {!driver && order.status !== "recue" && order.status !== "en_preparation" && (
            <div className="mt-1.5">
              {!assigning ? (
                <>
                  <div className="text-[13px] text-[#9a8b78] mb-3">Aucun livreur sur cette course.</div>
                  <button
                    onClick={() => setAssigning(true)}
                    className="w-full py-3 rounded-xl bg-maroon text-gold font-bold text-sm"
                  >
                    Assigner un livreur
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <select
                    value={selectedDriver}
                    onChange={(e) => setSelectedDriver(e.target.value)}
                    className="border-2 border-[#e6dcc4] rounded-xl px-3 py-2.5 text-sm"
                  >
                    <option value="">Choisir un livreur…</option>
                    {drivers.filter((d) => d.status === "libre").map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAssign}
                    disabled={!selectedDriver || busy}
                    className="w-full py-3 rounded-xl bg-maroon text-gold font-bold text-sm disabled:opacity-50"
                  >
                    Confirmer
                  </button>
                </div>
              )}
            </div>
          )}
          {!driver && (order.status === "recue" || order.status === "en_preparation") && (
            <div className="text-[13px] text-[#9a8b78] mt-1.5">En cuisine — pas encore prête pour livraison.</div>
          )}
          {driver && order.status === "en_route" && (
            <button
              onClick={handleMarkDelivered}
              disabled={busy}
              className="w-full mt-4 py-3 rounded-xl bg-status-green text-white font-bold text-sm disabled:opacity-50"
            >
              Marquer livrée
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm text-[#6d6358] py-0.5">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
