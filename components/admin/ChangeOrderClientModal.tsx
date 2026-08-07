"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { showToast } from "@/components/shared/Toast";

interface ProfileOption {
  id: string;
  full_name: string | null;
  whatsapp_phone: string;
}

export function ChangeOrderClientModal({
  orderId,
  currentName,
  currentPhone,
  onClose,
  onChanged,
}: {
  orderId: string;
  currentName: string;
  currentPhone: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedId, setSelectedId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("id, full_name, whatsapp_phone")
      .order("full_name")
      .then(({ data }) => setProfiles(data ?? []));
  }, []);

  const filtered = search
    ? profiles.filter(
        (p) => (p.full_name ?? "").toLowerCase().includes(search.toLowerCase()) || p.whatsapp_phone.includes(search)
      )
    : profiles;

  async function handleApply() {
    setError(null);
    setBusy(true);
    try {
      let targetProfileId = selectedId;

      if (mode === "new") {
        const res = await fetch("/api/admin/clients/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName, phone: newPhone }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (body.existingClient) {
            // Numéro déjà connu — on rattache directement à ce profil plutôt que d'échouer.
            targetProfileId = body.existingClient.id;
          } else {
            throw new Error(body.error ?? "Échec de la création du client");
          }
        } else {
          targetProfileId = body.clientId;
        }
      }

      if (!targetProfileId) {
        setError("Choisis un client existant ou renseigne les infos du nouveau client.");
        setBusy(false);
        return;
      }

      const supabase = createClient();
      const { error: updateError } = await supabase.from("orders").update({ profile_id: targetProfileId }).eq("id", orderId);
      if (updateError) throw new Error(updateError.message);

      showToast("Client de la commande mis à jour");
      onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Échec de la mise à jour";
      setError(message);
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-ink text-lg">Changer le client</h3>
          <button onClick={onClose} className="text-[#9a8b78]">
            <X size={20} />
          </button>
        </div>

        <div className="text-[13px] text-[#9a8b78] mb-4">
          Actuellement : <b className="text-ink">{currentName}</b> ({currentPhone})
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode("existing")}
            className={`flex-1 py-2 rounded-xl font-bold text-sm ${mode === "existing" ? "bg-maroon text-gold" : "border-2 border-[#e6dcc4] text-[#6d6358]"}`}
          >
            Client existant
          </button>
          <button
            onClick={() => setMode("new")}
            className={`flex-1 py-2 rounded-xl font-bold text-sm ${mode === "new" ? "bg-maroon text-gold" : "border-2 border-[#e6dcc4] text-[#6d6358]"}`}
          >
            Nouveau client
          </button>
        </div>

        {mode === "existing" ? (
          <div className="flex flex-col gap-2 mb-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom ou numéro…"
              className="border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
            />
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm">
              <option value="">Choisir un client…</option>
              {filtered.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.whatsapp_phone} ({p.whatsapp_phone})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex flex-col gap-2 mb-4">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nom du client"
              className="border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
            />
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="Numéro WhatsApp (ex : 90000000)"
              className="border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm"
            />
          </div>
        )}

        {error && <div className="text-sm text-chilli bg-[rgba(231,50,35,.08)] rounded-xl px-3.5 py-2.5 mb-3">{error}</div>}

        <button
          onClick={handleApply}
          disabled={busy || (mode === "existing" ? !selectedId : !newName.trim() || !newPhone.trim())}
          className="w-full bg-maroon text-gold font-bold text-sm rounded-xl px-3.5 py-3 disabled:opacity-50"
        >
          {busy ? "Mise à jour…" : "Confirmer"}
        </button>
      </div>
    </div>
  );
}
