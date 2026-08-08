"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatFcfa } from "@/lib/format";

export interface EditableOrderItem {
  key: string;
  productId: string | null;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  supplementIds: string[];
  supplementNames: string[];
  lineTotal: number;
}

interface ProductRow {
  id: string;
  name: string;
  base_price: number;
}
interface VariantRow {
  id: string;
  product_id: string;
  name: string;
  price: number;
}
interface SupplementRow {
  id: string;
  name: string;
  price: number;
}

/** Editeur d'articles réutilisé par "Modifier la commande" et "Nouvelle commande" — même logique de tarification que lib/staff-order.ts (supplements pliés dans line_total, order_supplements.unit_price = 0). */
export function OrderItemsEditor({
  items,
  onChange,
}: {
  items: EditableOrderItem[];
  onChange: (items: EditableOrderItem[]) => void;
}) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [supplements, setSupplements] = useState<SupplementRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedVariant, setSelectedVariant] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selectedSupplements, setSelectedSupplements] = useState<string[]>([]);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("products").select("id, name, base_price").eq("is_available", true).order("name"),
      supabase.from("product_variants").select("id, product_id, name, price").eq("is_available", true),
      supabase.from("supplements").select("id, name, price").eq("is_available", true).order("name"),
    ]).then(([p, v, s]) => {
      setProducts(p.data ?? []);
      setVariants(v.data ?? []);
      setSupplements(s.data ?? []);
      setLoading(false);
    });
  }, []);

  const productVariants = variants.filter((v) => v.product_id === selectedProduct);
  const BASE_PRICE_VALUE = "__base_price__";

  function handleAdd() {
    const product = products.find((p) => p.id === selectedProduct);
    if (!product) return;
    // BASE_PRICE_VALUE ne correspond jamais à un id réel de product_variants
    // — find() renvoie undefined, donc variant=null et unitPrice retombe sur
    // product.base_price, exactement le comportement voulu pour "Prix de base".
    const variant = productVariants.find((v) => v.id === selectedVariant) ?? null;
    const unitPrice = variant ? variant.price : product.base_price;
    const supplementRows = supplements.filter((s) => selectedSupplements.includes(s.id));
    const supplementsTotal = supplementRows.reduce((s, r) => s + r.price, 0);
    const lineTotal = (unitPrice + supplementsTotal) * quantity;

    onChange([
      ...items,
      {
        key: crypto.randomUUID(),
        productId: product.id,
        productName: product.name,
        variantId: variant?.id ?? null,
        variantName: variant?.name ?? null,
        unitPrice,
        quantity,
        supplementIds: supplementRows.map((s) => s.id),
        supplementNames: supplementRows.map((s) => s.name),
        lineTotal,
      },
    ]);

    setSelectedProduct("");
    setSelectedVariant("");
    setQuantity(1);
    setSelectedSupplements([]);
  }

  function handleRemove(key: string) {
    onChange(items.filter((i) => i.key !== key));
  }

  function handleQuantityChange(key: string, newQty: number) {
    if (newQty < 1) return;
    onChange(
      items.map((i) => {
        if (i.key !== key) return i;
        const unitAndSupplements = i.lineTotal / i.quantity;
        return { ...i, quantity: newQty, lineTotal: Math.round(unitAndSupplements * newQty) };
      })
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div key={item.key} className="flex items-center gap-2.5 bg-[#faf4e8] rounded-xl px-3 py-2.5">
            <input
              type="number"
              min={1}
              value={item.quantity}
              onChange={(e) => handleQuantityChange(item.key, Number(e.target.value))}
              className="w-14 border-2 border-[#e6dcc4] rounded-lg px-2 py-1 text-sm text-center"
            />
            <div className="flex-1">
              <div className="font-semibold text-[13.5px] text-ink">{item.productName}</div>
              <div className="text-[12px] text-[#9a8b78]">
                {[item.variantName, ...item.supplementNames].filter(Boolean).join(" · ")}
              </div>
            </div>
            <span className="font-mega text-sm text-maroon-deep">{formatFcfa(item.lineTotal)}</span>
            <button onClick={() => handleRemove(item.key)} className="text-chilli font-bold text-lg leading-none px-1">
              ×
            </button>
          </div>
        ))}
        {items.length === 0 && <div className="text-[13px] text-[#9a8b78] text-center py-3">Aucun article.</div>}
      </div>

      <div className="h-px bg-[#efe6d3]" />

      {loading ? (
        <div className="text-[13px] text-[#9a8b78]">Chargement du menu…</div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <select
              value={selectedProduct}
              onChange={(e) => {
                setSelectedProduct(e.target.value);
                setSelectedVariant("");
              }}
              className="flex-1 border-2 border-[#e6dcc4] rounded-xl px-3 py-2 text-sm"
            >
              <option value="">Choisir un plat…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-16 border-2 border-[#e6dcc4] rounded-xl px-2 py-2 text-sm text-center"
            />
          </div>

          {productVariants.length > 0 && (
            <select
              value={selectedVariant}
              onChange={(e) => setSelectedVariant(e.target.value)}
              className="border-2 border-[#e6dcc4] rounded-xl px-3 py-2 text-sm"
            >
              <option value="">Choisir une option…</option>
              {(() => {
                const product = products.find((p) => p.id === selectedProduct);
                return product ? (
                  <option value={BASE_PRICE_VALUE}>Prix de base — {formatFcfa(product.base_price)}</option>
                ) : null;
              })()}
              {productVariants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} — {formatFcfa(v.price)}
                </option>
              ))}
            </select>
          )}

          {supplements.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {supplements.map((s) => {
                const active = selectedSupplements.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setSelectedSupplements((prev) =>
                        active ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                      )
                    }
                    className={`text-[12px] font-semibold px-2.5 py-1.5 rounded-full border-2 ${
                      active ? "bg-maroon text-gold border-maroon" : "border-[#e6dcc4] text-[#6d6358]"
                    }`}
                  >
                    {s.name} (+{formatFcfa(s.price)})
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={handleAdd}
            disabled={!selectedProduct || (productVariants.length > 0 && !selectedVariant)}
            className="py-2.5 rounded-xl bg-maroon text-gold font-bold text-sm disabled:opacity-50"
          >
            + Ajouter l&apos;article
          </button>
        </div>
      )}
    </div>
  );
}
