"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, ClipboardList, MessagesSquare, Bike, UtensilsCrossed, BarChart3, Users, Boxes, Megaphone, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutGrid, match: (p: string) => p === "/admin" },
  { href: "/admin/orders", label: "Commandes", icon: ClipboardList, match: (p: string) => p.startsWith("/admin/orders") },
  { href: "/admin/conversations", label: "Conversations", icon: MessagesSquare, match: (p: string) => p.startsWith("/admin/conversations") },
  { href: "/admin/drivers", label: "Livreurs", icon: Bike, match: (p: string) => p.startsWith("/admin/drivers") },
  { href: "/admin/menu", label: "Gestion menu", icon: UtensilsCrossed, match: (p: string) => p.startsWith("/admin/menu") },
  { href: "/admin/stocks", label: "Stocks", icon: Boxes, match: (p: string) => p.startsWith("/admin/stocks") },
  { href: "/admin/marketing", label: "Marketing", icon: Megaphone, match: (p: string) => p.startsWith("/admin/marketing") },
  { href: "/admin/reports", label: "Rapports", icon: BarChart3, match: (p: string) => p.startsWith("/admin/reports") },
  { href: "/admin/clients", label: "Clients", icon: Users, match: (p: string) => p.startsWith("/admin/clients") },
  { href: "/admin/settings", label: "Paramètres", icon: Settings, match: (p: string) => p.startsWith("/admin/settings") },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);
  const [email, setEmail] = useState("");

  useEffect(() => {
    const supabase = createClient();

    async function fetchCount() {
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("status", ["recue", "en_preparation", "prete"]);
      setPendingCount(count ?? 0);
    }
    fetchCount();

    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));

    const channel = supabase
      .channel(`admin-sidebar-orders:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, fetchCount)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="flex-none w-[236px] bg-maroon flex flex-col p-3.5 box-border">
      <div className="flex items-center gap-2.5 px-2 pb-5">
        <div
          className="w-[120px] h-9 bg-left bg-contain bg-no-repeat"
          style={{ backgroundImage: "url('/brand_kit/assets/logo/chivi-wordmark-gold.png')" }}
        />
      </div>
      <div className="text-[10px] tracking-[.14em] uppercase text-cream/50 px-3 pb-2">Console admin</div>

      {NAV.map((n) => {
        const active = n.match(pathname);
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`flex items-center gap-3 w-full px-3 py-2.5 mb-[3px] rounded-xl text-sm ${
              active ? "bg-amber text-maroon-deep font-bold" : "text-cream font-semibold"
            }`}
          >
            <Icon size={20} strokeWidth={2} className={active ? "" : "opacity-85"} />
            <span className="flex-1">{n.label}</span>
            {n.href === "/admin/orders" && pendingCount > 0 && (
              <span
                className="text-[11px] font-bold min-w-5 h-5 rounded-full flex items-center justify-center px-1.5"
                style={
                  active
                    ? { background: "var(--chivi-maroon-deep)", color: "var(--chivi-gold)" }
                    : { background: "var(--chivi-chilli)", color: "#fff" }
                }
              >
                {pendingCount}
              </span>
            )}
          </Link>
        );
      })}

      <button
        onClick={handleLogout}
        className="mt-auto bg-black/[.18] rounded-2xl px-3.5 py-3 flex items-center gap-2.5 text-left"
      >
        <div className="w-[38px] h-[38px] flex-none rounded-full bg-amber text-maroon-deep flex items-center justify-center font-mega text-base">
          {email ? email[0].toUpperCase() : "A"}
        </div>
        <div className="min-w-0">
          <div className="text-white font-bold text-[13px] truncate">{email || "Équipe CHIVI"}</div>
          <div className="text-cream/60 text-[11px]">Se déconnecter</div>
        </div>
      </button>
    </div>
  );
}
