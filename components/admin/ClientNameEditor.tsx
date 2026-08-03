"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ClientNameEditor({ clientId, name }: { clientId: string; name: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      setEditing(false);
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ full_name: trimmed }).eq("id", clientId);
    setBusy(false);
    if (error) {
      alert("Échec de l'enregistrement : " + error.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-center gap-2 mt-3.5">
        <div className="font-bold text-lg text-ink">{name}</div>
        <button
          onClick={() => {
            setValue(name);
            setEditing(true);
          }}
          className="text-[11px] font-semibold text-maroon underline"
        >
          Modifier
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 mt-3.5">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="border-2 border-[#e6dcc4] rounded-xl px-3 py-2 text-sm text-center w-full"
        autoFocus
      />
      <div className="flex gap-2 w-full">
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
          Enregistrer
        </button>
      </div>
    </div>
  );
}
