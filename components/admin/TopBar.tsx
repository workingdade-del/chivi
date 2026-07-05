"use client";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

const TITLES: { match: (p: string) => boolean; title: string; sub: string }[] = [
  { match: (p) => p === "/admin", title: "Dashboard", sub: "Aperçu du service" },
  { match: (p) => /^\/admin\/orders\/[^/]+$/.test(p), title: "Détail commande", sub: "Suivi et affectation" },
  { match: (p) => p.startsWith("/admin/orders"), title: "Commandes", sub: "Toutes les commandes" },
  { match: (p) => p.startsWith("/admin/conversations"), title: "Conversations", sub: "WhatsApp — IA et prises en main manuelles" },
  { match: (p) => p.startsWith("/admin/drivers"), title: "Livreurs", sub: "Disponibilité et courses en temps réel" },
  { match: (p) => p.startsWith("/admin/menu"), title: "Gestion du menu", sub: "Activer, désactiver et tarifer les plats" },
  { match: (p) => p.startsWith("/admin/reports"), title: "Rapport financier", sub: "Revenus, coûts et marges" },
  { match: (p) => /^\/admin\/clients\/[^/]+$/.test(p), title: "Fiche client", sub: "Historique et dépenses" },
  { match: (p) => p.startsWith("/admin/clients"), title: "Clients", sub: "Profils créés automatiquement via WhatsApp" },
];

export function TopBar() {
  const pathname = usePathname();
  const { title, sub } = TITLES.find((t) => t.match(pathname)) ?? TITLES[0];

  return (
    <div className="flex-none h-[66px] border-b border-[#e6dcc6] flex items-center justify-between px-7">
      <div>
        <div className="font-display text-xl text-maroon uppercase tracking-wide leading-none">{title}</div>
        <div className="text-xs text-[#9a8b78] mt-[3px]">{sub}</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-white border border-[#e6dcc6] rounded-full px-3.5 py-2 text-[#8a7f6e] text-sm w-[230px]">
          <Search size={15} strokeWidth={2} />
          Rechercher…
        </div>
        <div className="flex items-center gap-1.5 bg-status-green-bg rounded-full px-3.5 py-2 text-status-green-deep text-[12.5px] font-semibold">
          <span className="w-2 h-2 rounded-full bg-status-green animate-pulse" />
          Service ouvert
        </div>
      </div>
    </div>
  );
}
