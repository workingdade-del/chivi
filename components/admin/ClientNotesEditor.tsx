"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { showToast } from "@/components/shared/Toast";

export function ClientNotesEditor({ clientId, notes }: { clientId: string; notes: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(notes ?? "");
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ notes: value.trim() || null }).eq("id", clientId);
    setBusy(false);
    if (error) {
      showToast(`Échec de l'enregistrement : ${error.message}`, "error");
      return;
    }
    showToast("Notes enregistrées");
    router.refresh();
  }

  return (
    <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
      <div className="font-bold text-[15px] text-ink mb-3">Notes</div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        placeholder="Préférences, historique particulier, informations utiles…"
        className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm mb-3"
      />
      <button
        onClick={handleSave}
        disabled={busy || value === (notes ?? "")}
        className="bg-maroon text-gold font-bold text-sm rounded-xl px-4 py-2.5 disabled:opacity-50"
      >
        {busy ? "Enregistrement…" : "Enregistrer"}
      </button>
    </div>
  );
}
