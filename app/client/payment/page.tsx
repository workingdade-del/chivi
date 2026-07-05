"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Banknote } from "lucide-react";
import { useCartStore, cartSubtotal } from "@/lib/store/cart";
import { formatFcfa } from "@/lib/format";
import { buildWaMeOrderLink } from "@/lib/whatsapp";
import type { PaymentMethod } from "@/lib/supabase/types";

const PAYMENT_OPTIONS: { id: PaymentMethod; name: string; desc: string }[] = [
  { id: "cash_livraison", name: "Cash à la livraison", desc: "Tu paies en espèces au livreur." },
  { id: "momo_livraison", name: "Mobile Money à la livraison", desc: "MTN / Moov MoMo à la réception." },
  { id: "momo_avance", name: "Paiement en avance (MoMo)", desc: "Tu règles maintenant, livraison prioritaire." },
];

export default function PaymentPage() {
  const router = useRouter();
  const store = useCartStore();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = cartSubtotal(store.cart);
  const deliveryFee = store.deliveryZone?.fee ?? 500;
  const total = subtotal + deliveryFee;

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsappPhone: store.whatsappPhone,
          addressDetails: store.addressDetails,
          deliveryLat: store.deliveryLat,
          deliveryLng: store.deliveryLng,
          deliveryZoneId: store.deliveryZone?.id ?? null,
          paymentMethod: store.paymentMethod,
          lines: store.cart.map((l) => ({
            productId: l.productId,
            productVariantId: l.productVariantId,
            quantity: l.qty,
            supplementIds: l.supplements.map((s) => s.supplementId),
          })),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Échec de la commande");
      }

      const data = await res.json();
      const businessNumber = process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER;
      if (businessNumber) {
        const itemsSummary = store.cart.map((l) => `${l.qty}x ${l.name}`).join("\n");
        window.open(buildWaMeOrderLink(businessNumber, data.orderNumber, itemsSummary, data.total), "_blank");
      }

      store.clearCart();
      router.push(`/client/confirm/${data.orderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-10 bg-maroon px-5 pt-[38px] pb-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-white/[.14] text-white flex items-center justify-center"
        >
          <ArrowLeft size={19} strokeWidth={2.4} />
        </button>
        <div className="font-display text-gold text-xl uppercase">Paiement</div>
      </div>

      <div className="p-[18px] flex flex-col gap-3">
        {PAYMENT_OPTIONS.map((pm) => {
          const active = store.paymentMethod === pm.id;
          return (
            <button
              key={pm.id}
              onClick={() => store.setPaymentMethod(pm.id)}
              className={`flex items-center gap-3 p-4 rounded-[17px] border-2 text-left ${
                active ? "border-maroon bg-[#fff6e5]" : "border-[#eadfca] bg-white"
              }`}
            >
              <span
                className={`w-11 h-11 flex-none rounded-xl flex items-center justify-center ${
                  active ? "bg-maroon text-gold" : "bg-[#f4ead2] text-[#b0a596]"
                }`}
              >
                <Banknote size={22} strokeWidth={2} />
              </span>
              <span className="flex-1">
                <span className="block font-bold text-[15px] text-ink">{pm.name}</span>
                <span className="block text-[12.5px] text-[#8a7f74] mt-0.5">{pm.desc}</span>
              </span>
              <span
                className={`w-[22px] h-[22px] flex-none rounded-full border-2 ${
                  active ? "border-maroon bg-maroon" : "border-[#eadfca] bg-transparent"
                }`}
              />
            </button>
          );
        })}

        <div className="mt-1.5 bg-white rounded-2xl px-4 py-3.5 flex justify-between items-center">
          <span className="font-bold text-ink">Total à payer</span>
          <span className="font-mega text-[22px] text-maroon-deep">{formatFcfa(total)}</span>
        </div>

        {error && <div className="text-sm text-chilli text-center">{error}</div>}

        <button
          onClick={handleConfirm}
          disabled={submitting || store.cart.length === 0}
          className="w-full mt-1.5 py-[17px] rounded-[18px] bg-whatsapp text-[#053d1c] font-bold text-base flex items-center justify-center gap-2.5 disabled:opacity-50"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.3A10 10 0 1 0 12 2z" />
          </svg>
          {submitting ? "Envoi en cours…" : "Confirmer sur WhatsApp"}
        </button>
      </div>
    </div>
  );
}
