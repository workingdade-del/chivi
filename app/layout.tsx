import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CHIVI",
  description: "CHIVI — dark kitchen à Cotonou. La cuillère ne ment jamais.",
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
