import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import RegionDetails from "@/components/RegionDetails";
import { NATIONAL, periodText } from "@/lib/data";
import { formatNumber, formatValue } from "@/lib/format";
import { LOW_TESTS, metricById } from "@/lib/metrics";
import { readDistricts, readProvinces } from "@/lib/serverData";
import { slugify } from "@/lib/slug";
import styles from "../il.module.css";

const DOWNLOAD = metricById("indirme");
const UPLOAD = metricById("yukleme");
const LATENCY = metricById("gecikme");

// Only the 81 provinces exist; the site is static.
export const dynamicParams = false;

export async function generateStaticParams() {
  const { iller } = await readProvinces();
  return Object.entries(iller)
    .filter(([code]) => code !== NATIONAL)
    .map(([, province]) => ({ slug: slugify(province.ad) }));
}

async function load(slug: string) {
  const data = await readProvinces();
  const entry = Object.entries(data.iller).find(([code, p]) => code !== NATIONAL && slugify(p.ad) === slug);
  if (!entry) notFound();
  const [code, province] = entry;
  const current = data.donemler[data.donemler.length - 1];
  return { data, code, province, current };
}

export async function generateMetadata({ params }: PageProps<"/il/[slug]">): Promise<Metadata> {
  const { province, current } = await load((await params).slug);
  const v = province.hiz[current.id];
  return {
    title: `${province.ad} ev interneti hızı · NetAtlas TR`,
    description: `${province.ad}: ortalama sabit internet indirme hızı ${formatValue(DOWNLOAD, v.indirme_mbps)} `
      + `(${periodText(current)}), 2019'dan bugüne değişim, ilçeler ve BTK erişim verisi.`,
  };
}

export default async function ProvincePage({ params }: PageProps<"/il/[slug]">) {
  const { data, code, province, current } = await load((await params).slug);
  const national = data.iller[NATIONAL];
  const v = province.hiz[current.id];
  const ranked = Object.entries(data.iller)
    .filter(([c]) => c !== NATIONAL)
    .sort(([, a], [, b]) => b.hiz[current.id].indirme_mbps - a.hiz[current.id].indirme_mbps);
  const rank = ranked.findIndex(([c]) => c === code) + 1;

  const districts = Object.entries(await readDistricts())
    .filter(([, d]) => d.il_kodu === code)
    .map(([, d]) => d)
    .sort((a, b) => {
      const x = a.hiz[current.id]?.indirme_mbps;
      const y = b.hiz[current.id]?.indirme_mbps;
      if (x == null || y == null) return x == null ? (y == null ? a.ad.localeCompare(b.ad, "tr") : 1) : -1;
      return y - x;
    });

  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Gezinme">
        <Link href="/">← Harita</Link>
        <Link href="/il/">Tüm iller</Link>
      </nav>
      <h1>{province.ad}</h1>
      <p className={styles.lead}>
        Ortalama sabit internet indirme hızı {formatValue(DOWNLOAD, v.indirme_mbps)} (Türkiye{" "}
        {formatValue(DOWNLOAD, national.hiz[current.id].indirme_mbps)}). İndirme hızında 81 il arasında {rank}. sırada.
        Dönem: {periodText(current)}.
      </p>

      <div className={styles.details}>
        <RegionDetails
          area={province}
          province={province}
          national={national}
          isDistrict={false}
          periods={data.donemler}
          period={current}
          metric={DOWNLOAD}
        />
      </div>

      <h2>İlçeler</h2>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <caption className={styles.muted} style={{ captionSide: "bottom", padding: 8, textAlign: "left" }}>
            {periodText(current)}, indirme hızına göre sıralı. 2019 sütunu karşılaştırma için.
          </caption>
          <thead>
            <tr>
              <th scope="col">İlçe</th>
              <th scope="col" className={styles.num}>İndirme</th>
              <th scope="col" className={styles.num}>Yükleme</th>
              <th scope="col" className={styles.num}>Gecikme</th>
              <th scope="col" className={styles.num}>Test</th>
              <th scope="col" className={styles.num}>2019 indirme</th>
            </tr>
          </thead>
          <tbody>
            {districts.map((d) => {
              const now = d.hiz[current.id];
              const then = d.hiz["2019"];
              return (
                <tr key={d.ad}>
                  <th scope="row" style={{ fontWeight: 400 }}>
                    {d.ad}
                    {now && now.test < LOW_TESTS && <span className={styles.muted}> (az test)</span>}
                  </th>
                  {now ? (
                    <>
                      <td className={styles.num}>{formatValue(DOWNLOAD, now.indirme_mbps)}</td>
                      <td className={styles.num}>{formatValue(UPLOAD, now.yukleme_mbps)}</td>
                      <td className={styles.num}>{formatValue(LATENCY, now.gecikme_ms)}</td>
                      <td className={styles.num}>{formatNumber(now.test)}</td>
                    </>
                  ) : (
                    <td colSpan={4} className={styles.muted}>Bu dönemde ölçüm yok</td>
                  )}
                  <td className={styles.num}>{then ? formatValue(DOWNLOAD, then.indirme_mbps) : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={styles.footnote}>
        Değerler, ilçedeki Speedtest ölçümlerinin test ağırlıklı ortalamasıdır; {LOW_TESTS}&apos;dan az testli değerler belirsizdir.
      </p>
    </main>
  );
}
