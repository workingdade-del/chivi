"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, MapPin } from "lucide-react";
import type { MenuProduct } from "@/lib/menu";
import type { ProductCategory } from "@/lib/supabase/types";
import { formatFcfa } from "@/lib/format";
import { getMenuImageUrl } from "@/lib/menu-image";
import { MenuImage } from "@/components/client/MenuImage";

function greeting(): string {
  const hour = new Date().getHours();
  return hour >= 18 || hour < 5 ? "Bonsoir" : "Bonjour";
}

export function MenuScreen({
  products,
  categories,
}: {
  products: MenuProduct[];
  categories: { id: ProductCategory; name: string }[];
}) {
  const [category, setCategory] = useState<ProductCategory>(categories[0]?.id ?? "plats_chivi");

  const filtered = useMemo(() => products.filter((p) => p.category === category), [products, category]);

  return (
    <div>
      <div className="hidden lg:flex items-center justify-between px-8 py-3 bg-maroon-deep">
        <div
          className="w-32 h-9 bg-left bg-contain bg-no-repeat"
          style={{ backgroundImage: "url('/brand_kit/assets/logo/chivi-wordmark-gold.png')" }}
        />
        <div className="font-display text-gold text-[13px] tracking-[.08em] uppercase">
          La cuillère ne ment jamais
        </div>
        <div className="bg-chilli text-white text-xs font-bold px-4 py-1.5 rounded-full">
          🎉 Livraison offerte dès 2 plats commandés
        </div>
      </div>

      <div className="sticky top-0 z-20 bg-maroon px-5 lg:px-8 pt-[34px] lg:pt-6 pb-4">
        <div className="flex items-center justify-between lg:hidden">
          <div
            className="w-28 h-[34px] bg-left bg-contain bg-no-repeat"
            style={{ backgroundImage: "url('/brand_kit/assets/logo/chivi-wordmark-gold.png')" }}
          />
          <div className="flex items-center gap-1.5 bg-white/[.12] rounded-full px-3 py-1.5 text-cream text-xs font-semibold">
            <MapPin size={14} />
            Cotonou
          </div>
        </div>
        <div className="mt-3.5 lg:mt-0 font-product font-bold text-white text-[22px] leading-tight">
          {greeting()} 👋 <span className="text-gold">on mange quoi ?</span>
        </div>
        <div className="flex gap-2.5 mt-4 overflow-x-auto pb-0.5">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-4 py-2.5 rounded-full whitespace-nowrap font-bold text-[13px] transition-colors ${
                category === cat.id ? "bg-amber text-maroon-deep" : "bg-white/[.14] text-cream font-semibold"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-6 lg:p-8 pb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 md:gap-5">
        {filtered.map((p) => {
          const imageUrl = getMenuImageUrl(p.imagePath);
          return (
            <Link
              key={p.id}
              href={`/client/product/${p.id}`}
              className="bg-white rounded-[22px] overflow-hidden shadow-card block"
            >
              <div className="h-[132px] relative flex items-end justify-start p-2.5 bg-[repeating-linear-gradient(135deg,#ece0c4_0_14px,#e4d5b3_14px_28px)]">
                <MenuImage src={imageUrl} alt={p.name} />
                {p.isNew && (
                  <span className="absolute top-2.5 left-2.5 bg-chilli text-white font-flash text-[11px] font-extrabold tracking-wide px-2.5 py-1 rounded-md -rotate-[4deg] z-10">
                    NEW
                  </span>
                )}
              </div>
              <div className="px-[15px] pt-[13px] pb-[15px] flex items-end justify-between gap-2.5">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base text-ink">{p.name}</div>
                  {p.description && (
                    <div className="text-[12.5px] text-[#8a7f74] mt-[3px] leading-[1.35] line-clamp-2">
                      {p.description}
                    </div>
                  )}
                  <div className="mt-[9px] text-[11px] text-[#b0a596] tracking-[.04em] uppercase">
                    À partir de
                  </div>
                  <div className="font-mega text-[21px] text-maroon-deep leading-none">
                    {formatFcfa(p.basePrice)}
                  </div>
                </div>
                <span className="flex-none w-[42px] h-[42px] rounded-2xl bg-amber text-maroon-deep flex items-center justify-center shadow-[0_6px_14px_-6px_rgba(246,188,19,.9)]">
                  <Plus size={20} strokeWidth={2.6} />
                </span>
              </div>
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-ink/60 py-10 text-sm">Aucun plat dans cette catégorie.</div>
        )}
      </div>
    </div>
  );
}
