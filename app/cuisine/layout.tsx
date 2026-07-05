import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";

export const metadata: Metadata = {
  title: "CHIVI Cuisine",
  description: "Tableau de production cuisine CHIVI.",
  manifest: "/cuisine/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "CHIVI Cuisine" },
  icons: { icon: "/icons/icon-512.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#0A0000" };

export default function CuisineLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-app-cuisine min-h-screen">
      <RegisterServiceWorker scope="cuisine" />
      {children}
    </div>
  );
}
