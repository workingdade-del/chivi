"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { formatFcfa } from "@/lib/format";
import type { OrderStatus } from "@/lib/supabase/types";
import { CLIENT_TIMELINE, STATUS_LABELS, clientTimelineIndex } from "@/lib/order-status";

const STATUS_SEQUENCE = CLIENT_TIMELINE;

interface OrderDetail {
  id: string;
  order_number: string;
  status: OrderStatus;
  total: number;
  order_items: { id: string; product_name: string; variant_name: string | null; quantity: number; line_total: number }[];
}

export default function ConfirmPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const fetchOrder = useCallback(async () => {
    const res = await fetch(`/api/orders/${params.id}`);
    if (res.ok) {
      const data = await res.json();
      setOrder(data.order);
    }
  }, [params.id]);

  useEffect(() => {
    fetchOrder();
    const interval = setInterval(fetchOrder, 5000);
    return () => clearInterval(interval);
  }, [fetchOrder]);

  async function advanceStatus() {
    setAdvancing(true);
    await fetch(`/api/orders/${params.id}/advance`, { method: "PATCH" });
    await fetchOrder();
    setAdvancing(false);
  }

  if (!order) {
    return <div className="p-10 text-center text-ink/60">Chargement de la commande…</div>;
  }

  const currentIndex = clientTimelineIndex(order.status);

  return (
    <div>
      <div className="bg-maroon px-5 pt-[46px] pb-[30px] text-center">
        <div className="w-[72px] h-[72px] mx-auto rounded-full bg-amber flex items-center justify-center text-maroon-deep">
          <Check size={38} strokeWidth={3} />
        </div>
        <div className="font-display text-gold text-2xl uppercase mt-4">Commande reçue !</div>
        <div className="text-cream text-sm mt-1.5">
          Commande <b>{order.order_number}</b> · suivi en temps réel
        </div>
      </div>

      <div className="px-5 py-6">
        {STATUS_SEQUENCE.map((status, i) => {
          const reached = i <= currentIndex;
          const passed = i < currentIndex;
          return (
            <div key={status} className="flex gap-3.5">
              <div className="flex flex-col items-center">
                <div
                  className={`w-[34px] h-[34px] rounded-full border-2 flex items-center justify-center font-bold text-[13px] ${
                    reached ? "bg-amber border-amber text-maroon-deep" : "bg-white border-[#e2d6bd] text-[#b9ad9c]"
                  }`}
                >
                  {i + 1}
                </div>
                {i < STATUS_SEQUENCE.length - 1 && (
                  <div className={`w-0.5 flex-1 min-h-[26px] ${passed ? "bg-amber" : "bg-[#eadfca]"}`} />
                )}
              </div>
              <div className="pb-5">
                <div className={`font-bold text-[15px] ${reached ? "text-ink" : "text-[#b0a596]"}`}>
                  {STATUS_LABELS[status]}
                </div>
                <div className="text-[12.5px] text-[#9a8f82] mt-0.5">
                  {passed ? "Terminé" : i === currentIndex ? "En cours…" : "À venir"}
                </div>
              </div>
            </div>
          );
        })}

        <div className="bg-white rounded-2xl p-[15px] mt-1">
          <div className="text-xs text-[#9a8f82] tracking-[.04em] uppercase">Récapitulatif</div>
          <div className="mt-2.5 flex flex-col gap-1.5">
            {order.order_items.map((item) => (
              <div key={item.id} className="flex justify-between text-[13.5px] text-[#6d6358]">
                <span>
                  {item.quantity}× {item.product_name}
                  {item.variant_name ? ` (${item.variant_name})` : ""}
                </span>
                <span>{formatFcfa(item.line_total)}</span>
              </div>
            ))}
          </div>
          <div className="h-px bg-[#efe6d3] my-2.5" />
          <div className="flex justify-between items-center">
            <span className="font-bold text-ink">Total</span>
            <span className="font-mega text-[19px] text-maroon-deep">{formatFcfa(order.total)}</span>
          </div>
        </div>

        {order.status !== "livree" && (
          <button
            onClick={advanceStatus}
            disabled={advancing}
            className="w-full mt-4 py-3.5 rounded-2xl border-2 border-amber bg-transparent text-maroon font-bold disabled:opacity-50"
          >
            Simuler l&apos;étape suivante ▸
          </button>
        )}
        <button
          onClick={() => router.push("/client/menu")}
          className="w-full mt-2.5 py-3.5 rounded-2xl bg-maroon text-gold font-bold"
        >
          Nouvelle commande
        </button>
      </div>
    </div>
  );
}
