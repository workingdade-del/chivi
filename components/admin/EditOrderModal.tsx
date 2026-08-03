"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { formatFcfa } from "@/lib/format";
import { OrderItemsEditor, type EditableOrderItem } from "@/components/admin/OrderItemsEditor";
import type { OrderDetailData } from "@/lib/admin";

export function EditOrderModal({
  order,
  onClose,
  onSaved,
}: {
  order: OrderDetailData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<EditableOrderItem[]>(
    order.order_items.map((item) => ({
      key: item.id,
      productId: item.product_id,
      productName: item.product_name,
      variantId: item.product_variant_id,
      variantName: item.variant_name,
      unitPrice: item.unit_price,
      quantity: item.quantity,
      supplementIds: item.order_supplements.map((s) => s.supplement_id).filter((id): id is string => !!id),
      supplementNames: item.order_supplements.map((s) => s.supplement_name),
      lineTotal: item.line_total,
    }))
  );
  const [deliveryAddress, setDeliveryAddress] = useState(order.delivery_address ?? "");
  const [overrideTotal, setOverrideTotal] = useState(false);
  const [manualTotal, setManualTotal] = useState(order.total);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const computedTotal = subtotal + order.delivery_fee;

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.productId,
            productVariantId: i.variantId,
            productName: i.productName,
            variantName: i.variantName,
            unitPrice: i.unitPrice,
            quantity: i.quantity,
            lineTotal: i.lineTotal,
            supplements: i.supplementIds.map((id, idx) => ({ supplementId: id, supplementName: i.supplementNames[idx] })),
          })),
          deliveryAddress: deliveryAddress.trim() || null,
          totalOverride: overrideTotal ? manualTotal : null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Échec de l'enregistrement");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'enregistrement");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-ink text-lg">Modifier la commande {order.order_number}</h3>
          <button onClick={onClose} className="text-[#9a8b78]">
            <X size={20} />
          </button>
        </div>

        <label className="block text-xs font-bold text-[#9a8b78] mb-1.5">Articles</label>
        <OrderItemsEditor items={items} onChange={setItems} />

        <label className="block text-xs font-bold text-[#9a8b78] mb-1.5 mt-4">Adresse de livraison</label>
        <input
          value={deliveryAddress}
          onChange={(e) => setDeliveryAddress(e.target.value)}
          className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm mb-3"
        />

        <div className="flex justify-between text-sm text-[#6d6358] py-1">
          <span>Sous-total (auto)</span>
          <span>{formatFcfa(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm text-[#6d6358] py-1">
          <span>Livraison</span>
          <span>{formatFcfa(order.delivery_fee)}</span>
        </div>

        <label className="flex items-center gap-2.5 my-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={overrideTotal}
            onChange={(e) => {
              setOverrideTotal(e.target.checked);
              if (e.target.checked) setManualTotal(computedTotal);
            }}
            className="w-4 h-4"
          />
          <span className="text-sm text-ink">Forcer le total manuellement</span>
        </label>

        {overrideTotal ? (
          <input
            type="number"
            value={manualTotal}
            onChange={(e) => setManualTotal(Number(e.target.value))}
            className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm font-bold mb-3"
          />
        ) : (
          <div className="flex justify-between items-center pt-1 pb-3">
            <span className="font-bold text-ink">Total</span>
            <span className="font-mega text-lg text-maroon-deep">{formatFcfa(computedTotal)}</span>
          </div>
        )}

        {error && <div className="text-sm text-chilli bg-[rgba(231,50,35,.08)] rounded-xl px-3.5 py-2.5 mb-3">{error}</div>}

        <button
          onClick={handleSave}
          disabled={busy || items.length === 0}
          className="w-full bg-maroon text-gold font-bold text-sm rounded-xl px-3.5 py-3 disabled:opacity-50"
        >
          {busy ? "Enregistrement…" : "Enregistrer les modifications"}
        </button>
      </div>
    </div>
  );
}
