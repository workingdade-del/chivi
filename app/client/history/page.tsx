"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/lib/store/cart";
import { formatFcfa } from "@/lib/format";
import type { OrderStatus } from "@/lib/supabase/types";

interface HistoryOrder {
  id: string;
  order_number: string;
  status: OrderStatus;
  total: number;
  created_at: string;
  order_items: {
    id: string;
    product_id: string;
    product_variant_id: string | null;
    product_name: string;
    variant_name: string | null;
    quantity: number;
    unit_price: number;
  }[];
}

const STATUS_BADGE: Record<OrderStatus, { label: string; className: string }> = {
  recue: { label: "Reçue", className: "bg-[#FFF6E5] text-amber-bright" },
  en_preparation: { label: "En préparation", className: "bg-[#FBE8E6] text-chilli" },
  prete: { label: "Prête", className: "bg-[#FBE8E6] text-chilli" },
  en_route: { label: "En route", className: "bg-status-blue-bg text-status-blue" },
  livree: { label: "Livrée", className: "bg-status-green-bg text-status-green-deep" },
  annulee: { label: "Annulée", className: "bg-[#fbe8e6] text-[#c0392b]" },
};

export default function HistoryPage() {
  const router = useRouter();
  const { whatsappPhone, setPhone, addLine } = useCartStore();
  const [phoneInput, setPhoneInput] = useState(whatsappPhone);
  const [orders, setOrders] = useState<HistoryOrder[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (whatsappPhone) fetchHistory(whatsappPhone);
  }, [whatsappPhone]);

  async function fetchHistory(phone: string) {
    setLoading(true);
    const res = await fetch(`/api/orders?phone=${encodeURIComponent(phone)}`);
    if (res.ok) {
      const data = await res.json();
      setOrders(data.orders);
    }
    setLoading(false);
  }

  function handleLookup() {
    setPhone(phoneInput);
    fetchHistory(phoneInput);
  }

  function reorder(order: HistoryOrder) {
    for (const item of order.order_items) {
      addLine({
        productId: item.product_id,
        productVariantId: item.product_variant_id,
        name: item.product_name,
        variantName: item.variant_name,
        detail: item.variant_name ?? "",
        unitPrice: item.unit_price,
        qty: item.quantity,
        supplements: [],
      });
    }
    router.push("/client/cart");
  }

  return (
    <div>
      <div className="sticky top-0 z-10 bg-maroon px-5 pt-[38px] pb-4">
        <div className="font-display text-gold text-[22px] uppercase">Mes commandes</div>
      </div>

      {!whatsappPhone && (
        <div className="p-5 flex flex-col gap-3">
          <div className="text-sm text-ink/70">
            Entre ton numéro WhatsApp pour retrouver tes commandes.
          </div>
          <input
            type="tel"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="Ex : 22990123456"
            className="w-full box-border border-2 border-[#e6dcc4] rounded-2xl p-[13px] text-sm text-ink bg-white"
          />
          <button
            onClick={handleLookup}
            className="w-full py-3.5 rounded-2xl bg-maroon text-gold font-bold"
          >
            Voir mes commandes
          </button>
        </div>
      )}

      {whatsappPhone && (
        <div className="p-4 flex flex-col gap-2.5">
          {loading && <div className="text-center text-ink/60 text-sm py-6">Chargement…</div>}
          {!loading && orders?.length === 0 && (
            <div className="text-center text-ink/60 text-sm py-10">Aucune commande pour l&apos;instant.</div>
          )}
          {orders?.map((order) => {
            const badge = STATUS_BADGE[order.status];
            const itemsCount = order.order_items.reduce((n, i) => n + i.quantity, 0);
            return (
              <div key={order.id} className="bg-white rounded-2xl p-[15px] shadow-card">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-[15px] text-ink">{order.order_number}</div>
                    <div className="text-[12.5px] text-[#9a8f82] mt-0.5">
                      {new Date(order.created_at).toLocaleString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {itemsCount} article{itemsCount > 1 ? "s" : ""}
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold tracking-wide px-2.5 py-1 rounded-full ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2.5">
                  <span className="font-mega text-lg text-maroon-deep">{formatFcfa(order.total)}</span>
                  <button
                    onClick={() => reorder(order)}
                    className="text-sm font-semibold text-maroon"
                  >
                    Recommander ↻
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
