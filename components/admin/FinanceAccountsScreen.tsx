"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatFcfa } from "@/lib/format";
import { showToast } from "@/components/shared/Toast";
import type { FinanceAccountRow } from "@/lib/finance";

const TYPE_LABELS: Record<string, string> = {
  ventes: "Ventes",
  dettes: "Dettes",
  personnalise: "Personnalisé",
};

export function FinanceAccountsScreen({ accounts }: { accounts: FinanceAccountRow[] }) {
  const router = useRouter();
  const [showNewAccount, setShowNewAccount] = useState(false);

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowNewAccount(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-bold bg-maroon text-gold"
        >
          <Plus size={15} /> Nouveau compte
        </button>
      </div>

      <div className="bg-white border border-[#ece2cd] rounded-2xl overflow-hidden">
        <div
          className="grid gap-3 px-5 py-3.5 bg-[#faf4e8] border-b border-[#efe6d3] text-[11px] tracking-wide uppercase text-[#9a8b78] font-semibold"
          style={{ gridTemplateColumns: "1.6fr 1fr 1fr 40px" }}
        >
          <span>Compte</span>
          <span>Type</span>
          <span>Solde</span>
          <span />
        </div>
        {accounts.map((a) => (
          <Link
            key={a.id}
            href={`/admin/finance/${a.id}`}
            className="grid gap-3 px-5 py-4 border-b border-[#f3ecdd] items-center text-sm"
            style={{ gridTemplateColumns: "1.6fr 1fr 1fr 40px" }}
          >
            <b className="font-semibold text-ink">{a.name}</b>
            <span className="text-[13px] text-[#6d6358]">{TYPE_LABELS[a.type] ?? a.type}</span>
            <span className={`font-mega text-[15px] ${a.balance >= 0 ? "text-maroon-deep" : "text-chilli"}`}>{formatFcfa(a.balance)}</span>
            <span className="text-[#c9bda6] text-right">›</span>
          </Link>
        ))}
        {accounts.length === 0 && <div className="px-5 py-10 text-center text-[#9a8b78] text-sm">Aucun compte.</div>}
      </div>

      {showNewAccount && (
        <NewAccountModal
          onClose={() => setShowNewAccount(false)}
          onCreated={() => {
            setShowNewAccount(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function NewAccountModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setBusy(true);
    const supabase = createClient();

    // DEBUG TEMPORAIRE — diagnostic 404 finance_accounts, à retirer une fois résolu.
    console.log("[FINANCE DEBUG] table ciblée :", "finance_accounts");
    console.log("[FINANCE DEBUG] NEXT_PUBLIC_SUPABASE_URL :", process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log("[FINANCE DEBUG] clé anon (10 premiers caractères) :", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 10));

    const { error, status, statusText } = await supabase.from("finance_accounts").insert({ name: name.trim(), type: "personnalise" });
    console.log("[FINANCE DEBUG] réponse — status:", status, "statusText:", statusText, "error:", JSON.stringify(error, null, 2));
    setBusy(false);
    if (error) {
      showToast(`Échec de la création : ${error.message}`, "error");
      return;
    }
    showToast("Compte créé");
    onCreated();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-ink text-lg">Nouveau compte</h3>
          <button onClick={onClose} className="text-[#9a8b78]">
            <X size={20} />
          </button>
        </div>
        <label className="block text-xs font-bold text-[#9a8b78] mb-1.5">Nom du compte</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Caisse Godomey"
          className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm mb-4"
        />
        <button
          onClick={handleCreate}
          disabled={busy || !name.trim()}
          className="w-full bg-maroon text-gold font-bold text-sm rounded-xl px-3.5 py-3 disabled:opacity-50"
        >
          {busy ? "Création…" : "Créer le compte"}
        </button>
      </div>
    </div>
  );
}
