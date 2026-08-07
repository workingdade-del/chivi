"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatFcfa } from "@/lib/format";
import { CLIENT_TIMELINE, STATUS_LABELS, STATUS_COLORS, clientTimelineIndex } from "@/lib/order-status";
import { CancelOrderModal } from "@/components/shared/CancelOrderModal";
import { EditOrderModal } from "@/components/admin/EditOrderModal";
import { DeleteOrderModal } from "@/components/admin/DeleteOrderModal";
import { ChangeOrderClientModal } from "@/components/admin/ChangeOrderClientModal";
import { showToast } from "@/components/shared/Toast";
import type { OrderDetailData } from "@/lib/admin";
import type { OrderStatus } from "@/lib/supabase/types";

const ALL_STATUSES: OrderStatus[] = ["recue", "en_preparation", "prete", "en_route", "livree", "annulee"];

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
  is_available: boolean;
}

export function OrderDetailScreen({ order, drivers }: { order: OrderDetailData; drivers: Driver[] }) {
  const router = useRouter();
  const [assigning, setAssigning] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showChangeClientModal, setShowChangeClientModal] = useState(false);

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
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: selectedDriver }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Échec de l'assignation");
      }
      setAssigning(false);
      setSelectedDriver("");
      showToast("Livreur assigné");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Échec de l'assignation", "error");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function handleMarkDelivered() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("orders").update({ status: "livree" }).eq("id", order.id);
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
    if (error) {
      showToast(`Échec : ${error.message}`, "error");
      return;
    }
    showToast("Commande marquée livrée");
    router.refresh();
  }

  async function handleStatusChange(newStatus: OrderStatus) {
    if (newStatus === order.status) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("orders").update({ status: newStatus }).eq("id", order.id);
    setBusy(false);
    if (error) {
      showToast(`Échec du changement de statut : ${error.message}`, "error");
      return;
    }
    showToast(`Statut changé : ${STATUS_LABELS[newStatus]}`);
    router.refresh();
  }

  async function handleRelaunch() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/relaunch`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Échec de la relance");
      }
      showToast("Commande relancée");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Échec de la relance", "error");
    } finally {
      setBusy(false);
      router.refresh();
    }
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
          <div className="flex items-center gap-2.5">
            <span className={`text-[13px] font-bold px-3.5 py-1.5 rounded-full ${STATUS_COLORS[order.status]}`}>
              {STATUS_LABELS[order.status]}
            </span>
            <button
              onClick={() => setShowEditModal(true)}
              className="text-[13px] font-bold px-3.5 py-1.5 rounded-full border-2 border-[#e6dcc4] text-[#6d6358]"
            >
              Modifier
            </button>
          </div>
        </div>
        {order.delivery_address && (
          <div className="text-[13px] text-[#6d6358] mt-2">📍 {order.delivery_address}</div>
        )}
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
          <div className="flex items-center justify-between mb-1.5">
            <div className="font-bold text-sm text-ink">Client</div>
            <button onClick={() => setShowChangeClientModal(true)} className="text-[12px] font-semibold text-maroon underline">
              Changer
            </button>
          </div>
          <div className="text-sm text-ink font-semibold">{order.profiles?.full_name || "Client"}</div>
          <div className="text-xs text-[#9a8b78]">{order.profiles?.whatsapp_phone ?? "—"}</div>
        </div>

        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="font-bold text-sm text-ink mb-3">Changer le statut</div>
          <select
            value={order.status}
            onChange={(e) => handleStatusChange(e.target.value as OrderStatus)}
            disabled={busy}
            className="w-full border-2 border-[#e6dcc4] rounded-xl px-3 py-2.5 text-sm font-semibold"
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

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
          {!driver && order.status !== "livree" && order.status !== "annulee" && (
            <div className="text-[13px] text-[#9a8b78] mb-3 mt-1.5">Aucun livreur sur cette course.</div>
          )}

          {order.status !== "livree" && order.status !== "annulee" && (
            <div className="mt-2">
              {!assigning ? (
                <button
                  onClick={() => setAssigning(true)}
                  className="w-full py-3 rounded-xl bg-maroon text-gold font-bold text-sm"
                >
                  {driver ? "Changer de livreur" : "Assigner un livreur"}
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <select
                    value={selectedDriver}
                    onChange={(e) => setSelectedDriver(e.target.value)}
                    className="border-2 border-[#e6dcc4] rounded-xl px-3 py-2.5 text-sm"
                  >
                    <option value="">Choisir un livreur…</option>
                    {drivers
                      .filter((d) => d.id === driver?.id || (d.status === "libre" && d.is_available))
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                          {d.id === driver?.id ? " (actuel)" : ""}
                        </option>
                      ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAssigning(false)}
                      className="flex-1 py-3 rounded-xl border-2 border-[#e6dcc4] text-[#6d6358] font-bold text-sm"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleAssign}
                      disabled={!selectedDriver || selectedDriver === driver?.id || busy}
                      className="flex-1 py-3 rounded-xl bg-maroon text-gold font-bold text-sm disabled:opacity-50"
                    >
                      {busy ? "…" : "Confirmer"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {driver && order.status === "en_route" && (
            <button
              onClick={handleMarkDelivered}
              disabled={busy}
              className="w-full mt-4 py-3 rounded-xl bg-status-green text-white font-bold text-sm disabled:opacity-50"
            >
              {busy ? "Enregistrement…" : "Marquer livrée"}
            </button>
          )}
        </div>

        {order.status !== "livree" && order.status !== "annulee" && (
          <button
            onClick={() => setShowCancelModal(true)}
            disabled={busy}
            className="w-full py-3 rounded-xl border-2 border-chilli text-chilli font-bold text-sm disabled:opacity-50"
          >
            Annuler la commande
          </button>
        )}
        {order.status === "annulee" && (
          <button
            onClick={handleRelaunch}
            disabled={busy}
            className="w-full py-3 rounded-xl bg-maroon text-gold font-bold text-sm disabled:opacity-50"
          >
            {busy ? "Relance…" : "Relancer la commande"}
          </button>
        )}

        <button
          onClick={() => setShowDeleteModal(true)}
          disabled={busy}
          className="w-full py-3 rounded-xl border-2 border-chilli text-chilli font-bold text-sm disabled:opacity-50"
        >
          Supprimer définitivement
        </button>
      </div>

      {showCancelModal && (
        <CancelOrderModal
          orderId={order.id}
          orderNumber={order.order_number}
          onClose={() => setShowCancelModal(false)}
          onCancelled={() => {
            setShowCancelModal(false);
            router.refresh();
          }}
        />
      )}

      {showEditModal && (
        <EditOrderModal
          order={order}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false);
            router.refresh();
          }}
        />
      )}

      {showChangeClientModal && (
        <ChangeOrderClientModal
          orderId={order.id}
          currentName={order.profiles?.full_name || "Client"}
          currentPhone={order.profiles?.whatsapp_phone ?? "—"}
          onClose={() => setShowChangeClientModal(false)}
          onChanged={() => {
            setShowChangeClientModal(false);
            router.refresh();
          }}
        />
      )}

      {showDeleteModal && (
        <DeleteOrderModal
          orderId={order.id}
          orderNumber={order.order_number}
          onClose={() => setShowDeleteModal(false)}
          onDeleted={() => router.push("/admin/orders")}
        />
      )}
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
