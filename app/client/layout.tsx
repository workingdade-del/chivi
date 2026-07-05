import type { Metadata, Viewport } from "next";
import { BottomNav } from "@/components/client/BottomNav";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";

export const metadata: Metadata = {
  title: "CHIVI — Commander",
  description: "Commande tes plats CHIVI à Cotonou. La cuillère ne ment jamais.",
  manifest: "/client/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "CHIVI" },
  icons: { icon: "/icons/icon-512.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#7C0000" };

export default function ClientAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex justify-center bg-[#241d1a]">
      <RegisterServiceWorker scope="client" />
      <div className="w-full max-w-[430px] min-h-screen bg-app-client flex flex-col relative">
        <div className="flex-1 overflow-y-auto">{children}</div>
        <BottomNav />
      </div>
    </div>
  );
}
