import type { Metadata } from "next";
import Link from "next/link";
import styles from "./pages.module.css";

export const metadata: Metadata = {
  title: "Sayfa bulunamadı · NetAtlas TR",
};

/** Any address the site has no page for (GitHub Pages serves it as 404.html). */
export default function NotFound() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Gezinme">
        <Link href="/">← Harita</Link>
        <Link href="/il/">Tüm iller</Link>
        <Link href="/yontem/">Yöntem</Link>
      </nav>
      <h1>Sayfa bulunamadı</h1>
      <p className={styles.lead}>
        Bu adreste bir sayfa yok; adres yanlış yazılmış ya da değişmiş olabilir. Haritaya dönebilir ya da bir ili
        tüm iller listesinden açabilirsin.
      </p>
    </main>
  );
}
