"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatFcfa } from "@/lib/format";

interface InventoryRow {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  alert_threshold: number;
  unit_price: number;
}

const UNITS = ["kg", "L", "unité"];

const EMPTY_FORM = { name: "", quantity: "", unit: "kg", alertThreshold: "", unitPrice: "" };

export function InventoryScreen() {
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});

  const fetchItems = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("inventory_items").select("*").order("name");
    if (data) setItems(data as InventoryRow[]);
  }, []);

  useEffect(() => {
    fetchItems();
    const supabase = createClient();
    const channel = supabase
      .channel(`cuisine-inventory:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_items" }, () => fetchItems())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchItems]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("inventory_items").insert({
      name: form.name.trim(),
      quantity: parseFloat(form.quantity) || 0,
      unit: form.unit,
      alert_threshold: parseFloat(form.alertThreshold) || 0,
      unit_price: parseFloat(form.unitPrice) || 0,
    });
    setBusy(false);
    setForm(EMPTY_FORM);
  }

  async function handleQuantityUpdate(id: string) {
    const draft = quantityDrafts[id];
    if (draft === undefined) return;
    const value = parseFloat(draft);
    if (Number.isNaN(value)) return;
    const supabase = createClient();
    await supabase.from("inventory_items").update({ quantity: value, updated_at: new Date().toISOString() }).eq("id", id);
    setQuantityDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
  }

  const alertCount = items.filter((i) => i.quantity < i.alert_threshold).length;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="font-display text-gold text-xl uppercase">Inventaire</div>
        {alertCount > 0 && (
          <div className="flex items-center gap-1.5 text-chilli text-xs font-bold bg-[rgba(231,50,35,.14)] px-3 py-1.5 rounded-full">
            <AlertTriangle size={13} />
            {alertCount} en alerte
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="bg-[#1d0e0e] border border-[#3a1c1c] rounded-2xl p-4 sm:p-5 flex flex-col gap-3.5 mb-6">
        <Field label="Nom de l'élément">
          <input
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Ex : Riz, huile, poulet…"
            className="w-full bg-[#2a1414] border border-[#4a2020] rounded-xl px-3.5 py-3 text-[15px] text-white min-h-[48px]"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantité actuelle">
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              className="w-full bg-[#2a1414] border border-[#4a2020] rounded-xl px-3.5 py-3 text-[15px] text-white min-h-[48px]"
            />
          </Field>
          <Field label="Unité">
            <select
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              className="w-full bg-[#2a1414] border border-[#4a2020] rounded-xl px-3.5 py-3 text-[15px] text-white min-h-[48px]"
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Seuil d'alerte">
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.alertThreshold}
              onChange={(e) => setForm((f) => ({ ...f, alertThreshold: e.target.value }))}
              className="w-full bg-[#2a1414] border border-[#4a2020] rounded-xl px-3.5 py-3 text-[15px] text-white min-h-[48px]"
            />
          </Field>
          <Field label="Prix unitaire (FCFA)">
            <input
              type="number"
              step="1"
              min="0"
              value={form.unitPrice}
              onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
              className="w-full bg-[#2a1414] border border-[#4a2020] rounded-xl px-3.5 py-3 text-[15px] text-white min-h-[48px]"
            />
          </Field>
        </div>
        <button
          disabled={busy || !form.name.trim()}
          className="w-full min-h-[48px] bg-amber text-maroon-deep font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Plus size={18} />
          {busy ? "Ajout…" : "Ajouter à l'inventaire"}
        </button>
      </form>

      <div className="flex flex-col gap-2.5">
        {items.map((item) => {
          const low = item.quantity < item.alert_threshold;
          const draft = quantityDrafts[item.id];
          return (
            <div
              key={item.id}
              className={`border rounded-xl px-4 py-3 ${
                low ? "bg-[rgba(231,50,35,.1)] border-chilli" : "bg-[#1d0e0e] border-[#3a1c1c]"
              }`}
            >
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <div className="min-w-0">
                  <div className="font-semibold text-white text-sm flex items-center gap-1.5">
                    {item.name}
                    {low && <AlertTriangle size={14} className="text-chilli flex-none" />}
                  </div>
                  <div className="text-xs text-[#a07d6d] mt-0.5">
                    Seuil : {item.alert_threshold} {item.unit} · {formatFcfa(item.unit_price)}/{item.unit}
                  </div>
                </div>
                <div className={`font-mega text-lg flex-none ${low ? "text-chilli" : "text-amber"}`}>
                  {item.quantity} {item.unit}
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Nouvelle quantité"
                  value={draft ?? ""}
                  onChange={(e) => setQuantityDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                  className="flex-1 bg-[#2a1414] border border-[#4a2020] rounded-xl px-3 py-2.5 text-sm text-white min-h-[44px]"
                />
                <button
                  onClick={() => handleQuantityUpdate(item.id)}
                  disabled={draft === undefined || draft === ""}
                  className="px-4 min-h-[44px] rounded-xl bg-white/10 text-cream font-bold text-sm disabled:opacity-40"
                >
                  Mettre à jour
                </button>
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="text-center text-[#7a5a4c] text-sm py-8">Aucun élément dans l&apos;inventaire.</div>
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
