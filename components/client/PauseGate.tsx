"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface PauseState {
  isPaused: boolean;
  pauseReason: string | null;
}

export function PauseGate({ initial, children }: { initial: PauseState; children: React.ReactNode }) {
  const [state, setState] = useState(initial);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`system-settings-client:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "system_settings" },
        (payload) => {
          const row = payload.new as { is_paused: boolean; pause_reason: string | null };
          setState({ isPaused: row.is_paused, pauseReason: row.pause_reason });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (!state.isPaused) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center text-center px-8 py-20 gap-3.5 min-h-[70vh]">
      <div className="text-5xl">😔</div>
      <div className="font-display text-lg text-maroon uppercase">Momentanément indisponible</div>
      <p className="text-sm text-ink/70 max-w-xs">
        {state.pauseReason ?? "Nous revenons très bientôt."}
      </p>
      <p className="text-xs text-ink/50 max-w-xs">Reviens un peu plus tard pour commander tes plats CHIVI.</p>
    </div>
  );
}
