"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { periodText, type Area, type PeriodInfo } from "@/lib/data";
import { formatNumber, formatValue } from "@/lib/format";
import { LOW_TESTS, RELIABILITY_LABELS, classIndex, metricById, type Metric } from "@/lib/metrics";
import { NEARBY_RADIUS, nearby, siteArchive, type Nearby } from "@/lib/nearby";
import { useColorScheme } from "@/lib/useColorScheme";
import TrendChart from "./TrendChart";
import styles from "./RegionPanel.module.css";

const DOWNLOAD = metricById("indirme");
const UPLOAD = metricById("yukleme");
const LATENCY = metricById("gecikme");
const percent = (v: number) => `%${formatNumber(v * 100)}`;
const reliability = (tests: number) => RELIABILITY_LABELS[classIndex(tests, [LOW_TESTS, 50])];
const shortLabel = (p: PeriodInfo) => (p.id === "guncel" ? p.ad : `'${p.id.slice(2)}`);

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className={styles.stat}>
      <dt>{label}</dt>
      <dd>
        <span className={styles.statValue}>{value}</span>
        <span className={styles.statNote}>{note}</span>
      </dd>
    </div>
  );
}

/** Test-weighted averages of Ookla's 475 m squares within 1 km of the clicked point, read from the
 *  map tiles in the browser whatever the zoom (lib/nearby.ts). */
function NearbySection({ point, period }: { point: [number, number]; period: PeriodInfo }) {
  const key = `${point.join(",")}|${period.id}`;
  const [result, setResult] = useState<{ key: string; value: Nearby | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    nearby(siteArchive(), point[0], point[1], period.id).then((value) => {
      if (!cancelled) setResult({ key, value });
    });
    return () => {
      cancelled = true;
    };
  }, [key, point, period.id]);
  const value = result?.key === key ? result.value : undefined;

  return (
    <section className={styles.cell}>
      <h3>Tıkladığın yerin çevresi <span className={styles.muted}>{formatNumber(NEARBY_RADIUS / 1000)} km</span></h3>
      {value === undefined ? (
        <p className={styles.muted}>Hesaplanıyor…</p>
      ) : value === null ? (
        <p>Bu dönemde {formatNumber(NEARBY_RADIUS / 1000)} km içinde ölçüm yok.</p>
      ) : (
        <p>
          {formatValue(DOWNLOAD, value.download)} indirme · {formatValue(UPLOAD, value.upload)} yükleme ·{" "}
          {formatValue(LATENCY, value.latency)} gecikme
          <br />
          <span className={styles.muted}>
            {formatNumber(value.squares)} kare, {formatNumber(value.tests)} test ({reliability(value.tests).toLocaleLowerCase("tr-TR")} güvenilirlik)
          </span>
        </p>
      )}
    </section>
  );
}

/** Speeds, yearly trend and BTK access of a province or district, beside Türkiye's.
 *  Shared by the map's region panel and the province pages. */
export default function RegionDetails({ area, province, national, isDistrict, periods, period, metric, point }: {
  area: Area;
  /** The area itself, or a district's province (BTK publishes no district figures). */
  province: Area;
  national: Area;
  isDistrict: boolean;
  periods: PeriodInfo[];
  period: PeriodInfo;
  metric: Metric;
  /** The point clicked on the map to open the panel. */
  point?: [number, number];
}) {
  const theme = useColorScheme();
  const v = area.hiz[period.id];
  const n = national.hiz[period.id];
  const tests = metric.id === "guvenilirlik";
  const btk = province.btk!;
  const nationalBtk = national.btk!;
  const btkYears = Object.keys(btk).sort();
  const lastYear = btkYears[btkYears.length - 1];

  return (
    <div className={styles.details}>
      {point && <NearbySection point={point} period={period} />}

      <section>
        <h3>{periodText(period)}</h3>
        {v && n ? (
          <dl className={styles.stats}>
            <Stat label="İndirme" value={formatValue(DOWNLOAD, v.indirme_mbps)} note={`Türkiye ${formatValue(DOWNLOAD, n.indirme_mbps)}`} />
            <Stat label="Yükleme" value={formatValue(UPLOAD, v.yukleme_mbps)} note={`Türkiye ${formatValue(UPLOAD, n.yukleme_mbps)}`} />
            <Stat label="Gecikme" value={formatValue(LATENCY, v.gecikme_ms)} note={`Türkiye ${formatValue(LATENCY, n.gecikme_ms)}`} />
            <Stat label="Test" value={formatNumber(v.test)} note={`${reliability(v.test)} güvenilirlik`} />
          </dl>
        ) : (
          <p className={styles.muted}>Bu dönemde ölçüm yok.</p>
        )}
        {v && v.test < LOW_TESTS && <p className={styles.note}>{LOW_TESTS}&apos;dan az test var; değerler belirsiz.</p>}
      </section>

      <section>
        <TrendChart
          title={tests ? "Yıllara göre test sayısı" : `Yıllara göre ${metric.title.toLocaleLowerCase("tr-TR")}`}
          data={periods.map((p) => ({
            kisa: shortLabel(p),
            etiket: periodText(p),
            alan: area.hiz[p.id]?.[metric.areaKey] as number | undefined,
            turkiye: tests ? undefined : (national.hiz[p.id]?.[metric.areaKey] as number | undefined),
          }))}
          areaName={area.ad}
          format={(value) => (tests ? `${formatNumber(value)} test` : formatValue(metric, value))}
          theme={theme}
        />
      </section>

      <section>
        <h3>Erişim · BTK, {lastYear} yıl sonu</h3>
        {isDistrict && <p className={styles.note}>BTK ilçe düzeyinde veri yayımlamıyor; değerler {province.ad} il geneli.</p>}
        <dl className={styles.stats}>
          <Stat
            label="100 kişiye sabit abonelik"
            value={formatNumber(btk[lastYear].abone_100, 1)}
            note={`Türkiye ${formatNumber(nationalBtk[lastYear].abone_100, 1)}`}
          />
          <Stat label="Fiber payı" value={percent(btk[lastYear].fiber_payi)} note={`Türkiye ${percent(nationalBtk[lastYear].fiber_payi)}`} />
        </dl>
        {(["abone_100", "fiber_payi"] as const).map((key) => (
          <TrendChart
            key={key}
            title={key === "abone_100" ? "100 kişiye sabit abonelik" : "Sabit aboneliklerde fiber payı"}
            data={btkYears.map((y) => ({
              kisa: `'${y.slice(2)}`,
              etiket: `${y} yıl sonu`,
              alan: btk[y][key],
              turkiye: nationalBtk[y]?.[key],
            }))}
            areaName={province.ad}
            format={key === "abone_100" ? (value) => formatNumber(value, 1) : percent}
            axisFormat={key === "abone_100" ? undefined : percent}
            theme={theme}
          />
        ))}
      </section>

      <p className={styles.source}>
        Hız: Speedtest® by Ookla® açık verisi, test ağırlıklı ortalama. Erişim: BTK yıllık il istatistikleri.{" "}
        <Link href="/yontem/">Yöntem, sınırlamalar ve kaynaklar</Link>
      </p>
    </div>
  );
}
