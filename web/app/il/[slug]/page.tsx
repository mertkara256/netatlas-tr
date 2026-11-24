import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import RegionDetails from "@/components/RegionDetails";
import { NATIONAL, periodText } from "@/lib/data";
import { formatNumber, formatValue } from "@/lib/format";
import { formatMapHash } from "@/lib/mapHash";
import { HIGH_TESTS, LOW_TESTS, metricById } from "@/lib/metrics";
import { compareAreas } from "@/lib/order";
import { readDistricts, readProvinces } from "@/lib/serverData";
import { slugify } from "@/lib/slug";
import styles from "../../pages.module.css";

const DOWNLOAD = metricById("indirme");
const UPLOAD = metricById("yukleme");
const LATENCY = metricById("gecikme");

/** The map with the area's panel open and the area in view (lib/mapHash.ts; Atlas fits it to its box). */
const onMap = (kind: "iller" | "ilceler", code: string) => `/${formatMapHash({ selection: { kind, code } })}`;

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
    description: `${province.ad}: Speedtest ile ölçülen ortalama sabit internet indirme hızı ${formatValue(DOWNLOAD, v.indirme_mbps)} `
      + `(${periodText(current)}), 2019'dan bugüne değişim, ilçeler ve BTK erişim verisi.`,
  };
}

export default async function ProvincePage({ params }: PageProps<"/il/[slug]">) {
  const { data, code, province, current } = await load((await params).slug);
  const national = data.iller[NATIONAL];
  const v = province.hiz[current.id];
  const nationalDownload = national.hiz[current.id].indirme_mbps;
  // No exact rank among the 81: neighbouring ranks are typically under 1% apart, less than a year's
  // values move by chance, so the rank would mostly be noise. The gap to Türkiye carries the same news.
  const gap = Math.round((v.indirme_mbps / nationalDownload - 1) * 100);
  const same = formatValue(DOWNLOAD, v.indirme_mbps) === formatValue(DOWNLOAD, nationalDownload);

  const districts = Object.entries(await readDistricts())
    .filter(([, d]) => d.il_kodu === code)
    .map(([kod, d]) => ({ ...d, kod }))
    // By name first, so districts with no measurement (and equal values) stay alphabetical.
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr"))
    // As the map's table does: a few tests make the extremes, which would otherwise top the list.
    .sort(compareAreas({
      value: (d) => d.hiz[current.id]?.indirme_mbps,
      tests: (d) => d.hiz[current.id]?.test,
      dir: -1,
      reliableFirst: true,
    }));

  // The reliable values first, then the rest under a heading row (see compareAreas).
  const split = districts.findIndex((d) => (d.hiz[current.id]?.test ?? 0) < HIGH_TESTS);
  const reliable = split === -1 ? districts : districts.slice(0, split);
  const rest = split === -1 ? [] : districts.slice(split);
  const districtRow = (d: (typeof districts)[number]) => {
    const now = d.hiz[current.id];
    const then = d.hiz["2019"];
    return (
      <tr key={d.ad}>
        <th scope="row" style={{ fontWeight: 400 }}>
          {d.ad}
          {now && now.test < LOW_TESTS && <span className={styles.muted}> (az test)</span>}
          <br />
          <Link className={styles.mapLink} href={onMap("ilceler", d.kod)} aria-label={`${d.ad} haritada aç`}>Haritada aç</Link>
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
        <td className={styles.num}>
          {then ? formatValue(DOWNLOAD, then.indirme_mbps) : "–"}
          {/* On its own line, so the column stays as narrow as its header. */}
          {then && then.test < LOW_TESTS && <><br /><span className={styles.muted}>(az test)</span></>}
        </td>
      </tr>
    );
  };

  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Gezinme">
        <Link href="/">← Harita</Link>
        <Link href="/il/">Tüm iller</Link>
        <Link href="/yontem/">Yöntem</Link>
      </nav>
      <h1>{province.ad}</h1>
      <p className={styles.lead}>
        Speedtest ile ölçülen ortalama sabit internet indirme hızı {formatValue(DOWNLOAD, v.indirme_mbps)};{" "}
        {same ? "Türkiye ortalamasıyla" : gap === 0 ? "Türkiye ortalamasına" : "Türkiye ortalamasından"}{" "}
        ({formatValue(DOWNLOAD, nationalDownload)}){" "}
        {same ? "aynı" : gap === 0 ? "yakın" : `%${Math.abs(gap)} ${gap > 0 ? "yüksek" : "düşük"}`}.
        Dönem: {periodText(current)}.
      </p>
      <p style={{ margin: "8px 0 0" }}>
        <Link className={styles.mapLink} href={onMap("iller", code)}>Haritada aç</Link>
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
            {periodText(current)}, indirme hızına göre sıralı; {formatNumber(HIGH_TESTS)}&apos;den az testli ilçeler
            güvenilir olanlardan sonra, ölçümü olmayanlar en sonda. 2019 sütunu karşılaştırma için.
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
          <tbody>{reliable.map(districtRow)}</tbody>
          {rest.length > 0 && (
            <tbody>
              {/* Says why a faster district may sit below; none when only unmeasured districts follow. */}
              {rest.some((d) => d.hiz[current.id]) && (
                <tr>
                  <th scope="rowgroup" colSpan={6} className={styles.groupRow}>
                    {formatNumber(HIGH_TESTS)}&apos;den az testli ilçeler
                  </th>
                </tr>
              )}
              {rest.map(districtRow)}
            </tbody>
          )}
        </table>
      </div>
      <p className={styles.footnote}>
        Değerler, ilçedeki Speedtest ölçümlerinin cihaz ağırlıklı ortalamasıdır; {LOW_TESTS}&apos;dan az testli değerler
        belirsizdir, {HIGH_TESTS}&apos;den az testli değerler orta güvenilirliktedir.
      </p>
    </main>
  );
}
