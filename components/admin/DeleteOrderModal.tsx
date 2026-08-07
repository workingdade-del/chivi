"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { showToast } from "@/components/shared/Toast";

export function DeleteOrderModal({
  orderId,
  orderNumber,
  onClose,
  onDeleted,
}: {
  orderId: string;
  orderNumber: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText.trim() === orderNumber;

  async function handleDelete() {
    if (!canDelete) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/delete`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Échec de la suppression");
      showToast("Commande supprimée définitivement");
      onDeleted();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Échec de la suppression";
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
          <h3 className="font-bold text-chilli text-lg flex items-center gap-2">
            <AlertTriangle size={20} /> Supprimer {orderNumber}
          </h3>
          <button onClick={onClose} className="text-[#9a8b78]">
            <X size={20} />
          </button>
        </div>

        <div className="bg-[rgba(231,50,35,.08)] border-l-[3px] border-chilli rounded-lg px-3.5 py-3 text-[13.5px] text-[#6d5a3c] leading-snug mb-4">
          <b>Cette action est irréversible.</b> La commande et tout son historique (articles, suppléments, assignation
          livreur) seront supprimés définitivement — impossible à annuler ou récupérer, contrairement à
          l&apos;annulation classique.
        </div>

        <label className="block text-xs font-bold text-[#9a8b78] mb-1.5">
          Tape <b className="text-ink">{orderNumber}</b> pour confirmer
        </label>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm mb-3"
        />

        {error && <div className="text-sm text-chilli bg-[rgba(231,50,35,.08)] rounded-xl px-3.5 py-2.5 mb-3">{error}</div>}

        <button
          onClick={handleDelete}
          disabled={busy || !canDelete}
          className="w-full bg-chilli text-white font-bold text-sm rounded-xl px-3.5 py-3 disabled:opacity-50"
        >
          {busy ? "Suppression…" : "Supprimer définitivement"}
        </button>
      </div>
    </div>
  );
}
