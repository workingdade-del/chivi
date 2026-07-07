import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CHIVI",
  description: "CHIVI — dark kitchen à Cotonou. La cuillère ne ment jamais.",
  openGraph: {
    title: "CHIVI",
    description: "CHIVI — dark kitchen à Cotonou. La cuillère ne ment jamais.",
    images: ["/brand_kit/assets/logo/chivi-wordmark-gold.png"],
    locale: "fr_FR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <link rel="stylesheet" href="/brand_kit/styles.css" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
