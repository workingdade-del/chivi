import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useStaffNotificationsStore, isConversationUnread } from "@/lib/store/staff-notifications";

interface ConversationRow {
  normalized_phone: string;
  last_direction: "inbound" | "outbound";
  last_message_at: string;
}

/** Compte les conversations avec un dernier message entrant plus récent que la dernière ouverture — utilisé pour le badge Conversations dans les deux sidebars. */
export function useUnreadConversations(): number {
  const [count, setCount] = useState(0);
  const lastViewedByPhone = useStaffNotificationsStore((s) => s.lastViewedByPhone);

  const recompute = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("all_conversations")
      .select("normalized_phone, last_direction, last_message_at");
    const rows = (data ?? []) as ConversationRow[];
    const unread = rows.filter((r) =>
      isConversationUnread(lastViewedByPhone, r.normalized_phone, r.last_direction, r.last_message_at)
    ).length;
    setCount(unread);
  }, [lastViewedByPhone]);

  useEffect(() => {
    recompute();
    const supabase = createClient();
    const channel = supabase
      .channel(`unread-conversations:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages" }, recompute)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [recompute]);

  return count;
}
