"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { periodText, type Area, type PeriodInfo } from "@/lib/data";
import { formatNumber, formatValue } from "@/lib/format";
import { HIGH_TESTS, LOW_TESTS, ONE_TILE_SHARE, metricById, reliabilityLabel, type Metric } from "@/lib/metrics";
import { NEARBY_RADIUS } from "@/lib/nearby";
import { startNearbyRequest, type NearbyRequestResult } from "@/lib/nearby-request";
import { useColorScheme } from "@/lib/useColorScheme";
import TrendChart from "./TrendChart";
import styles from "./RegionPanel.module.css";

const DOWNLOAD = metricById("indirme");
const UPLOAD = metricById("yukleme");
const LATENCY = metricById("gecikme");
const percent = (v: number) => `%${formatNumber(v * 100)}`;
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
  const [attempt, setAttempt] = useState(0);
  const [lon, lat] = point;
  const periodId = period.id;
  // A fresh identity keeps retries and A → B → A changes from showing an old result.
  const request = useMemo(() => ({ lon, lat, periodId, attempt }), [lon, lat, periodId, attempt]);
  const [result, setResult] = useState<{ request: typeof request; outcome: NearbyRequestResult } | null>(null);
  useEffect(() => startNearbyRequest(request.lon, request.lat, request.periodId, (outcome) => {
    setResult({ request, outcome });
  }), [request]);
  const outcome = result?.request === request ? result.outcome : null;

  return (
    <section className={styles.cell}>
      <h3>Tıkladığın yerin çevresi <span className={styles.muted}>{formatNumber(NEARBY_RADIUS / 1000)} km</span></h3>
      {outcome === null ? (
        <p className={`${styles.muted} ${styles.nearbyLoading}`} role="status">
          <span className={styles.spinner} aria-hidden="true" />Hesaplanıyor…
        </p>
      ) : outcome.status === "error" ? (
        <div role="alert">
          <p>Çevrendeki ölçümler yüklenemedi.</p>
          <button type="button" className={styles.retry} onClick={() => setAttempt((value) => value + 1)}>Yeniden dene</button>
        </div>
      ) : outcome.value === null ? (
        <p>Bu dönemde {formatNumber(NEARBY_RADIUS / 1000)} km içinde ölçüm yok.</p>
      ) : (
        <p>
          {formatValue(DOWNLOAD, outcome.value.download)} indirme · {formatValue(UPLOAD, outcome.value.upload)} yükleme ·{" "}
          {formatValue(LATENCY, outcome.value.latency)} gecikme
          <br />
          <span className={styles.muted}>
            {formatNumber(outcome.value.squares)} kare, {formatNumber(outcome.value.tests)} test ({reliabilityLabel(outcome.value.tests).toLocaleLowerCase("tr-TR")} güvenilirlik)
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
            <Stat label="Test" value={formatNumber(v.test)} note={`${reliabilityLabel(v.test)} güvenilirlik`} />
          </dl>
        ) : (
          <p className={styles.muted}>Bu dönemde ölçüm yok.</p>
        )}
        {v?.olculen_nufus_payi != null && n?.olculen_nufus_payi != null && (
          <p className={styles.note}>
            Nüfusun ölçüm yapılan karelerde yaşayan payı: {percent(v.olculen_nufus_payi)} (Türkiye {percent(n.olculen_nufus_payi)}).
          </p>
        )}
        {v && v.test < LOW_TESTS && <p className={styles.note}>{LOW_TESTS}&apos;dan az test var; değerler belirsiz.</p>}
        {v && v.test >= LOW_TESTS && (v.tek_kare_payi ?? 0) >= ONE_TILE_SHARE && (
          <p className={styles.note}>
            Ağırlıkta tek bir 475 m&apos;lik karenin payı %{formatNumber((v.tek_kare_payi ?? 0) * 100)}: o karedeki
            birkaç bağlantı değeri çok etkiliyor.
          </p>
        )}
      </section>

      <section>
        <TrendChart
          title={tests ? "Yıllara göre test sayısı" : `Yıllara göre ${metric.title.toLocaleLowerCase("tr-TR")}`}
          data={periods.map((p) => ({
            kisa: shortLabel(p),
            etiket: periodText(p),
            alan: area.hiz[p.id]?.[metric.areaKey] as number | undefined,
            turkiye: tests ? undefined : (national.hiz[p.id]?.[metric.areaKey] as number | undefined),
            azTest: !tests && area.hiz[p.id] != null && area.hiz[p.id].test < HIGH_TESTS,
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
        Hız: Speedtest ölçümlerinin cihaz ağırlıklı ortalaması (Speedtest® by Ookla® açık verisi); abonelerin paket
        hızları değildir. Erişim: BTK yıllık il istatistikleri.{" "}
        <Link href="/yontem/#ne-gosteriyor">Bu sayılar neyi gösterir?</Link>
      </p>
    </div>
  );
}
