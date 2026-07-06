"use client";

import { useRouter } from "next/navigation";
import { useCartStore, cartSubtotal, lineTotal } from "@/lib/store/cart";
import { formatFcfa } from "@/lib/format";

/** Panier fixe à droite — visible uniquement tablette/desktop (md:+). Complète (ne remplace pas) le flow mobile /client/cart. */
export function CartSidebar() {
  const router = useRouter();
  const { cart, deliveryZone } = useCartStore();

  const subtotal = cartSubtotal(cart);
  const deliveryFee = deliveryZone?.fee ?? 500;
  const total = subtotal + deliveryFee;

  return (
    <div className="hidden md:flex md:w-[320px] lg:w-[360px] flex-none flex-col border-l border-[#e6dcc4] bg-white">
      <div className="sticky top-0 flex flex-col h-screen">
        <div className="px-5 pt-6 pb-4 border-b border-[#efe6d3]">
          <div className="font-display text-maroon text-lg uppercase tracking-wide">Mon panier</div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
          {cart.length === 0 && (
            <div className="text-center text-[#a9987f] text-sm py-10">Ton panier est vide.</div>
          )}
          {cart.map((line) => (
            <div key={line.key} className="bg-[#faf4e8] rounded-2xl p-3 flex gap-2.5">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-ink">{line.name}</div>
                {line.detail && <div className="text-xs text-[#9a8f82] mt-0.5">{line.detail}</div>}
                <div className="flex justify-between items-center mt-1.5">
                  <span className="text-xs text-[#8a7f74]">Qté {line.qty}</span>
                  <span className="font-mega text-sm text-maroon-deep">{formatFcfa(lineTotal(line))}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-[#efe6d3] px-5 py-4">
            <div className="flex justify-between text-sm text-[#6d6358] py-1">
              <span>Sous-total</span>
              <span>{formatFcfa(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-[#6d6358] py-1">
              <span>Livraison{!deliveryZone && " (estimation)"}</span>
              <span>{formatFcfa(deliveryFee)}</span>
            </div>
            <div className="h-px bg-[#efe6d3] my-2" />
            <div className="flex justify-between items-center py-1">
              <span className="font-bold text-ink">Total</span>
              <span className="font-mega text-xl text-maroon-deep">{formatFcfa(total)}</span>
            </div>
            <button
              onClick={() => router.push("/client/location")}
              className="w-full mt-3 py-3.5 rounded-2xl bg-maroon text-gold font-bold text-sm shadow-hard-maroon"
            >
              Commander →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
