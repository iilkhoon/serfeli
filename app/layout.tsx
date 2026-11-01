import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "../lib/seo";
import "./design.css";
import "./pages.css";
import "./responsive.css";
import "./commerce.css";
import "./home.css";
import "./matching.css";
import "./production.css";
import "./theme.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: "Qəpik — Qiyməti bil. Ağıllı seç.",
  description:
    "Azərbaycan mağazalarının qiymətlərini, çatdırılma və ödəniş şərtlərini bir yerdə müqayisə edin.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#1f5eff" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="az">
      <body className="antialiased">{children}</body>
    </html>
  );
}
