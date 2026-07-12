import type { Metadata, Viewport } from "next";
import { Sidebar } from "@/components/admin/Sidebar";
import { TopBar } from "@/components/admin/TopBar";
import { PauseBanner } from "@/components/admin/PauseBanner";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";
import { InboundMessageNotifier } from "@/components/shared/InboundMessageNotifier";
import { getSystemSettings } from "@/lib/system-settings";

export const metadata: Metadata = {
  title: "CHIVI Admin",
  description: "Console d'administration CHIVI.",
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "CHIVI Admin" },
  icons: { icon: "/icons/icon-512.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#7C0000" };

export default async function AdminShellLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSystemSettings();

  return (
    <div className="h-screen bg-app-admin flex flex-col">
      <RegisterServiceWorker scope="admin" />
      <InboundMessageNotifier />
      <PauseBanner initial={settings} />
      <div className="flex-1 min-h-0 flex">
        <Sidebar />
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <TopBar initialPaused={settings.isPaused} />
          <div className="flex-1 min-h-0 overflow-y-auto px-7 pt-6 pb-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
