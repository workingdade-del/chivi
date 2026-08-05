"use client";

import { useMemo, useState } from "react";
import { X, Trash2, ArrowRightLeft, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatFcfa } from "@/lib/format";
import { showToast } from "@/components/shared/Toast";
import type { FinanceAccountDetail, FinanceTransactionRow } from "@/lib/finance";

const SOURCE_LABELS: Record<string, string> = { order: "Commande", expense: "Dépense", manual: "Manuel" };

interface AccountOption {
  id: string;
  name: string;
}

export function FinanceAccountDetailScreen({
  detail,
  otherAccounts,
}: {
  detail: FinanceAccountDetail;
  otherAccounts: AccountOption[];
}) {
  const router = useRouter();
  const [showNewTx, setShowNewTx] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "entree" | "sortie">("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const categories = useMemo(() => {
    const set = new Set<string>();
    detail.transactions.forEach((t) => t.category && set.add(t.category));
    return Array.from(set);
  }, [detail.transactions]);

  const filtered = detail.transactions.filter((t) => {
    if (filterType !== "all" && t.type !== filterType) return false;
    if (filterCategory !== "all" && t.category !== filterCategory) return false;
    if (filterFrom && t.date < filterFrom) return false;
    if (filterTo && t.date > filterTo) return false;
    return true;
  });

  async function handleDelete(tx: FinanceTransactionRow) {
    if (tx.source_type !== "manual") return;
    if (!confirm("Supprimer cette transaction ?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("finance_transactions").delete().eq("id", tx.id);
    if (error) {
      showToast(`Échec de la suppression : ${error.message}`, "error");
      return;
    }
    showToast("Transaction supprimée");
    router.refresh();
  }

  if (!detail.account) return <div className="text-sm text-[#9a8b78]">Compte introuvable.</div>;

  return (
    <div>
      <div className="bg-white border border-[#ece2cd] rounded-2xl p-5 mb-4 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs text-[#9a8b78] uppercase tracking-wide">{detail.account.name}</div>
          <div className={`font-mega text-3xl mt-1.5 ${detail.balance >= 0 ? "text-maroon-deep" : "text-chilli"}`}>
            {formatFcfa(detail.balance)}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTransfer(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-[#e6dcc4] text-[#6d6358] font-bold text-sm"
          >
            <ArrowRightLeft size={15} /> Transférer
          </button>
          <button
            onClick={() => setShowNewTx(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-maroon text-gold font-bold text-sm"
          >
            <Plus size={15} /> Nouvelle transaction
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value as typeof filterType)} className="border-2 border-[#e6dcc4] rounded-xl px-3 py-2 text-[13px]">
          <option value="all">Tous types</option>
          <option value="entree">Entrées</option>
          <option value="sortie">Sorties</option>
        </select>
        {categories.length > 0 && (
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="border-2 border-[#e6dcc4] rounded-xl px-3 py-2 text-[13px]">
            <option value="all">Toutes catégories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="border-2 border-[#e6dcc4] rounded-xl px-3 py-2 text-[13px]" />
        <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="border-2 border-[#e6dcc4] rounded-xl px-3 py-2 text-[13px]" />
      </div>

      <div className="bg-white border border-[#ece2cd] rounded-2xl overflow-hidden">
        <div
          className="grid gap-3 px-5 py-3.5 bg-[#faf4e8] border-b border-[#efe6d3] text-[11px] tracking-wide uppercase text-[#9a8b78] font-semibold"
          style={{ gridTemplateColumns: "100px 1.4fr 1fr 1fr 90px 40px" }}
        >
          <span>Date</span>
          <span>Description</span>
          <span>Catégorie</span>
          <span>Source</span>
          <span>Montant</span>
          <span />
        </div>
        {filtered.map((t) => (
          <div key={t.id} className="grid gap-3 px-5 py-3.5 border-b border-[#f3ecdd] items-center text-sm last:border-b-0" style={{ gridTemplateColumns: "100px 1.4fr 1fr 1fr 90px 40px" }}>
            <span className="text-[13px] text-[#6d6358]">{new Date(t.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
            <span className="text-ink">{t.description || "—"}</span>
            <span className="text-[13px] text-[#6d6358]">{t.category || "—"}</span>
            <span className="text-[13px] text-[#9a8b78]">{SOURCE_LABELS[t.source_type]}</span>
            <span className={`font-mega ${t.type === "entree" ? "text-status-green-deep" : "text-chilli"}`}>
              {t.type === "entree" ? "+" : "−"}
              {formatFcfa(t.amount)}
            </span>
            {t.source_type === "manual" ? (
              <button onClick={() => handleDelete(t)} aria-label="Supprimer" className="text-[#c9bda6]">
                <Trash2 size={15} />
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
        {filtered.length === 0 && <div className="px-5 py-10 text-center text-[#9a8b78] text-sm">Aucune transaction.</div>}
      </div>

      {showNewTx && (
        <NewTransactionModal
          accountId={detail.account.id}
          onClose={() => setShowNewTx(false)}
          onCreated={() => {
            setShowNewTx(false);
            router.refresh();
          }}
        />
      )}
      {showTransfer && (
        <TransferModal
          fromAccountId={detail.account.id}
          otherAccounts={otherAccounts}
          onClose={() => setShowTransfer(false)}
          onCreated={() => {
            setShowTransfer(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function NewTransactionModal({ accountId, onClose, onCreated }: { accountId: string; onClose: () => void; onCreated: () => void }) {
  const [type, setType] = useState<"entree" | "sortie">("sortie");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    const amt = Math.round(parseFloat(amount) || 0);
    if (amt <= 0) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("finance_transactions").insert({
      account_id: accountId,
      type,
      amount: amt,
      description: description.trim() || null,
      category: category.trim() || null,
      date,
      source_type: "manual",
    });
    setBusy(false);
    if (error) {
      showToast(`Échec de la création : ${error.message}`, "error");
      return;
    }
    showToast("Transaction enregistrée");
    onCreated();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-ink text-lg">Nouvelle transaction</h3>
          <button onClick={onClose} className="text-[#9a8b78]">
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setType("entree")}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm ${type === "entree" ? "bg-status-green-deep text-white" : "border-2 border-[#e6dcc4] text-[#6d6358]"}`}
          >
            Entrée
          </button>
          <button
            onClick={() => setType("sortie")}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm ${type === "sortie" ? "bg-chilli text-white" : "border-2 border-[#e6dcc4] text-[#6d6358]"}`}
          >
            Sortie
          </button>
        </div>

        <label className="block text-xs font-bold text-[#9a8b78] mb-1.5">Montant (FCFA)</label>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm mb-3" />

        <label className="block text-xs font-bold text-[#9a8b78] mb-1.5">Description</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm mb-3" />

        <label className="block text-xs font-bold text-[#9a8b78] mb-1.5">Catégorie (optionnel)</label>
        <input value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm mb-3" />

        <label className="block text-xs font-bold text-[#9a8b78] mb-1.5">Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm mb-4" />

        <button
          onClick={handleCreate}
          disabled={busy || !amount || Number(amount) <= 0}
          className="w-full bg-maroon text-gold font-bold text-sm rounded-xl px-3.5 py-3 disabled:opacity-50"
        >
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

function TransferModal({
  fromAccountId,
  otherAccounts,
  onClose,
  onCreated,
}: {
  fromAccountId: string;
  otherAccounts: AccountOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleTransfer() {
    const amt = Math.round(parseFloat(amount) || 0);
    if (amt <= 0 || !toAccountId) return;
    setBusy(true);
    const supabase = createClient();
    const toName = otherAccounts.find((a) => a.id === toAccountId)?.name ?? "compte";
    const date = new Date().toISOString().slice(0, 10);
    const note = description.trim();

    const { error: outErr } = await supabase.from("finance_transactions").insert({
      account_id: fromAccountId,
      type: "sortie",
      amount: amt,
      description: note || `Virement vers ${toName}`,
      date,
      source_type: "manual",
    });
    const { error: inErr } = outErr
      ? { error: outErr }
      : await supabase.from("finance_transactions").insert({
          account_id: toAccountId,
          type: "entree",
          amount: amt,
          description: note || "Virement reçu",
          date,
          source_type: "manual",
        });

    setBusy(false);
    if (outErr || inErr) {
      showToast(`Échec du virement : ${(outErr ?? inErr)?.message}`, "error");
      return;
    }
    showToast("Virement effectué");
    onCreated();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-ink text-lg">Transférer vers un autre compte</h3>
          <button onClick={onClose} className="text-[#9a8b78]">
            <X size={20} />
          </button>
        </div>

        <label className="block text-xs font-bold text-[#9a8b78] mb-1.5">Compte destination</label>
        <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm mb-3">
          <option value="">Choisir…</option>
          {otherAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <label className="block text-xs font-bold text-[#9a8b78] mb-1.5">Montant (FCFA)</label>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm mb-3" />

        <label className="block text-xs font-bold text-[#9a8b78] mb-1.5">Description (optionnel)</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border-2 border-[#e6dcc4] rounded-xl px-3.5 py-2.5 text-sm mb-4" />

        <button
          onClick={handleTransfer}
          disabled={busy || !amount || Number(amount) <= 0 || !toAccountId}
          className="w-full bg-maroon text-gold font-bold text-sm rounded-xl px-3.5 py-3 disabled:opacity-50"
        >
          {busy ? "Virement…" : "Confirmer le virement"}
        </button>
      </div>
    </div>
  );
}
