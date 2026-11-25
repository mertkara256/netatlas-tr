import type { Metadata } from "next";
import Link from "next/link";
import { FiberTargetChart, OecdFiberBars } from "@/components/FiberComparison";
import FiberView, { type FiberProvince } from "@/components/FiberView";
import fiberStyles from "@/components/Fiber.module.css";
import { FIBER_TARGET, fiberLead, fiberPer100 } from "@/lib/btk";
import { NATIONAL } from "@/lib/data";
import { countOf, formatNumber, inYear, percentOf } from "@/lib/format";
import { OECD_SOURCE_URL, readOecd, readProvinces } from "@/lib/serverData";
import { provincePath } from "@/lib/slug";
import styles from "../pages.module.css";

export const metadata: Metadata = {
  title: "Fiber, telefon hattını nerede geçti? · NetAtlas TR",
  description: "Türkiye'nin 81 ilinde fiber aboneliklerinin telefon hattı (ADSL/VDSL) aboneliklerini hangi yıl geçtiği, BTK'nın il istatistikleriyle.",
};

const millions = (n: number) => `${formatNumber(n / 1e6, 1)} milyon`;

// A province among the lowest whose "Diğer" subscriptions are at least this share of its fixed ones gets a note:
// BTK does not split them by technology, so some of its fiber may be in them.
const LARGE_OTHER = 0.2;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(middle)] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** "2025 Ç4" from the OECD's "2025-Q4", and "2025 Ç4'te". */
const quarter = (period: string) => period.replace("-Q", " Ç");
const inQuarter = (period: string) => { const [year, q] = period.split("-Q"); return `${year} Ç${inYear(q)}`; };

