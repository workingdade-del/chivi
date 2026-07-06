"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, PlayCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface PauseState {
  isPaused: boolean;
  pauseReason: string | null;
}

export function PauseControl({ initial }: { initial: PauseState }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`system-settings-control:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "system_settings" },
        (payload) => {
          const row = payload.new as { is_paused: boolean; pause_reason: string | null };
          setState({ isPaused: row.is_paused, pauseReason: row.pause_reason });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function handleConfirmPause() {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/system/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Échec de la mise en pause");
      }
      setShowModal(false);
      setReason("");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Échec de la mise en pause");
    } finally {
      setBusy(false);
    }
  }

  async function handleResume() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/system/resume", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Échec du rétablissement");
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Échec du rétablissement");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {state.isPaused ? (
        <button
          onClick={handleResume}
          disabled={busy}
          className="flex items-center gap-2 bg-status-green text-white font-bold text-sm px-4 py-2.5 rounded-xl disabled:opacity-50"
        >
          <PlayCircle size={16} />
          {busy ? "Rétablissement…" : "Rétablir le système"}
        </button>
      ) : (
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-chilli text-white font-bold text-sm px-4 py-2.5 rounded-xl"
        >
          <AlertTriangle size={16} />
          Mettre en pause le système
        </button>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="font-display text-lg text-maroon uppercase mb-1.5">Mettre en pause le système</div>
            <p className="text-sm text-[#6d6358] mb-4">
              Les commandes et l&apos;IA WhatsApp seront désactivées jusqu&apos;au rétablissement. Indique la raison
              (visible par les clients).
            </p>
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex : Cuisine fermée, Rupture de stock, Maintenance…"
              rows={3}
              className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm resize-none"
            />
            <div className="flex justify-end gap-2.5 mt-4">
              <button
                onClick={() => {
                  setShowModal(false);
                  setReason("");
                }}
                className="text-sm font-semibold text-[#6d6358] px-4 py-2.5"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmPause}
                disabled={!reason.trim() || busy}
                className="bg-chilli text-white font-bold text-sm px-5 py-2.5 rounded-xl disabled:opacity-50"
              >
                {busy ? "Mise en pause…" : "Confirmer la pause"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
