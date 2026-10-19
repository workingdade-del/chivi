"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Pencil, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatFcfa } from "@/lib/format";
import { Button } from "@/components/shared/Button";
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
  cost_type: CostType | null;
}

type CostType = "fixe" | "variable";
type CostTypeFilter = "all" | CostType | "a_classer";

const COST_TYPE_LABELS: Record<CostType, string> = { fixe: "Fixe", variable: "Variable" };

// Suggestion par défaut (modifiable) : personnel / loyer / abonnement → fixe, le reste → variable.
const FIXED_LABEL_PATTERN = /loyer|abonnement|assurance|salaire|internet|forfait|électricité|electricite|\bcie\b|\bsbee\b|\bsonéb\b|\bsoneb\b/i;
function suggestCostType(category: ExpenseCategory, label: string): CostType {
  return category === "personnel" || FIXED_LABEL_PATTERN.test(label) ? "fixe" : "variable";
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

// Mois courant à Cotonou (UTC+1) au format "YYYY-MM" — même préfixe que expense_date.
function currentMonth(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}

const EMPTY_FORM = {
  label: "",
  category: "ingredients" as ExpenseCategory,
  costType: "variable" as CostType,
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
  const [month, setMonth] = useState(currentMonth);
  const [costTypeFilter, setCostTypeFilter] = useState<CostTypeFilter>("all");
  const [costTypeTouched, setCostTypeTouched] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ExpenseRow>>({});

  const isDark = theme === "dark";

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("expenses")
      .select("id, label, category, amount, quantity, unit_price, expense_date, note, cost_type")
      .order("expense_date", { ascending: false });
    if (data) setExpenses(data);
  }, []);

  // Lien depuis Rapports ("N dépenses à classer") : ?type=a_classer&month=YYYY-MM.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type");
    if (type === "fixe" || type === "variable" || type === "a_classer") setCostTypeFilter(type);
    const m = params.get("month");
    if (m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)) setMonth(m);
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
      cost_type: form.costType,
    });
    setBusy(false);
    setCostTypeTouched(false);
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
        cost_type: editDraft.cost_type ?? null,
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
    .filter((e) => e.expense_date.slice(0, 7) === month)
    .filter((e) => categoryFilter === "all" || e.category === categoryFilter)
    .filter((e) => costTypeFilter === "all" || (costTypeFilter === "a_classer" ? !e.cost_type : e.cost_type === costTypeFilter))
    .sort((a, b) => (sortAsc ? a.expense_date.localeCompare(b.expense_date) : b.expense_date.localeCompare(a.expense_date)));

  const unclassifiedCount = expenses.filter((e) => !e.cost_type).length;
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
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                label: e.target.value,
                costType: costTypeTouched ? f.costType : suggestCostType(f.category, e.target.value),
              }))
            }
            placeholder="Ex : Riz, cartons, essence…"
            className={`w-full border rounded-xl px-3.5 py-3 text-[15px] min-h-[48px] ${inputBg}`}
          />
        </Field>

        <Field label="Catégorie" labelColor={labelColor}>
          <select
            value={form.category}
            onChange={(e) =>
              setForm((f) => {
                const category = e.target.value as ExpenseCategory;
                return { ...f, category, costType: costTypeTouched ? f.costType : suggestCostType(category, f.label) };
              })
            }
            className={`w-full border rounded-xl px-3.5 py-3 text-[15px] min-h-[48px] ${inputBg}`}
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Type de coût" labelColor={labelColor}>
          <select
            value={form.costType}
            onChange={(e) => {
              setCostTypeTouched(true);
              setForm((f) => ({ ...f, costType: e.target.value as CostType }));
            }}
            className={`w-full border rounded-xl px-3.5 py-3 text-[15px] min-h-[48px] ${inputBg}`}
          >
            <option value="fixe">Fixe (loyer, personnel, abonnement…)</option>
            <option value="variable">Variable (varie avec les ventes)</option>
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

      <div className={`${panelBg} border rounded-xl px-3 py-2 flex items-center justify-between mb-3`}>
        <button onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Mois précédent" className={labelColor}>
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <div className={`font-semibold text-sm capitalize ${isDark ? "text-white" : "text-ink"}`}>{monthLabel(month)}</div>
          {month !== currentMonth() && (
            <button onClick={() => setMonth(currentMonth())} className="text-[11px] text-amber underline">
              Revenir au mois en cours
            </button>
          )}
        </div>
        <button
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          disabled={month >= currentMonth()}
          aria-label="Mois suivant"
          className={`${labelColor} disabled:opacity-30`}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {unclassifiedCount > 0 && (
        <button
          onClick={() => setCostTypeFilter("a_classer")}
          className="w-full text-left text-[13px] text-[#a6740a] bg-[#fff6e5] border-l-[3px] border-amber rounded-lg px-3.5 py-2.5 mb-3 leading-snug"
        >
          {unclassifiedCount} dépense{unclassifiedCount > 1 ? "s" : ""} à classer (fixe ou variable) — toutes périodes. Appuyez pour les afficher.
        </button>
      )}

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
          <select
            value={costTypeFilter}
            onChange={(e) => setCostTypeFilter(e.target.value as CostTypeFilter)}
            className={`text-xs border rounded-lg px-2.5 py-1.5 ${inputBg}`}
          >
            <option value="all">Tous types</option>
            <option value="fixe">Fixes</option>
            <option value="variable">Variables</option>
            <option value="a_classer">À classer</option>
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
                <select
                  value={editDraft.cost_type ?? ""}
                  onChange={(ev) => setEditDraft((d) => ({ ...d, cost_type: (ev.target.value || null) as CostType | null }))}
                  className={`border rounded-lg px-2.5 py-1.5 text-sm ${inputBg}`}
                >
                  <option value="">À classer</option>
                  <option value="fixe">Fixe</option>
                  <option value="variable">Variable</option>
                </select>
                <input
                  type="date"
                  value={editDraft.expense_date ?? ""}
                  onChange={(ev) => setEditDraft((d) => ({ ...d, expense_date: ev.target.value }))}
                  className={`border rounded-lg px-2.5 py-1.5 text-sm ${inputBg}`}
                />
                <div className="flex gap-2">
                  <Button onClick={saveEdit} className="flex-1 bg-amber text-maroon-deep font-bold text-xs rounded-lg py-2">
                    Enregistrer
                  </Button>
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
                    {" · "}
                    <span className={e.cost_type ? "" : "text-[#a6740a] font-semibold"}>{e.cost_type ? COST_TYPE_LABELS[e.cost_type] : "À classer"}</span>
                  </div>
                  {e.note && <div className={`text-xs mt-0.5 italic ${labelColor}`}>{e.note}</div>}
                </div>
                <div className="flex items-center gap-4 flex-none">
                  <div className="font-mega text-amber">{formatFcfa(e.amount)}</div>
                  <button onClick={() => startEdit(e)} aria-label="Modifier">
                    <Pencil size={14} className={labelColor} />
                  </button>
                  <Button onClick={() => handleDelete(e.id)} aria-label="Supprimer" pendingLabel={null}>
                    <Trash2 size={14} className="text-red-500" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <div className={`text-center text-sm py-8 ${labelColor}`}>Aucune dépense en {monthLabel(month)}.</div>}
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
