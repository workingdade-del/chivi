import { create } from "zustand";
import { persist } from "zustand/middleware";

interface StaffNotificationsState {
  /** Dernier instant où chaque conversation (numéro normalisé) a été ouverte, pour calculer le badge "non lu". */
  lastViewedByPhone: Record<string, string>;
  markViewed: (normalizedPhone: string) => void;
}

export const useStaffNotificationsStore = create<StaffNotificationsState>()(
  persist(
    (set, get) => ({
      lastViewedByPhone: {},
      markViewed: (normalizedPhone) =>
        set({ lastViewedByPhone: { ...get().lastViewedByPhone, [normalizedPhone]: new Date().toISOString() } }),
    }),
    { name: "chivi-staff-notifications" }
  )
);

/** Une conversation est "non lue" si son dernier message est entrant et postérieur à la dernière ouverture. */
export function isConversationUnread(
  lastViewedByPhone: Record<string, string>,
  normalizedPhone: string,
  lastDirection: "inbound" | "outbound",
  lastMessageAt: string
): boolean {
  if (lastDirection !== "inbound") return false;
  const lastViewed = lastViewedByPhone[normalizedPhone];
  if (!lastViewed) return true;
  return new Date(lastMessageAt).getTime() > new Date(lastViewed).getTime();
}
