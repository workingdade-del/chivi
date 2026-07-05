"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SplashPage() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.replace("/client/menu"), 1500);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="absolute inset-0 bg-maroon flex flex-col items-center justify-center gap-[26px] min-h-screen">
      <div
        className="w-[220px] h-24 bg-center bg-contain bg-no-repeat animate-[chiviPop_.5s_ease_both]"
        style={{ backgroundImage: "url('/brand_kit/assets/logo/chivi-wordmark-gold.png')" }}
      />
      <div className="font-display text-gold text-[15px] tracking-[.06em] uppercase text-center max-w-[250px] leading-tight">
        La cuillère ne ment jamais
      </div>
      <div className="w-[30px] h-[30px] rounded-full border-[3px] border-gold/25 border-t-gold animate-spin mt-1.5" />
    </div>
  );
}
