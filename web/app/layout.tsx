import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import { SITE_ORIGIN } from "@/lib/data";
import "./globals.css";

export const metadata: Metadata = {
  // Link previews show opengraph-image.png (drawn from the data), which needs an absolute address.
  metadataBase: new URL(SITE_ORIGIN),
  title: "NetAtlas TR",
  description: "Türkiye ev interneti atlası: ölçülen sabit internet hızları, 475 m'lik karelerde.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
