"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/shared/Toast";

interface ExistingClient {
  id: string;
  full_name: string | null;
  whatsapp_phone: string;
}

export function NewClientForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [addressText, setAddressText] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [fee, setFee] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingClient, setExistingClient] = useState<ExistingClient | null>(null);

  async function handleSubmit() {
    setError(null);
    setExistingClient(null);
    setBusy(true);

    try {
      const res = await fetch("/api/admin/clients/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          email: email.trim() || undefined,
          addressText: addressText.trim() || undefined,
          lat: lat.trim() ? parseFloat(lat) : undefined,
          lng: lng.trim() ? parseFloat(lng) : undefined,
          fee: fee.trim() ? Math.round(parseFloat(fee)) : undefined,
        }),
      });
      const resBody = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (resBody.existingClient) {
          setExistingClient(resBody.existingClient);
        } else {
          setError(resBody.error ?? "Échec de la création");
          showToast(resBody.error ?? "Échec de la création", "error");
        }
        return;
      }

      showToast("Client créé");
      router.push(`/admin/clients/${resBody.clientId}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-[#ece2cd] rounded-2xl p-6 max-w-lg flex flex-col gap-4">
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wide text-[#9a8b78] block mb-1.5">Nom</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom du client"
          className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
        />
      </div>

      <div>
        <label className="text-[11px] font-bold uppercase tracking-wide text-[#9a8b78] block mb-1.5">Numéro WhatsApp *</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Ex : 90000000 ou 229 90000000"
          className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
        />
      </div>

      <div>
        <label className="text-[11px] font-bold uppercase tracking-wide text-[#9a8b78] block mb-1.5">Email (optionnel)</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
        />
      </div>

      <div className="h-px bg-[#efe6d3]" />
      <div className="text-[13px] font-bold text-ink">Adresse habituelle (optionnel)</div>

      <div>
        <label className="text-[11px] font-bold uppercase tracking-wide text-[#9a8b78] block mb-1.5">Adresse / zone</label>
        <input
          value={addressText}
          onChange={(e) => setAddressText(e.target.value)}
          placeholder="Ex : Godomey Nonhouenou, près du carrefour…"
          className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#9a8b78] block mb-1.5">Latitude</label>
          <input
            type="number"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#9a8b78] block mb-1.5">Longitude</label>
          <input
            type="number"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-[11px] font-bold uppercase tracking-wide text-[#9a8b78] block mb-1.5">Frais de livraison associé (FCFA)</label>
        <input
          type="number"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
        />
      </div>

      {existingClient && (
        <div className="bg-[#fff6e5] border-l-[3px] border-amber rounded-lg px-3.5 py-3 text-[13.5px] text-[#6d5a3c] leading-snug">
          Un client existe déjà avec ce numéro :{" "}
          <Link href={`/admin/clients/${existingClient.id}`} className="font-bold text-maroon underline">
            {existingClient.full_name || existingClient.whatsapp_phone}
          </Link>
        </div>
      )}

      {error && <div className="text-sm text-chilli bg-[rgba(231,50,35,.08)] rounded-xl px-3.5 py-2.5">{error}</div>}

      <button
        onClick={handleSubmit}
        disabled={busy}
        className="self-start bg-maroon text-gold font-bold text-sm px-5 py-3 rounded-xl disabled:opacity-50"
      >
        {busy ? "Création…" : "Créer le client"}
      </button>
    </div>
  );
}
