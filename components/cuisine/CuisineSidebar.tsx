"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ClipboardList, Receipt, Boxes, Calculator, MessagesSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CUISINE_NAV } from "@/lib/cuisine-nav";

const ICONS = { ClipboardList, Receipt, Boxes, Calculator, MessagesSquare };

/** Rail de navigation desktop/tablette — équivalent du Sidebar Admin, thème sombre cuisine. */
export function CuisineSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/cuisine/login");
    router.refresh();
  }

  return (
    <div className="hidden md:flex flex-none w-[220px] bg-chivi-black flex-col p-3.5 box-border border-r border-[#2a1010]">
      <div className="flex items-center gap-2.5 px-2 pb-5">
        <div
          className="w-[110px] h-8 bg-left bg-contain bg-no-repeat"
          style={{ backgroundImage: "url('/brand_kit/assets/logo/chivi-wordmark-gold.png')" }}
        />
      </div>
      <div className="text-[10px] tracking-[.14em] uppercase text-[#a07d6d] px-3 pb-2">Cuisine</div>

      {CUISINE_NAV.map((n) => {
        const active = n.match(pathname);
        const Icon = ICONS[n.icon];
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`flex items-center gap-3 w-full px-3 py-2.5 mb-[3px] rounded-xl text-sm ${
              active ? "bg-amber text-maroon-deep font-bold" : "text-cream font-semibold"
            }`}
          >
            <Icon size={19} strokeWidth={2} className={active ? "" : "opacity-85"} />
            <span className="flex-1">{n.label}</span>
          </Link>
        );
      })}

      <button
        onClick={handleLogout}
        className="mt-auto bg-white/[.06] rounded-2xl px-3.5 py-3 flex items-center gap-2.5 text-left"
      >
        <div className="w-9 h-9 flex-none rounded-full bg-amber text-maroon-deep flex items-center justify-center font-mega text-sm">
          C
        </div>
        <div className="min-w-0">
          <div className="text-white font-bold text-[13px] truncate">Équipe cuisine</div>
          <div className="text-[#a07d6d] text-[11px]">Se déconnecter</div>
        </div>
      </button>
    </div>
  );
}
