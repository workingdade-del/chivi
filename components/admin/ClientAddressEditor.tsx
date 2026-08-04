"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { showToast } from "@/components/shared/Toast";

interface Props {
  clientId: string;
  usualAddressText: string | null;
  usualAddressLat: number | null;
  usualAddressLng: number | null;
  usualDeliveryFee: number | null;
}

export function ClientAddressEditor({ clientId, usualAddressText, usualAddressLat, usualAddressLng, usualDeliveryFee }: Props) {
  const router = useRouter();
  const [addressText, setAddressText] = useState(usualAddressText ?? "");
  const [lat, setLat] = useState(usualAddressLat != null ? String(usualAddressLat) : "");
  const [lng, setLng] = useState(usualAddressLng != null ? String(usualAddressLng) : "");
  const [fee, setFee] = useState(usualDeliveryFee != null ? String(usualDeliveryFee) : "");
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        usual_address_text: addressText.trim() || null,
        usual_address_lat: lat.trim() ? parseFloat(lat) : null,
        usual_address_lng: lng.trim() ? parseFloat(lng) : null,
        usual_delivery_fee: fee.trim() ? Math.round(parseFloat(fee)) : null,
      })
      .eq("id", clientId);
    setBusy(false);
    if (error) {
      showToast(`Échec de l'enregistrement : ${error.message}`, "error");
      return;
    }
    showToast("Adresse habituelle enregistrée");
    router.refresh();
  }

  return (
    <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
      <div className="font-bold text-[15px] text-ink mb-3.5">Adresse habituelle</div>
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#9a8b78] block mb-1.5">Adresse / zone</label>
          <input
            value={addressText}
            onChange={(e) => setAddressText(e.target.value)}
            placeholder="Ex : Godomey Nonhouenou, près du carrefour…"
            className="w-full border-2 border-[#e6dcc4] rounded-xl px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[#9a8b78] block mb-1.5">Latitude (optionnel)</label>
            <input
              type="number"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="w-full border-2 border-[#e6dcc4] rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[#9a8b78] block mb-1.5">Longitude (optionnel)</label>
            <input
              type="number"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="w-full border-2 border-[#e6dcc4] rounded-xl px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#9a8b78] block mb-1.5">Frais de livraison associé (FCFA)</label>
          <input
            type="number"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            className="w-full border-2 border-[#e6dcc4] rounded-xl px-3 py-2 text-sm"
          />
        </div>
        {(!lat.trim() || !lng.trim() || !fee.trim() || !addressText.trim()) && (
          <div className="text-[11.5px] text-[#9a8b78] leading-snug">
            Les 4 champs (adresse, latitude, longitude, tarif) sont nécessaires pour que le raccourci soit proposé au client sur WhatsApp.
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={busy}
          className="self-start bg-maroon text-gold font-bold text-sm px-5 py-2.5 rounded-xl disabled:opacity-50"
        >
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
