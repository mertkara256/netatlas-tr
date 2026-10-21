"use client";

import { CELL_SIZE, periodText, type Area, type CellProperties, type PeriodInfo } from "@/lib/data";
import { formatNumber, formatValue } from "@/lib/format";
import { LOW_TESTS, RELIABILITY_LABELS, classIndex, metricById, type Metric } from "@/lib/metrics";
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

function CellSection({ cell, period }: { cell: CellProperties; period: PeriodInfo }) {
  const tests = cell[`t${period.id}`];
  return (
    <section className={styles.cell}>
      <h3>Tıkladığın kare <span className={styles.muted}>{CELL_SIZE[cell.seviye]}</span></h3>
      {tests == null ? (
        <p>Bu dönemde bu karede ölçüm yok.</p>
      ) : (
        <p>
          {formatValue(DOWNLOAD, cell[`d${period.id}`])} indirme · {formatValue(UPLOAD, cell[`u${period.id}`])} yükleme ·{" "}
          {formatNumber(tests)} test ({reliability(tests).toLocaleLowerCase("tr-TR")} güvenilirlik)
        </p>
      )}
    </section>
  );
}

/** Speeds, yearly trend and BTK access of a province or district, beside Türkiye's.
 *  Shared by the map's region panel and the province pages. */
export default function RegionDetails({ area, province, national, isDistrict, periods, period, metric, cell }: {
  area: Area;
  /** The area itself, or a district's province (BTK publishes no district figures). */
  province: Area;
  national: Area;
  isDistrict: boolean;
  periods: PeriodInfo[];
  period: PeriodInfo;
  metric: Metric;
  cell?: CellProperties;
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
      {cell && <CellSection cell={cell} period={period} />}

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
        Hız: Speedtest® by Ookla® açık verisi, test ağırlıklı ortalama. Erişim: BTK yıllık il istatistikleri.
      </p>
    </div>
  );
}
