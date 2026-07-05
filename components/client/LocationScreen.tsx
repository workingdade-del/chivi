"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { useCartStore } from "@/lib/store/cart";
import type { MenuDeliveryZone } from "@/lib/menu";
import { formatFcfa } from "@/lib/format";

function feeLabel(zone: MenuDeliveryZone): string {
  return zone.feeMin === zone.feeMax
    ? formatFcfa(zone.feeMin)
    : `${zone.feeMin.toLocaleString("fr-FR")}-${zone.feeMax.toLocaleString("fr-FR")} FCFA`;
}

function normalizePhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length <= 8 ? `229${digits}` : digits;
}

export function LocationScreen({ zones }: { zones: MenuDeliveryZone[] }) {
  const router = useRouter();
  const {
    whatsappPhone,
    setPhone,
    addressDetails,
    setAddressDetails,
    deliveryLat,
    setDeliveryPosition,
    deliveryZone,
    setDeliveryZone,
  } = useCartStore();

  function shareGps() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setDeliveryPosition(pos.coords.latitude, pos.coords.longitude),
      () => {}
    );
  }

  const canContinue = whatsappPhone.replace(/\D/g, "").length >= 8 && !!deliveryZone;

  return (
    <div>
      <div className="sticky top-0 z-10 bg-maroon px-5 pt-[38px] pb-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-white/[.14] text-white flex items-center justify-center"
        >
          <ArrowLeft size={19} strokeWidth={2.4} />
        </button>
        <div className="font-display text-gold text-xl uppercase">Où livrer ?</div>
      </div>

      <div className="h-[230px] relative flex items-center justify-center bg-[repeating-linear-gradient(135deg,#dfe6dc_0_16px,#d5ddd1_16px_32px)]">
        <span className="font-mono text-xs tracking-[.14em] uppercase text-[#8a9686]">carte — position</span>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full text-chilli">
          <MapPin size={40} fill="var(--chivi-chilli)" stroke="#fff" strokeWidth={1.5} />
        </div>
      </div>

      <div className="p-[18px] flex flex-col gap-3.5">
        <button
          onClick={shareGps}
          className="w-full py-[15px] rounded-2xl bg-amber text-maroon-deep font-bold text-[15px] flex items-center justify-center gap-2.5"
        >
          <MapPin size={18} strokeWidth={2.2} />
          {deliveryLat ? "Position GPS enregistrée ✓" : "Partager ma position GPS"}
        </button>

        <div>
          <div className="text-xs text-[#8a7f74] tracking-[.04em] uppercase mb-1.5">Ton numéro WhatsApp</div>
          <input
            type="tel"
            value={whatsappPhone}
            onChange={(e) => setPhone(normalizePhoneInput(e.target.value))}
            placeholder="Ex : 90 12 34 56"
            className="w-full box-border border-2 border-[#e6dcc4] rounded-2xl p-[13px] font-product text-sm text-ink bg-white"
          />
        </div>

        <div>
          <div className="text-xs text-[#8a7f74] tracking-[.04em] uppercase mb-1.5">
            Indication (repère, immeuble…)
          </div>
          <textarea
            value={addressDetails}
            onChange={(e) => setAddressDetails(e.target.value)}
            placeholder="Ex : Carré 245, maison bleue à côté de la pharmacie Saint-Michel, Fidjrossè."
            className="w-full box-border min-h-[88px] resize-none border-2 border-[#e6dcc4] rounded-2xl p-[13px] font-product text-sm text-ink bg-white"
          />
        </div>

        <div>
          <div className="text-xs text-[#8a7f74] tracking-[.04em] uppercase mb-1.5">Zone de livraison</div>
          <div className="flex flex-col gap-2">
            {zones.map((zone) => {
              const active = deliveryZone?.id === zone.id;
              return (
                <button
                  key={zone.id}
                  onClick={() => setDeliveryZone({ id: zone.id, name: zone.name, fee: zone.feeMin })}
                  className={`flex items-center justify-between px-4 py-3 rounded-2xl border-2 text-left ${
                    active ? "border-maroon bg-[#fff6e5]" : "border-[#e6dcc4] bg-white"
                  }`}
                >
                  <span className="font-semibold text-sm text-ink">{zone.name}</span>
                  <span className="font-mega text-sm text-maroon-deep">{feeLabel(zone)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 flex gap-2.5 items-center">
          <div className="w-11 h-11 flex-none rounded-xl bg-whatsapp flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff">
              <path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.7-.1-.4-.1-.9-.3-1.6-.6-2.8-1.2-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 .9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5.2.5.7 1.8.8 1.9.1.1.1.3 0 .5-.1.2-.2.4-.3.5l-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.6-.1.2-.2.7-.8.9-1.1.2-.3.3-.2.6-.1l1.7.8c.3.2.5.2.5.4.1.1.1.7-.1 1.2z" />
            </svg>
          </div>
          <div className="flex-1 text-[13px] text-[#6d6358] leading-snug">
            Tu confirmes ta commande et ta position sur <b className="text-ink">WhatsApp</b> — comme
            d&apos;habitude.
          </div>
        </div>

        <button
          onClick={() => router.push("/client/payment")}
          disabled={!canContinue}
          className="w-full py-[17px] rounded-[18px] bg-maroon text-gold font-bold text-base shadow-hard-maroon disabled:opacity-40"
        >
          Continuer vers le paiement
        </button>
      </div>
    </div>
  );
}
