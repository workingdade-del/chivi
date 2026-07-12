"use client";

import { useState } from "react";
import { X } from "lucide-react";

export function CancelOrderModal({
  orderId,
  orderNumber,
  onClose,
  onCancelled,
}: {
  orderId: string;
  orderNumber: string;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [reason, setReason] = useState("");
  const [notifyClient, setNotifyClient] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined, notifyClient }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Échec de l'annulation");
      onCancelled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'annulation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-ink text-lg">Annuler la commande {orderNumber}</h3>
          <button onClick={onClose} className="text-[#9a8b78]">
            <X size={20} />
          </button>
        </div>

        <label className="block text-xs font-bold text-[#9a8b78] mb-1.5">Raison (optionnel)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Ex : erreur de saisie, rupture de stock…"
          className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm mb-3"
        />

        <label className="flex items-center gap-2.5 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={notifyClient}
            onChange={(e) => setNotifyClient(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm text-ink">Notifier le client par WhatsApp</span>
        </label>

        {error && <div className="text-sm text-chilli bg-[rgba(231,50,35,.08)] rounded-xl px-3.5 py-2.5 mb-3">{error}</div>}

        <button
          onClick={handleConfirm}
          disabled={busy}
          className="w-full bg-chilli text-white font-bold text-sm rounded-xl px-3.5 py-3 disabled:opacity-50"
        >
          {busy ? "Annulation…" : "Confirmer l'annulation"}
        </button>
      </div>
    </div>
  );
}
