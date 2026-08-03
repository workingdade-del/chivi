"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Pencil, ArrowUpDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatFcfa } from "@/lib/format";
import type { ExpenseCategory } from "@/lib/supabase/types";

interface ExpenseRow {
  id: string;
  label: string;
  category: ExpenseCategory;
  amount: number;
  quantity: number | null;
  unit_price: number | null;
  expense_date: string;
  note: string | null;
}

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  ingredients: "Ingrédients",
  emballage: "Emballage",
  transport: "Transport",
  personnel: "Personnel",
  autre: "Autre",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM = {
  label: "",
  category: "ingredients" as ExpenseCategory,
  quantity: "1",
  unitPrice: "",
  expenseDate: todayIso(),
  note: "",
};

/**
 * Dépenses/Achats — vue en liste triable/filtrable, partagée entre l'Admin
 * et la Cuisine (une seule implémentation, comme demandé, pour éviter de
 * dupliquer l'interface entre les deux apps). "theme" adapte juste la
 * palette (Admin clair/crème, Cuisine sombre/maroon).
 */
export function ExpensesManager({ theme = "dark" }: { theme?: "light" | "dark" }) {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | "all">("all");
  const [sortAsc, setSortAsc] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ExpenseRow>>({});

  const isDark = theme === "dark";

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("expenses")
      .select("id, label, category, amount, quantity, unit_price, expense_date, note")
      .order("expense_date", { ascending: false });
    if (data) setExpenses(data);
  }, []);

  useEffect(() => {
    fetchAll();
    const supabase = createClient();
    const channel = supabase
      .channel(`expenses-manager:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => fetchAll())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  const quantity = parseFloat(form.quantity) || 0;
  const unitPrice = parseFloat(form.unitPrice) || 0;
  const total = quantity * unitPrice;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim() || unitPrice <= 0) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("expenses").insert({
      label: form.label.trim(),
      category: form.category,
      amount: total,
      quantity,
      unit_price: unitPrice,
      expense_date: form.expenseDate,
      note: form.note.trim() || null,
    });
    setBusy(false);
    setForm({ ...EMPTY_FORM, expenseDate: form.expenseDate });
  }

  function startEdit(row: ExpenseRow) {
    setEditingId(row.id);
    setEditDraft({ ...row });
  }

  async function saveEdit() {
    if (!editingId) return;
    const qty = editDraft.quantity ?? 0;
    const unitP = editDraft.unit_price ?? 0;
    const supabase = createClient();
    await supabase
      .from("expenses")
      .update({
        label: (editDraft.label ?? "").trim(),
        category: editDraft.category,
        quantity: qty,
        unit_price: unitP,
        amount: (qty ?? 0) * (unitP ?? 0),
        expense_date: editDraft.expense_date,
        note: editDraft.note?.trim() || null,
      })
      .eq("id", editingId);
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette dépense ?")) return;
    const supabase = createClient();
    await supabase.from("expenses").delete().eq("id", id);
  }

  const filtered = expenses
    .filter((e) => categoryFilter === "all" || e.category === categoryFilter)
    .sort((a, b) => (sortAsc ? a.expense_date.localeCompare(b.expense_date) : b.expense_date.localeCompare(a.expense_date)));

  const total_ = filtered.reduce((s, e) => s + e.amount, 0);

  const panelBg = isDark ? "bg-[#1d0e0e] border-[#3a1c1c]" : "bg-white border-[#ece2cd]";
  const inputBg = isDark ? "bg-[#2a1414] border-[#4a2020] text-white" : "bg-white border-[#ece2cd] text-ink";
  const labelColor = isDark ? "text-[#a07d6d]" : "text-ink/60";
  const headingColor = isDark ? "text-gold" : "text-maroon-deep";

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className={`font-display ${headingColor} text-xl uppercase mb-4`}>Dépenses / Achats</div>

      <form onSubmit={handleSubmit} className={`${panelBg} border rounded-2xl p-4 sm:p-5 flex flex-col gap-3.5 mb-6`}>
        <Field label="Nom de l'article" labelColor={labelColor}>
          <input
            required
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Ex : Riz, cartons, essence…"
            className={`w-full border rounded-xl px-3.5 py-3 text-[15px] min-h-[48px] ${inputBg}`}
          />
        </Field>

        <Field label="Catégorie" labelColor={labelColor}>
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
            className={`w-full border rounded-xl px-3.5 py-3 text-[15px] min-h-[48px] ${inputBg}`}
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantité" labelColor={labelColor}>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              className={`w-full border rounded-xl px-3.5 py-3 text-[15px] min-h-[48px] ${inputBg}`}
            />
          </Field>
          <Field label="Prix unitaire (FCFA)" labelColor={labelColor}>
            <input
              required
              type="number"
              step="1"
              min="0"
              value={form.unitPrice}
              onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
              className={`w-full border rounded-xl px-3.5 py-3 text-[15px] min-h-[48px] ${inputBg}`}
            />
          </Field>
        </div>

        <div className={`flex items-center justify-between rounded-xl px-3.5 py-3 ${isDark ? "bg-[#2c1510]" : "bg-[#faf4e8]"}`}>
          <span className={`text-xs uppercase tracking-wide ${labelColor}`}>Prix total</span>
          <span className="font-mega text-lg text-amber">{formatFcfa(total)}</span>
        </div>

        <Field label="Date" labelColor={labelColor}>
          <input
            type="date"
            value={form.expenseDate}
            onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
            className={`w-full border rounded-xl px-3.5 py-3 text-[15px] min-h-[48px] ${inputBg}`}
          />
        </Field>

        <Field label="Note (optionnel)" labelColor={labelColor}>
          <input
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Fournisseur, précision…"
            className={`w-full border rounded-xl px-3.5 py-3 text-[15px] min-h-[48px] ${inputBg}`}
          />
        </Field>

        <button
          disabled={busy || !form.label.trim() || unitPrice <= 0}
          className="w-full min-h-[48px] bg-amber text-maroon-deep font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Plus size={18} />
          {busy ? "Enregistrement…" : "Enregistrer l'achat"}
        </button>
      </form>

      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as ExpenseCategory | "all")}
            className={`text-xs border rounded-lg px-2.5 py-1.5 ${inputBg}`}
          >
            <option value="all">Toutes catégories</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button onClick={() => setSortAsc((s) => !s)} className={`flex items-center gap-1 text-xs font-semibold ${labelColor}`}>
            <ArrowUpDown size={13} /> Date {sortAsc ? "croissant" : "décroissant"}
          </button>
        </div>
        <div className="font-mega text-lg text-amber">{formatFcfa(total_)}</div>
      </div>

      <div className="flex flex-col gap-2.5">
        {filtered.map((e) => (
          <div key={e.id} className={`${panelBg} border rounded-xl px-4 py-3`}>
            {editingId === e.id ? (
              <div className="flex flex-col gap-2">
                <input
                  value={editDraft.label ?? ""}
                  onChange={(ev) => setEditDraft((d) => ({ ...d, label: ev.target.value }))}
                  className={`w-full border rounded-lg px-2.5 py-1.5 text-sm ${inputBg}`}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={editDraft.quantity ?? 0}
                    onChange={(ev) => setEditDraft((d) => ({ ...d, quantity: parseFloat(ev.target.value) || 0 }))}
                    className={`border rounded-lg px-2.5 py-1.5 text-sm ${inputBg}`}
                  />
                  <input
                    type="number"
                    value={editDraft.unit_price ?? 0}
                    onChange={(ev) => setEditDraft((d) => ({ ...d, unit_price: parseFloat(ev.target.value) || 0 }))}
                    className={`border rounded-lg px-2.5 py-1.5 text-sm ${inputBg}`}
                  />
                </div>
                <input
                  type="date"
                  value={editDraft.expense_date ?? ""}
                  onChange={(ev) => setEditDraft((d) => ({ ...d, expense_date: ev.target.value }))}
                  className={`border rounded-lg px-2.5 py-1.5 text-sm ${inputBg}`}
                />
                <div className="flex gap-2">
                  <button onClick={saveEdit} className="flex-1 bg-amber text-maroon-deep font-bold text-xs rounded-lg py-2">
                    Enregistrer
                  </button>
                  <button onClick={() => setEditingId(null)} className={`flex-1 border rounded-lg py-2 text-xs ${labelColor}`}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className={`font-semibold text-sm truncate ${isDark ? "text-white" : "text-ink"}`}>{e.label}</div>
                  <div className={`text-xs mt-0.5 ${labelColor}`}>
                    {new Date(e.expense_date).toLocaleDateString("fr-FR")} · {CATEGORY_LABELS[e.category]}
                    {e.quantity && e.unit_price ? ` · ${e.quantity} × ${formatFcfa(e.unit_price)}` : ""}
                  </div>
                  {e.note && <div className={`text-xs mt-0.5 italic ${labelColor}`}>{e.note}</div>}
                </div>
                <div className="flex items-center gap-2 flex-none">
                  <div className="font-mega text-amber">{formatFcfa(e.amount)}</div>
                  <button onClick={() => startEdit(e)} aria-label="Modifier">
                    <Pencil size={14} className={labelColor} />
                  </button>
                  <button onClick={() => handleDelete(e.id)} aria-label="Supprimer">
                    <Trash2 size={14} className="text-red-500" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <div className={`text-center text-sm py-8 ${labelColor}`}>Aucune dépense.</div>}
      </div>
    </div>
  );
}

function Field({ label, labelColor, children }: { label: string; labelColor: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={`text-xs uppercase tracking-wide mb-1.5 ${labelColor}`}>{label}</div>
      {children}
    </div>
  );
}
