"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatFcfa } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/product-categories";
import type { ProductCategory } from "@/lib/supabase/types";

interface ProductRow {
  id: string;
  name: string;
  category: ProductCategory;
  base_price: number;
}

interface CostRow {
  product_id: string;
  ingredient_cost: number;
  packaging_cost: number;
  notes: string | null;
}

interface CostDraft {
  ingredientCost: string;
  packagingCost: string;
  notes: string;
}

export function ProductCostsScreen() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [costs, setCosts] = useState<Record<string, CostRow>>({});
  const [drafts, setDrafts] = useState<Record<string, CostDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const [{ data: productsData }, { data: costsData }] = await Promise.all([
      supabase.from("products").select("id, name, category, base_price").order("sort_order"),
      supabase.from("product_costs").select("product_id, ingredient_cost, packaging_cost, notes"),
    ]);
    if (productsData) setProducts(productsData as ProductRow[]);
    if (costsData) {
      const map: Record<string, CostRow> = {};
      for (const c of costsData as CostRow[]) map[c.product_id] = c;
      setCosts(map);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const supabase = createClient();
    const channel = supabase
      .channel(`cuisine-product-costs:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_costs" }, () => fetchAll())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  function draftFor(productId: string): CostDraft {
    if (drafts[productId]) return drafts[productId];
    const existing = costs[productId];
    return {
      ingredientCost: existing ? String(existing.ingredient_cost) : "",
      packagingCost: existing ? String(existing.packaging_cost) : "",
      notes: existing?.notes ?? "",
    };
  }

  function updateDraft(productId: string, patch: Partial<CostDraft>) {
    setDrafts((d) => ({ ...d, [productId]: { ...draftFor(productId), ...patch } }));
  }

  async function handleSave(productId: string) {
    const draft = draftFor(productId);
    setSavingId(productId);
    const supabase = createClient();
    await supabase.from("product_costs").upsert(
      {
        product_id: productId,
        ingredient_cost: parseFloat(draft.ingredientCost) || 0,
        packaging_cost: parseFloat(draft.packagingCost) || 0,
        notes: draft.notes.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "product_id" }
    );
    setSavingId(null);
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="font-display text-gold text-xl uppercase mb-4">Coûts des plats</div>

      <div className="flex flex-col gap-3">
        {products.map((p) => {
          const draft = draftFor(p.id);
          const ingredientCost = parseFloat(draft.ingredientCost) || 0;
          const packagingCost = parseFloat(draft.packagingCost) || 0;
          const totalCost = ingredientCost + packagingCost;
          const margin = p.base_price - totalCost;
          const marginPct = p.base_price > 0 ? Math.round((margin / p.base_price) * 100) : 0;

          return (
            <div key={p.id} className="bg-[#1d0e0e] border border-[#3a1c1c] rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="font-semibold text-white text-[15px]">{p.name}</div>
                  <div className="text-xs text-[#a07d6d] mt-0.5">
                    {CATEGORY_LABELS[p.category]} · Prix vente {formatFcfa(p.base_price)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <Field label="Coût ingrédients">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={draft.ingredientCost}
                    onChange={(e) => updateDraft(p.id, { ingredientCost: e.target.value })}
                    className="w-full bg-[#2a1414] border border-[#4a2020] rounded-xl px-3.5 py-3 text-[15px] text-white min-h-[48px]"
                  />
                </Field>
                <Field label="Coût emballage">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={draft.packagingCost}
                    onChange={(e) => updateDraft(p.id, { packagingCost: e.target.value })}
                    className="w-full bg-[#2a1414] border border-[#4a2020] rounded-xl px-3.5 py-3 text-[15px] text-white min-h-[48px]"
                  />
                </Field>
              </div>

              <Field label="Description / notes de préparation">
                <textarea
                  rows={2}
                  value={draft.notes}
                  onChange={(e) => updateDraft(p.id, { notes: e.target.value })}
                  className="w-full bg-[#2a1414] border border-[#4a2020] rounded-xl px-3.5 py-3 text-[15px] text-white resize-none"
                />
              </Field>

              <div className="flex items-center justify-between bg-[#2c1510] rounded-xl px-3.5 py-3 mt-3.5">
                <div>
                  <div className="text-[11px] text-[#d3a78d] uppercase tracking-wide">Coût total</div>
                  <div className="font-mega text-lg text-amber">{formatFcfa(totalCost)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-[#d3a78d] uppercase tracking-wide">Marge</div>
                  <div className={`font-mega text-lg ${margin >= 0 ? "text-[#4fd587]" : "text-chilli"}`}>
                    {formatFcfa(margin)} <span className="text-xs">({marginPct}%)</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleSave(p.id)}
                disabled={savingId === p.id}
                className="w-full min-h-[48px] mt-3.5 bg-amber text-maroon-deep font-bold rounded-xl disabled:opacity-50"
              >
                {savingId === p.id ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          );
        })}
        {products.length === 0 && <div className="text-center text-[#7a5a4c] text-sm py-8">Aucun plat au menu.</div>}
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
