"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Rafraîchit silencieusement les données serveur de la page (router.refresh)
 * dès qu'une des tables listées change — pas de rechargement complet,
 * juste un re-fetch + re-render de ce que le Server Component a déjà rendu.
 */
export function RealtimeRefresh({ tables }: { tables: string[] }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    // Nom unique par montage : deux montages successifs (Fast Refresh,
    // navigation rapide) ne doivent jamais partager un nom de canal —
    // Supabase peut sinon router les évènements vers une souscription
    // déjà démontée.
    const channel = supabase.channel(`realtime-refresh:${tables.join(",")}:${Math.random().toString(36).slice(2)}`);

    for (const table of tables) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => router.refresh());
    }
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(","), router]);

  return null;
}
