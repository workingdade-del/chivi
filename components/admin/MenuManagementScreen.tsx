"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatFcfa } from "@/lib/format";

interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  isAvailable: boolean;
}

export function MenuManagementScreen({ initialItems }: { initialItems: MenuItem[] }) {
  const [items, setItems] = useState(initialItems);

  async function toggle(id: string, current: boolean) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isAvailable: !current } : i)));
    const supabase = createClient();
    await supabase.from("products").update({ is_available: !current }).eq("id", id);
  }

  return (
    <div className="bg-white border border-[#ece2cd] rounded-2xl overflow-hidden">
      <div
        className="grid gap-3 px-5 py-3.5 bg-[#faf4e8] border-b border-[#efe6d3] text-[11px] tracking-wide uppercase text-[#9a8b78] font-semibold"
        style={{ gridTemplateColumns: "2fr 1.2fr 1fr 130px" }}
      >
        <span>Plat</span>
        <span>Catégorie</span>
        <span>Prix</span>
        <span>Disponible</span>
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          className="grid gap-3 px-5 py-3.5 border-b border-[#f3ecdd] items-center"
          style={{ gridTemplateColumns: "2fr 1.2fr 1fr 130px" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-[42px] h-[42px] flex-none rounded-xl bg-[repeating-linear-gradient(135deg,#ece0c4_0_8px,#e4d5b3_8px_16px)]" />
            <b className={`font-semibold text-sm ${item.isAvailable ? "text-ink" : "text-[#b9ad9c] line-through"}`}>
              {item.name}
            </b>
          </div>
          <span className="text-[13px] text-[#8a7f6e]">{item.category}</span>
          <span className="font-mega text-[15px] text-maroon-deep">{formatFcfa(item.price)}</span>
          <button
            onClick={() => toggle(item.id, item.isAvailable)}
            className="w-[52px] h-[29px] rounded-full relative"
            style={{ background: item.isAvailable ? "#1b9c53" : "#d8ccb5" }}
          >
            <span
              className="absolute top-[3px] w-[23px] h-[23px] rounded-full bg-white transition-all"
              style={{ left: item.isAvailable ? "26px" : "3px" }}
            />
          </button>
        </div>
      ))}
    </div>
  );
}
