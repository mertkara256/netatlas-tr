import type { Metadata, Viewport } from "next";
import { SITE_ORIGIN } from "@/lib/data";
import "./globals.css";

export const metadata: Metadata = {
  // Link previews show opengraph-image.png (drawn from the data), which needs an absolute address.
  metadataBase: new URL(SITE_ORIGIN),
  title: "NetAtlas TR · Türkiye'nin ev interneti haritası",
  description: "Türkiye'nin ev interneti, milyonlarca hız testiyle: il ve ilçelere göre ölçülen indirme, yükleme ve gecikme, 2019'dan bugüne.",
  openGraph: { siteName: "NetAtlas TR", locale: "tr_TR", type: "website" },
};

// Phone browsers colour their bar like the map page's header (--surface in globals.css).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfb" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a19" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
