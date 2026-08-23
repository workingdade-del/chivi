"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/shared/Toast";

interface ClientCandidate {
  id: string;
  full_name: string | null;
  whatsapp_phone: string;
  notes: string | null;
  usual_address_text: string | null;
  usual_address_lat: number | null;
  usual_address_lng: number | null;
  usual_delivery_fee: number | null;
}

export function ClientMergeButton({ current }: { current: ClientCandidate }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientCandidate[]>([]);
  const [other, setOther] = useState<ClientCandidate | null>(null);
  const [nameChoice, setNameChoice] = useState<"current" | "other">("current");
  const [notesChoice, setNotesChoice] = useState<"current" | "other">("current");
  const [addressChoice, setAddressChoice] = useState<"current" | "other">("current");
  const [phoneChoice, setPhoneChoice] = useState<"current" | "other">("current");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || other || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      const res = await fetch(`/api/admin/clients/search?q=${encodeURIComponent(query)}&excludeId=${current.id}`);
      const body = await res.json().catch(() => ({ clients: [] }));
      setResults(body.clients ?? []);
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, open, other, current.id]);

  function reset() {
    setOpen(false);
    setQuery("");
    setResults([]);
    setOther(null);
    setNameChoice("current");
    setNotesChoice("current");
    setAddressChoice("current");
    setPhoneChoice("current");
  }

  async function handleConfirm() {
    if (!other) return;
    setBusy(true);
    try {
      const picked = nameChoice === "current" ? current : other;
      const notesPicked = notesChoice === "current" ? current : other;
      const addressPicked = addressChoice === "current" ? current : other;
      const phonePicked = phoneChoice === "current" ? current : other;

      const res = await fetch("/api/admin/clients/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keepId: current.id,
          mergeId: other.id,
          fullName: picked.full_name,
          notes: notesPicked.notes,
          usualAddressText: addressPicked.usual_address_text,
          usualAddressLat: addressPicked.usual_address_lat,
          usualAddressLng: addressPicked.usual_address_lng,
          usualDeliveryFee: addressPicked.usual_delivery_fee,
          whatsappPhone: phonePicked.whatsapp_phone,
        }),
      });
      const resBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(resBody.error ?? "Échec de la fusion", "error");
        return;
      }
      showToast("Profils fusionnés");
      reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11px] font-semibold text-maroon underline">
        Fusionner avec un autre profil
      </button>
    );
  }

  return (
    <div className="bg-white border border-[#ece2cd] rounded-2xl p-5 mt-3 text-left">
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-[15px] text-ink">Fusionner avec un autre profil</div>
        <button onClick={reset} className="text-[12px] text-[#9a8b78] underline">
          Annuler
        </button>
      </div>

      {!other && (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par nom ou numéro…"
            className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm mb-2"
            autoFocus
          />
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => setOther(c)}
              className="w-full text-left px-3.5 py-2.5 rounded-xl hover:bg-[#faf4e8] flex items-center justify-between text-sm"
            >
              <span className="font-semibold text-ink">{c.full_name || c.whatsapp_phone}</span>
              <span className="text-[12px] text-[#9a8b78]">{c.whatsapp_phone}</span>
            </button>
          ))}
          {query.trim().length >= 2 && results.length === 0 && (
            <div className="text-[13px] text-[#9a8b78] px-1 py-2">Aucun profil trouvé.</div>
          )}
        </>
      )}

      {other && (
        <div className="flex flex-col gap-3.5">
          <div className="text-[12.5px] text-[#6d6358]">
            Le profil <b>{other.full_name || other.whatsapp_phone}</b> sera supprimé ; ses commandes et messages seront rattachés à ce
            profil-ci.
          </div>

          <FieldChoice
            label="Nom"
            currentValue={current.full_name || "—"}
            otherValue={other.full_name || "—"}
            choice={nameChoice}
            onChoose={setNameChoice}
          />
          <FieldChoice
            label="Notes"
            currentValue={current.notes || "—"}
            otherValue={other.notes || "—"}
            choice={notesChoice}
            onChoose={setNotesChoice}
          />
          <FieldChoice
            label="Adresse habituelle"
            currentValue={current.usual_address_text || "—"}
            otherValue={other.usual_address_text || "—"}
            choice={addressChoice}
            onChoose={setAddressChoice}
          />
          <FieldChoice
            label="Numéro WhatsApp final"
            currentValue={current.whatsapp_phone}
            otherValue={other.whatsapp_phone}
            choice={phoneChoice}
            onChoose={setPhoneChoice}
          />

          <button
            onClick={handleConfirm}
            disabled={busy}
            className="self-start bg-maroon text-gold font-bold text-sm px-5 py-2.5 rounded-xl disabled:opacity-50"
          >
            {busy ? "Fusion…" : "Confirmer la fusion"}
          </button>
        </div>
      )}
    </div>
  );
}

function FieldChoice({
  label,
  currentValue,
  otherValue,
  choice,
  onChoose,
}: {
  label: string;
  currentValue: string;
  otherValue: string;
  choice: "current" | "other";
  onChoose: (v: "current" | "other") => void;
}) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#9a8b78] mb-1.5">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <label
          className={`border-2 rounded-xl px-3 py-2 text-[13px] cursor-pointer ${choice === "current" ? "border-maroon bg-[#faf4e8]" : "border-[#e6dcc4]"}`}
        >
          <input type="radio" checked={choice === "current"} onChange={() => onChoose("current")} className="mr-1.5" />
          {currentValue}
        </label>
        <label
          className={`border-2 rounded-xl px-3 py-2 text-[13px] cursor-pointer ${choice === "other" ? "border-maroon bg-[#faf4e8]" : "border-[#e6dcc4]"}`}
        >
          <input type="radio" checked={choice === "other"} onChange={() => onChoose("other")} className="mr-1.5" />
          {otherValue}
        </label>
      </div>
    </div>
  );
}
