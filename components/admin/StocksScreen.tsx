"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Download, Trash2 } from "lucide-react";
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

interface MovementRow {
  id: string;
  item_name: string;
  change_qty: number;
  quantity_after: number;
  created_at: string;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function StocksScreen() {
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Partial<Record<keyof InventoryRow, string>>>>({});

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const [{ data: itemsData }, { data: movementsData }] = await Promise.all([
      supabase.from("inventory_items").select("*").order("name"),
      supabase.from("inventory_movements").select("*").order("created_at", { ascending: false }).limit(30),
    ]);
    if (itemsData) setItems(itemsData as InventoryRow[]);
    if (movementsData) setMovements(movementsData as MovementRow[]);
  }, []);

  useEffect(() => {
    fetchAll();
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-stocks:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_items" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_movements" }, () => fetchAll())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  function draftValue(item: InventoryRow, field: keyof InventoryRow): string {
    return drafts[item.id]?.[field] ?? String(item[field]);
  }

  function setDraft(itemId: string, field: keyof InventoryRow, value: string) {
    setDrafts((d) => ({ ...d, [itemId]: { ...d[itemId], [field]: value } }));
  }

  async function handleSave(item: InventoryRow) {
    const supabase = createClient();
    const draft = drafts[item.id] ?? {};
    await supabase
      .from("inventory_items")
      .update({
        quantity: draft.quantity !== undefined ? parseFloat(draft.quantity) : item.quantity,
        alert_threshold: draft.alert_threshold !== undefined ? parseFloat(draft.alert_threshold) : item.alert_threshold,
        unit_price: draft.unit_price !== undefined ? parseFloat(draft.unit_price) : item.unit_price,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    setDrafts((d) => {
      const next = { ...d };
      delete next[item.id];
      return next;
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cet élément de l'inventaire ?")) return;
    const supabase = createClient();
    await supabase.from("inventory_items").delete().eq("id", id);
  }

  function handleExportCsv() {
    const rows = [
      ["Nom", "Quantité", "Unité", "Seuil d'alerte", "Prix unitaire", "Valeur totale"],
      ...items.map((i) => [i.name, String(i.quantity), i.unit, String(i.alert_threshold), String(i.unit_price), String(i.quantity * i.unit_price)]),
    ];
    downloadCsv(`chivi-stocks-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  const totalValue = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const lowStockCount = items.filter((i) => i.quantity < i.alert_threshold).length;

  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="text-xs text-[#9a8b78] uppercase tracking-wide">Valeur totale du stock</div>
          <div className="font-mega text-2xl text-maroon-deep mt-2">{formatFcfa(totalValue)}</div>
        </div>
        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="text-xs text-[#9a8b78] uppercase tracking-wide">Éléments en stock</div>
          <div className="font-mega text-2xl text-maroon-deep mt-2">{items.length}</div>
        </div>
        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="text-xs text-[#9a8b78] uppercase tracking-wide">Alertes stock bas</div>
          <div className={`font-mega text-2xl mt-2 ${lowStockCount > 0 ? "text-chilli" : "text-maroon-deep"}`}>
            {lowStockCount}
          </div>
        </div>
      </div>

      <div className="flex justify-end mb-3">
        <button
          onClick={handleExportCsv}
          className="flex items-center gap-2 bg-white border border-[#e6dcc4] text-ink font-semibold text-sm px-4 py-2.5 rounded-xl"
        >
          <Download size={16} />
          Exporter en CSV
        </button>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="font-bold text-sm text-ink mb-3.5">Inventaire</div>
          <div className="flex flex-col gap-2.5">
            {items.map((item) => {
              const low = item.quantity < item.alert_threshold;
              const dirty = Boolean(drafts[item.id]);
              return (
                <div
                  key={item.id}
                  className={`border rounded-xl px-4 py-3 ${low ? "border-chilli bg-[rgba(231,50,35,.06)]" : "border-[#efe6d3]"}`}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="font-semibold text-ink text-sm flex items-center gap-1.5">
                      {item.name}
                      {low && <AlertTriangle size={13} className="text-chilli" />}
                    </div>
                    <button onClick={() => handleDelete(item.id)} className="text-chilli">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <label className="text-[11px] text-[#9a8b78]">
                      Quantité ({item.unit})
                      <input
                        type="number"
                        value={draftValue(item, "quantity")}
                        onChange={(e) => setDraft(item.id, "quantity", e.target.value)}
                        className="w-full border border-[#e6dcc4] rounded-lg px-2 py-1.5 text-sm mt-0.5"
                      />
                    </label>
                    <label className="text-[11px] text-[#9a8b78]">
                      Seuil
                      <input
                        type="number"
                        value={draftValue(item, "alert_threshold")}
                        onChange={(e) => setDraft(item.id, "alert_threshold", e.target.value)}
                        className="w-full border border-[#e6dcc4] rounded-lg px-2 py-1.5 text-sm mt-0.5"
                      />
                    </label>
                    <label className="text-[11px] text-[#9a8b78]">
                      Prix unitaire
                      <input
                        type="number"
                        value={draftValue(item, "unit_price")}
                        onChange={(e) => setDraft(item.id, "unit_price", e.target.value)}
                        className="w-full border border-[#e6dcc4] rounded-lg px-2 py-1.5 text-sm mt-0.5"
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        onClick={() => handleSave(item)}
                        disabled={!dirty}
                        className="w-full py-1.5 rounded-lg bg-maroon text-gold font-bold text-xs disabled:opacity-40"
                      >
                        Enregistrer
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {items.length === 0 && <div className="text-center text-[#9a8b78] text-sm py-8">Inventaire vide.</div>}
          </div>
        </div>

        <div className="bg-white border border-[#ece2cd] rounded-2xl p-5">
          <div className="font-bold text-sm text-ink mb-3.5">Historique des mouvements</div>
          <div className="flex flex-col gap-2">
            {movements.map((m) => (
              <div key={m.id} className="flex justify-between items-center text-[13px] border-b border-[#f3ecdd] pb-2">
                <div>
                  <div className="font-semibold text-ink">{m.item_name}</div>
                  <div className="text-[11px] text-[#9a8b78]">
                    {new Date(m.created_at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <div className={`font-mega ${m.change_qty >= 0 ? "text-status-green-deep" : "text-chilli"}`}>
                  {m.change_qty >= 0 ? "+" : ""}
                  {m.change_qty}
                </div>
              </div>
            ))}
            {movements.length === 0 && (
              <div className="text-center text-[#9a8b78] text-sm py-8">Aucun mouvement enregistré.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
