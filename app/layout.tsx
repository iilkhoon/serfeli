import type { Metadata } from "next";
import "./design.css";
import "./pages.css";
import "./responsive.css";
import "./commerce.css";
import "./home.css";
import "./matching.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://qepik-az.mythicfern36.chatgpt.site"),
  title: "Qəpik — Qiyməti bil. Ağıllı seç.",
  description:
    "Azərbaycan mağazalarının qiymətlərini, çatdırılma və ödəniş şərtlərini bir yerdə müqayisə edin.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#73518c" };

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
