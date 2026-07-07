"use client";

import { usePathname } from "next/navigation";

/** Petit fade-in CSS à chaque changement de route — pas de dépendance lourde type framer-motion. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-transition">
      {children}
    </div>
  );
}
