"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Receipt, Boxes, Calculator, MessagesSquare } from "lucide-react";
import { CUISINE_NAV } from "@/lib/cuisine-nav";

const ICONS = { ClipboardList, Receipt, Boxes, Calculator, MessagesSquare };

/** Barre de navigation mobile — comme une vraie app, fixée en bas de l'écran. */
export function CuisineBottomNav() {
  const pathname = usePathname();

  return (
    <div className="flex md:hidden flex-none bg-chivi-black border-t border-[#2a1010] px-1 pt-1.5 pb-[max(6px,env(safe-area-inset-bottom))]">
      {CUISINE_NAV.map((n) => {
        const active = n.match(pathname);
        const Icon = ICONS[n.icon];
        return (
          <Link
            key={n.href}
            href={n.href}
            className="flex-1 flex flex-col items-center justify-center gap-1 min-h-[48px] py-1.5"
            style={{ color: active ? "var(--chivi-amber)" : "#8a6b5c" }}
          >
            <Icon size={21} strokeWidth={2} />
            <span className="text-[10px] font-semibold tracking-wide">{n.shortLabel}</span>
          </Link>
        );
      })}
    </div>
  );
}
