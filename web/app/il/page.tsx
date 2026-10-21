import type { Metadata } from "next";
import Link from "next/link";
import { NATIONAL, periodText } from "@/lib/data";
import { formatNumber, formatValue } from "@/lib/format";
import { metricById } from "@/lib/metrics";
import { readProvinces } from "@/lib/serverData";
import { provincePath } from "@/lib/slug";
import styles from "../pages.module.css";

const DOWNLOAD = metricById("indirme");

export const metadata: Metadata = {
  title: "İller · NetAtlas TR",
  description: "Türkiye'nin 81 ilinde ölçülen sabit internet hızı, 2019'dan bugüne değişim ve BTK erişim verisi.",
};

export default async function ProvincesPage() {
  const data = await readProvinces();
  const current = data.donemler[data.donemler.length - 1];
  const lastBtk = String(data.btk_yillari[data.btk_yillari.length - 1]);
  const provinces = Object.entries(data.iller)
    .filter(([code]) => code !== NATIONAL)
    .map(([, p]) => p)
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  const national = data.iller[NATIONAL];
  const columns = (p: (typeof provinces)[number]) => [
    formatValue(DOWNLOAD, p.hiz[current.id].indirme_mbps),
    formatValue(DOWNLOAD, p.hiz["2019"].indirme_mbps),
    formatNumber(p.btk![lastBtk].abone_100, 1),
    `%${formatNumber(p.btk![lastBtk].fiber_payi * 100)}`,
  ];

  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Gezinme">
        <Link href="/">← Harita</Link>
        <Link href="/yontem/">Yöntem</Link>
      </nav>
      <h1>İller</h1>
      <p className={styles.lead}>
        81 ilde ölçülen ortalama sabit internet hızı ve BTK erişim verisi. Ayrıntı ve ilçeler için ile tıkla.
      </p>
      <div className={styles.tableScroll} style={{ marginTop: 20 }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">İl</th>
              <th scope="col" className={styles.num}>İndirme, {current.ad}</th>
              <th scope="col" className={styles.num}>İndirme, 2019</th>
              <th scope="col" className={styles.num}>100 kişiye abonelik, {lastBtk}</th>
              <th scope="col" className={styles.num}>Fiber payı, {lastBtk}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Türkiye</th>
              {columns(national).map((value, i) => <td key={i} className={styles.num}><strong>{value}</strong></td>)}
            </tr>
            {provinces.map((p) => (
              <tr key={p.ad}>
                <th scope="row" style={{ fontWeight: 400 }}><Link href={provincePath(p.ad)}>{p.ad}</Link></th>
                {columns(p).map((value, i) => <td key={i} className={styles.num}>{value}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.footnote}>
        {current.ad}: {periodText(current)}. Hız: Speedtest® by Ookla® açık verisi, test ağırlıklı ortalama. Erişim: BTK.
      </p>
    </main>
  );
}
