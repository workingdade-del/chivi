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

export function ClientPhoneEditor({ clientId, phone }: { clientId: string; phone: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(phone);
  const [busy, setBusy] = useState(false);
  const [existingClient, setExistingClient] = useState<ExistingClient | null>(null);

  function startEditing() {
    setValue(phone);
    setExistingClient(null);
    setEditing(true);
  }

  async function handleSave() {
    const normalized = value.replace(/\D/g, "");
    const candidate = normalized.length === 8 ? `229${normalized}` : normalized;
    if (!candidate || candidate === phone) {
      setEditing(false);
      return;
    }

    setExistingClient(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: value }),
      });
      const resBody = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (resBody.existingClient) {
          setExistingClient(resBody.existingClient);
        } else {
          showToast(resBody.error ?? "Échec de l'enregistrement", "error");
        }
        return;
      }

      showToast("Numéro mis à jour");
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex justify-between items-center text-[13px]">
        <span className="text-[#9a8b78]">WhatsApp</span>
        <div className="flex items-center gap-2">
          <b className="text-ink">{phone}</b>
          <button onClick={startEditing} className="text-[11px] font-semibold text-maroon underline">
            Modifier
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] text-[#9a8b78]">WhatsApp</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ex : 90000000 ou 229 90000000"
        className="border-2 border-[#e6dcc4] rounded-xl px-3 py-2 text-sm w-full"
        autoFocus
      />
      {existingClient && (
        <div className="bg-[#fff6e5] border-l-[3px] border-amber rounded-lg px-3 py-2 text-[12px] text-[#6d5a3c] leading-snug">
          Un client existe déjà avec ce numéro :{" "}
          <Link href={`/admin/clients/${existingClient.id}`} className="font-bold text-maroon underline">
            {existingClient.full_name || existingClient.whatsapp_phone}
          </Link>
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => setEditing(false)}
          disabled={busy}
          className="flex-1 py-2 rounded-xl border-2 border-[#e6dcc4] text-[#6d6358] font-bold text-xs"
        >
          Annuler
        </button>
        <button
          onClick={handleSave}
          disabled={busy || !value.trim()}
          className="flex-1 py-2 rounded-xl bg-maroon text-gold font-bold text-xs disabled:opacity-50"
        >
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
