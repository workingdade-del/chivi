import type { Metadata, Viewport } from "next";
import { BottomNav } from "@/components/client/BottomNav";
import { CartSidebar } from "@/components/client/CartSidebar";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";

export const metadata: Metadata = {
  title: "CHIVI — Commander à Cotonou",
  description: "Commande tes plats CHIVI à Cotonou. La cuillère ne ment jamais.",
  manifest: "/client/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "CHIVI" },
  icons: { icon: "/icons/icon-512.png", apple: "/icons/apple-touch-icon.png" },
  openGraph: {
    title: "CHIVI — Commander à Cotonou",
    description: "Commande tes plats CHIVI à Cotonou. La cuillère ne ment jamais.",
    images: ["/brand_kit/assets/logo/chivi-wordmark-gold.png"],
    locale: "fr_FR",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#7C0000" };

export default function ClientAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex justify-center bg-[#241d1a]">
      <RegisterServiceWorker scope="client" />
      <div className="w-full max-w-[430px] md:max-w-none min-h-screen bg-app-client flex md:flex-row flex-col relative">
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 overflow-y-auto">{children}</div>
          <BottomNav />
        </div>
        <CartSidebar />
      </div>
    </div>
  );
}
