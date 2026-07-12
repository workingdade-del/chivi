"use client";

import { useEffect, useState } from "react";
import { MessageCircle, X, BellRing } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { playNotificationPing } from "@/lib/notification-sound";

interface Toast {
  id: string;
  name: string;
  preview: string;
}

function previewOf(messageType: string, content: string | null): string {
  if (content) return content.length > 90 ? `${content.slice(0, 90)}…` : content;
  if (messageType === "audio") return "🎤 Message vocal";
  if (messageType === "image") return "📷 Image";
  if (messageType === "document") return "📄 Document";
  return "Nouveau message";
}

/**
 * Une page contrôlée par un Service Worker actif (c'est le cas ici — voir
 * RegisterServiceWorker) ne peut plus fiablement utiliser `new
 * Notification()` : Chrome l'ignore silencieusement (ou lève une
 * exception selon la version/plateforme) dès qu'un SW contrôle la page,
 * et exige `registration.showNotification()` à la place. C'est très
 * probablement pourquoi aucune notification n'apparaissait malgré la
 * permission accordée.
 */
async function showBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) {
    console.log("[notifier] Notification API absente de ce navigateur — abandon");
    return;
  }

  console.log("[notifier] Notification.permission au moment de l'appel =", Notification.permission);
  if (Notification.permission !== "granted") {
    console.log("[notifier] permission non accordée, notification système non envoyée");
    return;
  }

  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    console.log("[notifier] service worker registration =", registration ? { scope: registration.scope, active: Boolean(registration.active), installing: Boolean(registration.installing), waiting: Boolean(registration.waiting) } : null);

    if (registration) {
      try {
        console.log("[notifier] appel registration.showNotification()", { title, body });
        await registration.showNotification(title, { body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" });
        console.log("[notifier] registration.showNotification() résolu sans erreur");
        return;
      } catch (err) {
        console.error("[notifier] registration.showNotification() a levé une erreur — repli sur new Notification()", err);
      }
    }
  }

  try {
    console.log("[notifier] appel new Notification()", { title, body });
    const n = new Notification(title, { body, icon: "/icons/icon-192.png" });
    console.log("[notifier] new Notification() construit sans erreur", n);
  } catch (err) {
    console.error("[notifier] new Notification() a levé une erreur", err);
  }
}

/**
 * Notifie en direct l'arrivée d'un message WhatsApp entrant — monté une
 * seule fois au niveau du shell (Admin/Cuisine) pour rester actif peu
 * importe l'écran affiché, pas seulement sur la page Conversations.
 */
export function InboundMessageNotifier() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`inbound-message-notifier:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: "direction=eq.inbound" },
        async (payload) => {
          const row = payload.new as {
            phone: string;
            profile_id: string | null;
            driver_id: string | null;
            message_type: string;
            content: string | null;
          };

          let name = row.phone;
          if (row.profile_id) {
            const { data } = await supabase.from("profiles").select("full_name").eq("id", row.profile_id).maybeSingle();
            name = data?.full_name || row.phone;
          } else if (row.driver_id) {
            const { data } = await supabase.from("drivers").select("name").eq("id", row.driver_id).maybeSingle();
            name = data?.name || row.phone;
          }

          const preview = previewOf(row.message_type, row.content);
          const toastId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          setToasts((prev) => [...prev, { id: toastId, name, preview }]);
          setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 6000);

          playNotificationPing();
          await showBrowserNotification(`CHIVI — ${name}`, preview);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function requestPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  return (
    <>
      {permission === "default" && !bannerDismissed && (
        <div className="fixed bottom-4 left-4 z-50 bg-maroon text-cream rounded-2xl shadow-lg px-4 py-3.5 flex items-center gap-3 max-w-sm">
          <BellRing size={18} className="flex-none text-gold" />
          <div className="text-xs flex-1">
            Active les notifications pour voir les nouveaux messages même hors de cet onglet.
          </div>
          <button onClick={requestPermission} className="flex-none bg-gold text-maroon-deep font-bold text-xs px-3 py-1.5 rounded-lg">
            Activer
          </button>
          <button onClick={() => setBannerDismissed(true)} className="flex-none text-cream/70">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[320px]">
        {toasts.map((t) => (
          <div key={t.id} className="bg-white border border-[#ece2cd] shadow-lg rounded-2xl px-4 py-3 flex items-start gap-2.5">
            <MessageCircle size={18} className="flex-none text-maroon mt-0.5" />
            <div className="min-w-0">
              <div className="font-bold text-[13px] text-ink truncate">{t.name}</div>
              <div className="text-xs text-[#9a8b78] line-clamp-2">{t.preview}</div>
            </div>
            <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} className="flex-none text-[#b0a596] ml-auto">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
