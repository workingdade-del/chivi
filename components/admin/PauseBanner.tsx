"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface PauseState {
  isPaused: boolean;
  pauseReason: string | null;
  pausedAt: string | null;
}

export function PauseBanner({ initial }: { initial: PauseState }) {
  const [state, setState] = useState(initial);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`system-settings-banner:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "system_settings" },
        (payload) => {
          const row = payload.new as { is_paused: boolean; pause_reason: string | null; paused_at: string | null };
          setState({ isPaused: row.is_paused, pauseReason: row.pause_reason, pausedAt: row.paused_at });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (!state.isPaused) return null;

  return (
    <div className="flex-none w-full bg-chilli text-white px-6 py-2.5 flex items-center gap-2.5 text-sm font-semibold">
      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
      Système en pause — {state.pauseReason}
      {state.pausedAt && (
        <span className="opacity-80 font-normal">
          depuis{" "}
          {new Date(state.pausedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
    </div>
  );
}
