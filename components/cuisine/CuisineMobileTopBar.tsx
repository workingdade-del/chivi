"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function CuisineMobileTopBar() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/cuisine/login");
    router.refresh();
  }

  return (
    <div className="flex md:hidden flex-none items-center justify-between px-3 py-2 bg-app-cuisine-deep border-b border-[#2a1010]">
      <div
        className="w-[80px] h-6 bg-left bg-contain bg-no-repeat"
        style={{ backgroundImage: "url('/brand_kit/assets/logo/chivi-wordmark-gold.png')" }}
      />
      <button
        onClick={handleLogout}
        className="flex items-center gap-1.5 text-[#a07d6d] text-xs font-semibold min-h-[36px] px-2"
      >
        <LogOut size={15} />
        Déconnexion
      </button>
    </div>
  );
}
