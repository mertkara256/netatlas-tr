import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import { SITE_ORIGIN } from "@/lib/data";
import "./globals.css";

export const metadata: Metadata = {
  // Link previews show opengraph-image.png (drawn from the data), which needs an absolute address.
  metadataBase: new URL(SITE_ORIGIN),
  title: "NetAtlas TR",
  description: "Türkiye'nin ev interneti, milyonlarca hız testiyle: il ve ilçelere göre ölçülen indirme, yükleme ve gecikme, 2019'dan bugüne.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
