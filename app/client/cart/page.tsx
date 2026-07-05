"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { useCartStore, cartSubtotal, lineTotal } from "@/lib/store/cart";
import { formatFcfa } from "@/lib/format";

export default function CartPage() {
  const router = useRouter();
  const { cart, incLine, decLine, deliveryZone } = useCartStore();

  const subtotal = cartSubtotal(cart);
  const deliveryFee = deliveryZone?.fee ?? 500;
  const total = subtotal + deliveryFee;

  return (
    <div>
      <div className="sticky top-0 z-10 bg-maroon px-5 pt-[38px] pb-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-white/[.14] text-white flex items-center justify-center"
        >
          <ArrowLeft size={19} strokeWidth={2.4} />
        </button>
        <div className="font-display text-gold text-[22px] tracking-[.03em] uppercase">Mon panier</div>
      </div>

      {cart.length === 0 && (
        <div className="px-[30px] py-20 text-center text-[#a9987f]">
          <div className="font-mega text-xl text-maroon">Panier vide</div>
          <div className="text-sm mt-2">Ajoute un plat depuis le menu.</div>
          <Link
            href="/client/menu"
            className="inline-block mt-5 px-[22px] py-[13px] rounded-full bg-amber text-maroon-deep font-bold"
          >
            Voir le menu
          </Link>
        </div>
      )}

      {cart.length > 0 && (
        <div>
          <div className="px-4 pt-3.5 pb-1.5 flex flex-col gap-2.5">
            {cart.map((line) => (
              <div key={line.key} className="bg-white rounded-[18px] p-[13px] flex gap-3 shadow-card">
                <div className="w-[66px] h-[66px] flex-none rounded-[13px] bg-[repeating-linear-gradient(135deg,#ece0c4_0_10px,#e4d5b3_10px_20px)]" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[15px] text-ink">{line.name}</div>
                  {line.detail && <div className="text-xs text-[#9a8f82] mt-0.5">{line.detail}</div>}
                  <div className="flex items-center justify-between mt-2.5">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => decLine(line.key)}
                        className="w-[30px] h-[30px] rounded-[9px] border-2 border-[#e2d6bd] bg-white text-maroon flex items-center justify-center"
                      >
                        <Minus size={14} strokeWidth={2.6} />
                      </button>
                      <span className="font-bold min-w-[16px] text-center">{line.qty}</span>
                      <button
                        onClick={() => incLine(line.key)}
                        className="w-[30px] h-[30px] rounded-[9px] bg-amber text-maroon-deep flex items-center justify-center"
                      >
                        <Plus size={14} strokeWidth={2.6} />
                      </button>
                    </div>
                    <span className="font-mega text-base text-maroon-deep">{formatFcfa(lineTotal(line))}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mx-4 mt-3 bg-white rounded-[18px] p-4">
            <div className="flex justify-between text-sm text-[#6d6358] py-1.5">
              <span>Sous-total</span>
              <span>{formatFcfa(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-[#6d6358] py-1.5">
              <span>Frais de livraison{!deliveryZone && " (estimation)"}</span>
              <span>{formatFcfa(deliveryFee)}</span>
            </div>
            <div className="h-px bg-[#efe6d3] my-2" />
            <div className="flex justify-between items-center py-0.5">
              <span className="font-bold text-ink">Total</span>
              <span className="font-mega text-[22px] text-maroon-deep">{formatFcfa(total)}</span>
            </div>
          </div>

          <div className="h-3.5" />
          <div className="sticky bottom-0 bg-gradient-to-t from-app-client via-app-client to-transparent px-4 pt-3 pb-[18px]">
            <button
              onClick={() => router.push("/client/location")}
              className="w-full py-[17px] rounded-[18px] bg-maroon text-gold font-bold text-base shadow-hard-maroon"
            >
              Commander →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
