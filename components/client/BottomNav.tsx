"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Utensils, ShoppingBag, Receipt } from "lucide-react";
import { useCartStore, cartCount } from "@/lib/store/cart";

const NAV_ROUTES = ["/client/menu", "/client/cart", "/client/history"];

export function BottomNav() {
  const pathname = usePathname();
  const cart = useCartStore((s) => s.cart);
  const count = cartCount(cart);

  if (!NAV_ROUTES.some((r) => pathname.startsWith(r))) return null;

  const isActive = (route: string) => pathname.startsWith(route);

  return (
    <div className="flex-none bg-white border-t border-[#efe6d3] flex px-2 pt-[9px] pb-[14px]">
      <NavItem href="/client/menu" active={isActive("/client/menu")} icon={<Utensils size={23} strokeWidth={2} />} label="Menu" />
      <Link
        href="/client/cart"
        className="flex-1 flex flex-col items-center gap-1 relative"
      >
        <span className="relative inline-flex">
          <ShoppingBag
            size={23}
            strokeWidth={2}
            color={isActive("/client/cart") ? "var(--chivi-maroon)" : "#b3a794"}
          />
          {count > 0 && (
            <span className="absolute -top-1.5 -right-2 bg-chilli text-white text-[10px] font-bold min-w-[17px] h-[17px] rounded-full flex items-center justify-center px-1">
              {count}
            </span>
          )}
        </span>
        <span
          className="text-[10.5px] font-semibold tracking-wide"
          style={{ color: isActive("/client/cart") ? "var(--chivi-maroon)" : "#b3a794" }}
        >
          Panier
        </span>
      </Link>
      <NavItem
        href="/client/history"
        active={isActive("/client/history")}
        icon={<Receipt size={23} strokeWidth={2} />}
        label="Commandes"
      />
    </div>
  );
}

function NavItem({ href, active, icon, label }: { href: string; active: boolean; icon: React.ReactNode; label: string }) {
  const color = active ? "var(--chivi-maroon)" : "#b3a794";
  return (
    <Link href={href} className="flex-1 flex flex-col items-center gap-1" style={{ color }}>
      {icon}
      <span className="text-[10.5px] font-semibold tracking-wide">{label}</span>
    </Link>
  );
}
