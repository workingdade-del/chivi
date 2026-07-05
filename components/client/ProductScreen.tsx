"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Minus, Plus } from "lucide-react";
import type { MenuProduct, MenuSupplement } from "@/lib/menu";
import { formatFcfa } from "@/lib/format";
import { getMenuImageUrl } from "@/lib/menu-image";
import { useCartStore } from "@/lib/store/cart";
import { MenuImage } from "@/components/client/MenuImage";

const GROUP_TITLES: Record<string, string> = {
  Protéine: "Choisis ta protéine",
  Pâte: "Choisis ta pâte",
  Taille: "Choisis la taille",
  Option: "Choisis ton option",
};

export function ProductScreen({
  product,
  supplements,
}: {
  product: MenuProduct;
  supplements: MenuSupplement[];
}) {
  const router = useRouter();
  const addLine = useCartStore((s) => s.addLine);

  const groups = useMemo(() => {
    const byGroup = new Map<string, typeof product.variants>();
    for (const v of product.variants) {
      if (!byGroup.has(v.groupLabel)) byGroup.set(v.groupLabel, []);
      byGroup.get(v.groupLabel)!.push(v);
    }
    return [...byGroup.entries()];
  }, [product]);

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedSupplements, setSelectedSupplements] = useState<string[]>([]);
  const [qty, setQty] = useState(1);

  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId) ?? null;
  const unitPrice = selectedVariant ? selectedVariant.price : product.basePrice;
  const supplementsTotal = selectedSupplements.reduce((sum, id) => {
    const s = supplements.find((x) => x.id === id);
    return sum + (s?.price ?? 0);
  }, 0);
  const total = (unitPrice + supplementsTotal) * qty;

  const imageUrl = getMenuImageUrl(product.imagePath);

  function toggleSupplement(id: string) {
    setSelectedSupplements((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleAddToCart() {
    const chosenSupplements = selectedSupplements
      .map((id) => supplements.find((s) => s.id === id))
      .filter(Boolean)
      .map((s) => ({ supplementId: s!.id, name: s!.name, price: s!.price }));

    addLine({
      productId: product.id,
      productVariantId: selectedVariant?.id ?? null,
      name: product.name,
      variantName: selectedVariant?.name ?? null,
      detail: [selectedVariant?.name, ...chosenSupplements.map((s) => s.name)].filter(Boolean).join(" · "),
      unitPrice,
      qty,
      supplements: chosenSupplements,
    });

    router.push("/client/cart");
  }

  return (
    <div>
      <div className="h-[270px] relative flex items-center justify-center bg-[repeating-linear-gradient(135deg,#ece0c4_0_16px,#e4d5b3_16px_32px)]">
        <MenuImage src={imageUrl} alt={product.name} />
        <button
          onClick={() => router.back()}
          className="absolute top-11 left-4 w-[42px] h-[42px] rounded-full bg-black/55 text-white flex items-center justify-center"
        >
          <ArrowLeft size={20} strokeWidth={2.4} />
        </button>
      </div>

      <div className="px-[18px] pt-5 pb-2">
        <div className="font-bold text-2xl text-ink">{product.name}</div>
        <div className="font-mega text-[26px] text-maroon-deep mt-1 leading-none">
          {formatFcfa(unitPrice)}
        </div>
        {product.description && (
          <div className="text-sm text-[#7c7166] mt-3 leading-relaxed">{product.description}</div>
        )}
      </div>

      {groups.map(([groupLabel, variants]) => (
        <div key={groupLabel} className="px-[18px] pt-3.5">
          <div className="font-display text-[13px] tracking-[.05em] uppercase text-maroon">
            {GROUP_TITLES[groupLabel] ?? `Choisis : ${groupLabel}`}
          </div>
          <div className="flex gap-2.5 mt-2.5 flex-wrap">
            {variants.map((v) => {
              const active = selectedVariantId === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedVariantId(active ? null : v.id)}
                  className={`px-4 py-2.5 rounded-[13px] border-2 font-semibold text-sm ${
                    active
                      ? "border-maroon bg-maroon text-gold font-bold"
                      : "border-[#e6dcc4] bg-white text-ink"
                  }`}
                >
                  {v.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {supplements.length > 0 && (
        <div className="px-[18px] pt-4.5">
          <div className="font-display text-[13px] tracking-[.05em] uppercase text-maroon">
            Suppléments
          </div>
          <div className="mt-2.5 flex flex-col gap-2.5">
            {supplements.map((s) => {
              const on = selectedSupplements.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleSupplement(s.id)}
                  className={`flex items-center justify-between gap-2.5 px-[15px] py-3 rounded-[15px] border-2 text-left ${
                    on ? "border-maroon bg-[#fff6e5]" : "border-[#e6dcc4] bg-white"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className={`w-[22px] h-[22px] rounded-[7px] border-2 flex items-center justify-center text-white ${
                        on ? "border-maroon bg-maroon" : "border-[#e6dcc4] bg-transparent"
                      }`}
                    >
                      {on && <Check size={13} strokeWidth={3.2} />}
                    </span>
                    <span className="font-semibold text-[14.5px] text-ink">{s.name}</span>
                  </span>
                  <span className="font-mega text-[15px] text-maroon-deep">+{formatFcfa(s.price)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-[18px] pt-5 flex items-center justify-between">
        <span className="font-display text-[13px] tracking-[.05em] uppercase text-maroon">Quantité</span>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="w-[42px] h-[42px] rounded-[13px] border-2 border-[#e2d6bd] bg-white text-maroon flex items-center justify-center"
          >
            <Minus size={18} strokeWidth={2.8} />
          </button>
          <span className="font-mega text-[22px] text-ink min-w-[24px] text-center">{qty}</span>
          <button
            onClick={() => setQty((q) => q + 1)}
            className="w-[42px] h-[42px] rounded-[13px] bg-amber text-maroon-deep flex items-center justify-center"
          >
            <Plus size={18} strokeWidth={2.8} />
          </button>
        </div>
      </div>

      <div className="h-[26px]" />
      <div className="sticky bottom-0 bg-gradient-to-t from-app-client via-app-client to-transparent px-4 pt-3.5 pb-[18px]">
        <button
          onClick={handleAddToCart}
          className="w-full py-[17px] rounded-[18px] bg-maroon text-gold font-bold text-base flex items-center justify-between px-5 shadow-hard-maroon"
        >
          <span>Ajouter au panier</span>
          <span className="font-mega">{formatFcfa(total)}</span>
        </button>
      </div>
    </div>
  );
}
