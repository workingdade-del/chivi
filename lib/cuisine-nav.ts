export interface CuisineNavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: "ClipboardList" | "Receipt" | "Boxes" | "Calculator" | "MessagesSquare";
  match: (pathname: string) => boolean;
}

export const CUISINE_NAV: CuisineNavItem[] = [
  { href: "/cuisine", label: "Tickets", shortLabel: "Tickets", icon: "ClipboardList", match: (p) => p === "/cuisine" },
  {
    href: "/cuisine/expenses",
    label: "Dépenses / Achats",
    shortLabel: "Dépenses",
    icon: "Receipt",
    match: (p) => p.startsWith("/cuisine/expenses"),
  },
  {
    href: "/cuisine/inventory",
    label: "Inventaire",
    shortLabel: "Stock",
    icon: "Boxes",
    match: (p) => p.startsWith("/cuisine/inventory"),
  },
  {
    href: "/cuisine/costs",
    label: "Coûts des plats",
    shortLabel: "Coûts",
    icon: "Calculator",
    match: (p) => p.startsWith("/cuisine/costs"),
  },
  {
    href: "/cuisine/conversations",
    label: "Conversations",
    shortLabel: "Chat",
    icon: "MessagesSquare",
    match: (p) => p.startsWith("/cuisine/conversations"),
  },
];
