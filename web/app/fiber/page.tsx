import type { Metadata } from "next";
import Link from "next/link";
import FiberView, { type FiberProvince } from "@/components/FiberView";
import { fiberLead } from "@/lib/btk";
import { NATIONAL } from "@/lib/data";
import { formatNumber, inYear } from "@/lib/format";
import { readProvinces } from "@/lib/serverData";
import { provincePath } from "@/lib/slug";
import styles from "../pages.module.css";

export const metadata: Metadata = {
  title: "Fiber, telefon hattını nerede geçti? · NetAtlas TR",
  description: "Türkiye'nin 81 ilinde fiber aboneliklerinin telefon hattı (ADSL/VDSL) aboneliklerini hangi yıl geçtiği, BTK'nın il istatistikleriyle.",
};

const millions = (n: number) => `${formatNumber(n / 1e6, 1)} milyon`;

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
    </main>
  );
}
