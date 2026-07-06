import { createClient } from "@/lib/supabase/server";

export interface SystemSettings {
  isPaused: boolean;
  pauseReason: string | null;
  pausedAt: string | null;
}

const DEFAULT_SETTINGS: SystemSettings = { isPaused: false, pauseReason: null, pausedAt: null };

export async function getSystemSettings(): Promise<SystemSettings> {
  const supabase = createClient();
  const { data } = await supabase
    .from("system_settings")
    .select("is_paused, pause_reason, paused_at")
    .eq("id", true)
    .maybeSingle();

  if (!data) return DEFAULT_SETTINGS;

  return { isPaused: data.is_paused, pauseReason: data.pause_reason, pausedAt: data.paused_at };
}
