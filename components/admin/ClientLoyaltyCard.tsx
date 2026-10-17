"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { showToast } from "@/components/shared/Toast";

interface LoyaltyRow {
  id: string;
  order_id: string | null;
  points: number;
  type: "gain" | "ajustement" | "annulation";
  note: string | null;
  created_at: string;
}

const TYPE_LABELS: Record<LoyaltyRow["type"], string> = { gain: "Gain", ajustement: "Ajustement", annulation: "Annulation" };

export function ClientLoyaltyCard({ clientId, balance, transactions }: { clientId: string; balance: number; transactions: LoyaltyRow[] }) {
  const router = useRouter();
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const value = Math.trunc(Number(points));
  const canSubmit = !busy && Number.isFinite(value) && value !== 0 && note.trim().length > 0;

  async function handleAdjust() {
    if (!canSubmit) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("loyalty_transactions")
      .insert({ profile_id: clientId, points: value, type: "ajustement", note: note.trim() });
    setBusy(false);
    if (error) {
      showToast(`Échec de l'ajustement : ${error.message}`, "error");
      return;
    }
    showToast("Points ajustés");
    setPoints("");
    setNote("");
    router.refresh();
  }

  return (
    <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
      <div className="flex items-end justify-between mb-3.5">
        <div className="font-bold text-[15px] text-ink">Points de fidélité</div>
        <div className="font-mega text-2xl text-maroon-deep">{balance} pts</div>
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        <input
          type="number"
          step="1"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          placeholder="+/− points"
          className="w-28 border-2 border-[#e6dcc4] rounded-xl px-3 py-2 text-sm"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Motif (obligatoire)"
          className="flex-1 min-w-[160px] border-2 border-[#e6dcc4] rounded-xl px-3 py-2 text-sm"
        />
        <button
          onClick={handleAdjust}
          disabled={!canSubmit}
          className="bg-maroon text-gold font-bold text-sm rounded-xl px-4 py-2 disabled:opacity-50"
        >
          {busy ? "…" : "Ajuster"}
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto">
        {transactions.map((t) => (
          <div key={t.id} className="flex items-center justify-between py-2.5 border-b border-[#f3ecdd] last:border-b-0 text-[13px] gap-3">
            <div className="min-w-0">
              <div className="text-ink truncate">{t.note || TYPE_LABELS[t.type]}</div>
              <div className="text-[11px] text-[#9a8b78]">
                {TYPE_LABELS[t.type]} · {new Date(t.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
              </div>
            </div>
            <b className={t.points >= 0 ? "text-status-green-deep" : "text-chilli"}>
              {t.points > 0 ? "+" : ""}
              {t.points}
            </b>
          </div>
        ))}
        {transactions.length === 0 && <div className="text-center text-[#9a8b78] text-sm py-4">Aucun point pour le moment.</div>}
      </div>
    </div>
  );
}
