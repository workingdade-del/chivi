"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatFcfa } from "@/lib/format";
import { ProductEditor, type EditorCategory } from "@/components/shared/ProductEditor";

interface ProductRow {
  id: string;
  name: string;
  category: string;
  base_price: number;
}

interface CostRow {
  product_id: string;
  ingredient_cost: number;
  packaging_cost: number;
}

/**
 * Même fiche plat que l'Admin (components/shared/ProductEditor), en
 * scope="costs" : seuls les coûts/marge/notes internes sont éditables ici,
 * le reste (titre, photo, catégorie, variantes…) est géré depuis l'Admin —
 * évite de dupliquer l'interface entre les deux apps.
 */
export function ProductCostsScreen() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<EditorCategory[]>([]);
  const [costs, setCosts] = useState<Record<string, CostRow>>({});
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const [{ data: productsData }, { data: costsData }, { data: categoriesData }] = await Promise.all([
      supabase.from("products").select("id, name, category, base_price").order("sort_order"),
      supabase.from("product_costs").select("product_id, ingredient_cost, packaging_cost"),
      supabase.from("categories").select("id, slug, label, sort_order, is_supplements").order("sort_order"),
    ]);
    if (productsData) setProducts(productsData);
    if (categoriesData) {
      setCategories(categoriesData.map((c) => ({ id: c.id, slug: c.slug, label: c.label, sortOrder: c.sort_order, isSupplements: c.is_supplements })));
    }
    if (costsData) {
      const map: Record<string, CostRow> = {};
      for (const c of costsData) map[c.product_id] = c;
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

  const categoryLabel = (slug: string) => categories.find((c) => c.slug === slug)?.label ?? slug;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="font-display text-gold text-xl uppercase mb-4">Coûts des plats</div>

      <div className="flex flex-col gap-3">
        {products.map((p) => {
          const cost = costs[p.id];
          const totalCost = (cost?.ingredient_cost ?? 0) + (cost?.packaging_cost ?? 0);
          const margin = p.base_price - totalCost;
          const marginPct = p.base_price > 0 ? Math.round((margin / p.base_price) * 100) : 0;

          return (
            <button
              key={p.id}
              onClick={() => setEditingProductId(p.id)}
              className="text-left bg-[#1d0e0e] border border-[#3a1c1c] rounded-2xl p-4 sm:p-5"
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="font-semibold text-white text-[15px]">{p.name}</div>
                  <div className="text-xs text-[#a07d6d] mt-0.5">
                    {categoryLabel(p.category)} · Prix vente {formatFcfa(p.base_price)}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between bg-[#2c1510] rounded-xl px-3.5 py-3">
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
            </button>
          );
        })}
        {products.length === 0 && <div className="text-center text-[#7a5a4c] text-sm py-8">Aucun plat au menu.</div>}
      </div>

      {editingProductId && (
        <ProductEditor
          productId={editingProductId}
          scope="costs"
          theme="dark"
          categories={categories}
          onClose={() => setEditingProductId(null)}
          onChanged={() => {
            setEditingProductId(null);
            fetchAll();
          }}
        />
      )}
    </div>
  );
}
