import type { Metadata, Viewport } from "next";
import { Sidebar } from "@/components/admin/Sidebar";
import { TopBar } from "@/components/admin/TopBar";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";

export const metadata: Metadata = {
  title: "CHIVI Admin",
  description: "Console d'administration CHIVI.",
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "CHIVI Admin" },
  icons: { icon: "/icons/icon-512.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#7C0000" };

export default function AdminShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-app-admin flex">
      <RegisterServiceWorker scope="admin" />
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        <div className="flex-1 overflow-y-auto px-7 pt-6 pb-8">{children}</div>
      </div>
    </div>
  );
}