export default async function FiberPage() {
  const data = await readProvinces();
  const years = data.btk_yillari.map(String);
  const first = years[0];
  const last = years[years.length - 1];
  const provinces: FiberProvince[] = Object.entries(data.iller)
    .filter(([code]) => code !== NATIONAL)
    .map(([code, p]) => {
      const btk = p.btk![last];
      return {
        code,
        name: p.ad,
        path: provincePath(p.ad),
        since: fiberLead(p.btk!)?.since ?? null,
        fiber: btk.fiber / btk.sabit_genisbant,
        xdsl: btk.xdsl / btk.sabit_genisbant,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const national = data.iller[NATIONAL].btk!;
  const lead = fiberLead(national);
  const ahead = provinces.filter((p) => p.since !== null).length;

  // Fiber subscriptions per 100 people, the Development Plan's measure: Türkiye's by year, the provinces' in the last year.
  const trend = years.map((year) => ({ kisa: year, etiket: year, alan: fiberPer100(national[year]) }));
  const reached = years.find((year) => fiberPer100(national[year]) > FIBER_TARGET.value);
  const perProvince = Object.values(data.iller)
    .filter((p) => p !== data.iller[NATIONAL])
    .map((p) => ({ name: p.ad, value: fiberPer100(p.btk![last]), other: p.btk![last].diger / p.btk![last].sabit_genisbant }))
    .sort((a, b) => a.value - b.value);
  const aboveTarget = perProvince.filter((p) => p.value > FIBER_TARGET.value).length;
  const lowest = perProvince.slice(0, 3);
  const highest = perProvince.slice(-3).reverse();
  const listed = (list: typeof perProvince) => {
    const items = list.map((p) => `${p.name} (${formatNumber(p.value, 1)})`);
    return `${items.slice(0, -1).join(", ")} ve ${items[items.length - 1]}`;
  };
  const targetLabel = `${FIBER_TARGET.year} hedefi: ${formatNumber(FIBER_TARGET.value, 1)}`;

  // Türkiye among the OECD members, by the OECD's own figures.
  const oecd = await readOecd();
  const period = oecd[0].donem;
  const turkey = oecd.find((r) => r.ulke_kodu === "TUR")!;
  const shareMedian = median(oecd.map((r) => r.fiber_payi));
  const per100Median = median(oecd.map((r) => r.abone_100));

  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Gezinme">
        <Link href="/">← Harita</Link>
        <Link href="/il/">İller</Link>
        <Link href="/yontem/">Yöntem</Link>
      </nav>
      <h1>Fiber, telefon hattını nerede geçti?</h1>
      <p className={styles.lead}>
        {lead
          ? `Türkiye genelinde fiber abonelikleri telefon hattı (ADSL/VDSL) aboneliklerini ${inYear(lead.since)} geçti`
          : "Türkiye genelinde telefon hattı (ADSL/VDSL) abonelikleri hâlâ fiberden fazla"}
        : {last} sonunda {millions(national[last].fiber)} fiber, {millions(national[last].xdsl)} telefon hattı aboneliği var.
        Fiber {ahead} ilde önde, {provinces.length - ahead} ilde telefon hattı hâlâ fazla. Harita her ili fiberin öne geçtiği
        yıla göre gösteriyor.
      </p>
      <FiberView provinces={provinces} years={years} />
      <p className={styles.footnote}>
        Kaynak: BTK, Yıllık İl İstatistikleri ({first}–{last}, yıl sonu). Bir ilin yılı, fiber aboneliklerinin telefon hattı
        aboneliklerinden fazla olduğu ve son yıla kadar fazla kaldığı dönemin ilk yılıdır. BTK verisi {inYear(first)}{" "}
        başladığı için o yıl fiberi zaten önde olan iller &quot;{first} ya da önce&quot; grubundadır. Kablo TV ve diğer
        abonelikler karşılaştırmaya girmez; payları il sayfalarında. <Link href="/yontem/#hesaplama">Yöntem</Link>. İl
        sınırları: OCHA COD-AB (CC BY-IGO).
      </p>

      <section className={fiberStyles.context} aria-labelledby="turkiye-nerede">
        <h2 id="turkiye-nerede">Türkiye nerede?</h2>

        <h3>Kalkınma Planı hedefi</h3>
        <p>
          12. Kalkınma Planı, {inYear(FIBER_TARGET.year)} Türkiye genelinde 100 kişiye {formatNumber(FIBER_TARGET.value, 1)}{" "}
          fiber abonelik hedefliyor.{" "}
          {reached
            ? `Türkiye bu hedefi ${inYear(reached)} geçti: ${last} sonunda 100 kişiye ${formatNumber(fiberPer100(national[last]), 2)} fiber abonelik var.`
            : `${last} sonunda 100 kişiye ${formatNumber(fiberPer100(national[last]), 2)} fiber abonelik var, hedefin altında.`}{" "}
          81 ilin {countOf(aboveTarget)} bu düzeyin üstünde.
        </p>
        <FiberTargetChart data={trend} target={{ value: FIBER_TARGET.value, label: targetLabel }} />
        <p>
          Hedef ülke geneli içindir; illere ayrı hedef konmamıştır. {inYear(last)} 100 kişiye fiber aboneliği en düşük iller{" "}
          {listed(lowest)}, en yüksek iller {listed(highest)}. Kişi başına ölçü, haneleri kalabalık illeri geride
          gösterir, çünkü bir ev aboneliğini bütün hane kullanır; Ağrı, Muş ve Şanlıurfa&apos;nın geride görünmesinin bir
          nedeni bu.
          {lowest.filter((p) => p.other >= LARGE_OTHER).map((p) => (
            <span key={p.name}>
              {" "}{p.name} ilinde aboneliklerin {percentOf(Math.round(p.other * 100))} BTK&apos;nın &quot;Diğer&quot; türünde ve
              teknolojiye ayrılmıyor; fiberi bu yüzden düşük görünebilir.
            </span>
          ))}
        </p>
        <p className={styles.footnote}>
          Hedef: <a href={FIBER_TARGET.url}>12. Kalkınma Planı (2024–2028)</a>, Tablo 28, s. 133: fiber genişbant abone
          yaygınlığı, yani fiber abonelik ÷ nüfus × 100. Değerler: BTK, Yıllık İl İstatistikleri ({first}–{last}, yıl sonu).
        </p>

        <h3>OECD ülkeleri arasında</h3>
        <p>
          OECD&apos;nin sayılarına göre {inQuarter(period)} Türkiye&apos;de fiberin sabit abonelikteki{" "}
          payı %{formatNumber(turkey.fiber_payi * 100, 1)}. Türkiye bu payla OECD&apos;nin 38 ülkesi arasında{" "}
          {turkey.fiber_payi_sira}. sırada; ülkelerin ortancası %{formatNumber(shareMedian * 100, 1)}. 100 kişiye düşen{" "}
          {formatNumber(turkey.abone_100, 1)} sabit genişbant aboneliğiyle ise {turkey.abone_100_sira}. sırada (ortanca{" "}
          {formatNumber(per100Median, 1)}); kişi başına ölçü burada da haneleri kalabalık ülkeleri geride gösterir.
        </p>
        <OecdFiberBars
          bars={oecd.map((r) => ({
            code: r.ulke_kodu,
            name: r.ulke,
            share: r.fiber_payi,
            shareRank: r.fiber_payi_sira,
            per100: r.abone_100,
            per100Rank: r.abone_100_sira,
          }))}
          median={shareMedian}
          per100Median={per100Median}
          period={quarter(period)}
        />
        <p className={styles.footnote}>
          Kaynak: <a href={OECD_SOURCE_URL}>OECD Broadband Portal / Broadband database</a>, {quarter(period)}. Sayılar
          OECD&apos;nindir. Türkiye&apos;nin abonelik sayıları OECD&apos;de BTK&apos;nınkilerle aynıdır, ama OECD 100 kişiye
          düşen değeri kendi nüfus tahminiyle hesapladığı için bu değer bu sitedeki BTK hesabından biraz ayrılır (bkz.{" "}
          <Link href="/yontem/#hesaplama">Yöntem</Link>).
        </p>
      </section>
    </main>
  );
}
