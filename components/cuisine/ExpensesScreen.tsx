"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
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
  note: string | null;
  created_at: string;
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

export function ExpensesScreen() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const fetchToday = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("expenses")
      .select("id, label, category, amount, quantity, unit_price, note, created_at")
      .eq("expense_date", todayIso())
      .order("created_at", { ascending: false });
    if (data) setExpenses(data as ExpenseRow[]);
  }, []);

  useEffect(() => {
    fetchToday();
    const supabase = createClient();
    const channel = supabase
      .channel(`cuisine-expenses:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => fetchToday())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchToday]);

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

  const todayTotal = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="font-display text-gold text-xl uppercase mb-4">Dépenses / Achats</div>

      <form onSubmit={handleSubmit} className="bg-[#1d0e0e] border border-[#3a1c1c] rounded-2xl p-4 sm:p-5 flex flex-col gap-3.5 mb-6">
        <Field label="Nom de l'article">
          <input
            required
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Ex : Riz, cartons, essence…"
            className="w-full bg-[#2a1414] border border-[#4a2020] rounded-xl px-3.5 py-3 text-[15px] text-white min-h-[48px]"
          />
        </Field>

        <Field label="Catégorie">
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
            className="w-full bg-[#2a1414] border border-[#4a2020] rounded-xl px-3.5 py-3 text-[15px] text-white min-h-[48px]"
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantité">
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              className="w-full bg-[#2a1414] border border-[#4a2020] rounded-xl px-3.5 py-3 text-[15px] text-white min-h-[48px]"
            />
          </Field>
          <Field label="Prix unitaire (FCFA)">
            <input
              required
              type="number"
              step="1"
              min="0"
              value={form.unitPrice}
              onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
              className="w-full bg-[#2a1414] border border-[#4a2020] rounded-xl px-3.5 py-3 text-[15px] text-white min-h-[48px]"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between bg-[#2c1510] rounded-xl px-3.5 py-3">
          <span className="text-xs text-[#d3a78d] uppercase tracking-wide">Prix total</span>
          <span className="font-mega text-lg text-amber">{formatFcfa(total)}</span>
        </div>

        <Field label="Date">
          <input
            type="date"
            value={form.expenseDate}
            onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
            className="w-full bg-[#2a1414] border border-[#4a2020] rounded-xl px-3.5 py-3 text-[15px] text-white min-h-[48px]"
          />
        </Field>

        <Field label="Note (optionnel)">
          <input
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Fournisseur, précision…"
            className="w-full bg-[#2a1414] border border-[#4a2020] rounded-xl px-3.5 py-3 text-[15px] text-white min-h-[48px]"
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

      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-cream text-sm uppercase tracking-wide">Aujourd&apos;hui</div>
        <div className="font-mega text-lg text-amber">{formatFcfa(todayTotal)}</div>
      </div>

      <div className="flex flex-col gap-2.5">
        {expenses.map((e) => (
          <div key={e.id} className="bg-[#1d0e0e] border border-[#3a1c1c] rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-white text-sm truncate">{e.label}</div>
              <div className="text-xs text-[#a07d6d] mt-0.5">
                {CATEGORY_LABELS[e.category]}
                {e.quantity && e.unit_price ? ` · ${e.quantity} × ${formatFcfa(e.unit_price)}` : ""}
              </div>
              {e.note && <div className="text-xs text-[#d3a78d] mt-0.5 italic">{e.note}</div>}
            </div>
            <div className="font-mega text-amber flex-none">{formatFcfa(e.amount)}</div>
          </div>
        ))}
        {expenses.length === 0 && (
          <div className="text-center text-[#7a5a4c] text-sm py-8">Aucune dépense enregistrée aujourd&apos;hui.</div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-[#a07d6d] uppercase tracking-wide mb-1.5">{label}</div>
      {children}
    </div>
  );
}
