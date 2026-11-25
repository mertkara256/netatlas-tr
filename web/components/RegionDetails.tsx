"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CONNECTION_TYPES, fiberLead } from "@/lib/btk";
import { CONNECTION_COLORS, SETTLEMENT_COLORS, type Theme } from "@/lib/colors";
import { CELL_SIZE, periodText, type Area, type BtkValues, type CellPick, type PeriodInfo } from "@/lib/data";
import { formatNumber, formatValue, inYear } from "@/lib/format";
import { HIGH_TESTS, LOW_TESTS, metricById, reliabilityLabel, representationConditions, type Metric } from "@/lib/metrics";
import { NEARBY_RADIUS } from "@/lib/nearby";
import { startNearbyRequest, type NearbyRequestResult } from "@/lib/nearby-request";
import { enoughTests, ratioText, ruralRatio, SETTLEMENT_TYPES, type SettlementKey } from "@/lib/settlement";
import { useColorScheme } from "@/lib/useColorScheme";
import TrendChart from "./TrendChart";
import styles from "./RegionPanel.module.css";

const DOWNLOAD = metricById("indirme");
const UPLOAD = metricById("yukleme");
const LATENCY = metricById("gecikme");
const percent = (v: number) => `%${formatNumber(v * 100)}`;
// One decimal, so a share just under a note's threshold (Hadim's 0.498 residents) does not read as the threshold.
const share = (v: number) => `%${formatNumber(v * 100, 1)}`;
const shortLabel = (p: PeriodInfo) => (p.id === "guncel" ? p.ad : `'${p.id.slice(2)}`);

// A part of the connection bar under this share would be thinner than a pixel; the legend still lists it.
const MIN_DRAWN = 0.005;
const mixShare = (v: number) => (v < MIN_DRAWN ? "%1'den az" : percent(v));

/** The last BTK year's subscriptions by connection type as one bar, and since when fiber leads xDSL. */
function ConnectionMix({ btk, theme }: { btk: Record<string, BtkValues>; theme: Theme }) {
  const years = Object.keys(btk).sort();
  const last = btk[years[years.length - 1]];
  const types = CONNECTION_TYPES.filter((t) => last[t.key] > 0);
  const colors = CONNECTION_COLORS[theme];
  const lead = fiberLead(btk);
  return (
    <div className={styles.mix}>
      <p className={styles.chartTitle}>Bağlantı türüne göre abonelikler</p>
      <div className={styles.mixBar} aria-hidden="true">
        {types.filter((t) => last[t.key] / last.sabit_genisbant >= MIN_DRAWN).map((t) => (
          <span key={t.key} style={{ flexGrow: last[t.key], background: colors[t.key] }} />
        ))}
      </div>
      <ul className={styles.mixLegend}>
        {types.map((t) => (
          <li key={t.key}>
            <i style={{ background: colors[t.key] }} />
            {t.label} <b>{mixShare(last[t.key] / last.sabit_genisbant)}</b>
          </li>
        ))}
      </ul>
      <p className={styles.note}>
        {lead
          ? `Fiber abonelikleri telefon hattı aboneliklerini ${inYear(lead.since)}${lead.fromStart ? " ya da daha önce" : ""} geçti.`
          : "Telefon hattı abonelikleri hâlâ fiberden fazla."}{" "}
        <Link href="/fiber/">Fiber haritası</Link>
      </p>
    </div>
  );
}

// What the sentence under the settlement types calls each metric.
const SETTLEMENT_NOUN: Record<SettlementKey, string> = { indirme_mbps: "indirme hızı", yukleme_mbps: "yükleme hızı", gecikme_ms: "gecikme" };

/** The selected period's values by settlement type (lib/settlement.ts), each beside Türkiye's, how kır
 *  compares with yoğun kent, and Türkiye's types over the years. Provinces only: a district shows its
 *  province's, as its samples would be small. */
function SettlementSection({ province, national, isDistrict, periods, period, metric, theme }: {
  province: Area;
  national: Area;
  isDistrict: boolean;
  periods: PeriodInfo[];
  period: PeriodInfo;
  metric: Metric;
  theme: Theme;
}) {
  const types = province.yerlesim?.[period.id];
  const nationalTypes = national.yerlesim?.[period.id];
  if (!types || !nationalTypes) return null;
  // Test counts have a column of their own, so that view shows download.
  const shown = metric.id === "guvenilirlik" ? DOWNLOAD : metric;
  const key = shown.areaKey as SettlementKey;
  const ratio = ruralRatio(types, key);
  const nationalRatio = ruralRatio(nationalTypes, key)!;
  const noun = SETTLEMENT_NOUN[key];

  return (
    <section>
      <h3>Kent ve kır <span className={styles.muted}>{periodText(period)}</span></h3>
      {isDistrict && <p className={styles.note}>Kent-kır değerleri il düzeyinde; değerler {province.ad} il geneli.</p>}
      <table className={styles.types}>
        <thead>
          <tr>
            <th scope="col"><span className={styles.srOnly}>Yerleşim</span></th>
            <th scope="col">{shown.label}</th>
            <th scope="col">Test</th>
            <th scope="col">Ölçüme yakın nüfus</th>
          </tr>
        </thead>
        <tbody>
          {SETTLEMENT_TYPES.map(({ key: type, label }) => {
            const v = types[type];
            const n = nationalTypes[type];
            return (
              <tr key={type}>
                <th scope="row">{label}</th>
                {v ? (
                  <>
                    <td>
                      {enoughTests(v) ? formatValue(shown, v[key]) : <span className={styles.muted}>yeterli test yok</span>}
                      {n && <span className={styles.typeNote}>Türkiye {formatNumber(n[key], shown.digits)}</span>}
                    </td>
                    <td>{formatNumber(v.test)}</td>
                    <td>{share(v.olculen_nufus_payi)}</td>
                  </>
                ) : (
                  <td colSpan={3} className={styles.muted}>ölçüm yok</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className={styles.note}>
        {ratio === null
          ? `Türkiye'de kırda ölçülen ${noun} yoğun kentte ölçülenin ${ratioText(nationalRatio)}.`
          : `Kırda ölçülen ${noun} yoğun kentte ölçülenin ${ratioText(ratio)} (Türkiye'de ${ratioText(nationalRatio)}).`}
      </p>
      <p className={styles.note}>
        Ölçüme yakın nüfus: o yerleşim türünde yaşayanlardan ölçüm yapılan karelerde ya da hemen yanlarında oturanların
        payı. {HIGH_TESTS}&apos;den az testli türün hızı gösterilmez.{" "}
        <Link href="/yontem/#kent-kir">Kent ve kır nasıl ayrıldı?</Link>
      </p>
      <TrendChart
        title={`Türkiye geneli: yıllara göre ${shown.title.toLocaleLowerCase("tr-TR")}`}
        data={periods.map((p) => ({
          kisa: shortLabel(p),
          etiket: periodText(p),
          ...Object.fromEntries(SETTLEMENT_TYPES.map(({ key: type }) => [type, national.yerlesim?.[p.id]?.[type]?.[key]])),
        }))}
        lines={SETTLEMENT_TYPES.map(({ key: type, label }) => ({ key: type, name: label, color: SETTLEMENT_COLORS[theme][type] }))}
        format={(value) => formatValue(shown, value)}
        theme={theme}
      />
      {(shown.id === "indirme" || shown.id === "yukleme") && (
        <p className={styles.note}>
          2025&apos;in son çeyreğinde ölçülen hızlar bir anda yükseldi; nedenini bilmiyoruz.{" "}
          <Link href="/yontem/#donemler">Ayrıntılar</Link>
        </p>
      )}
    </section>
  );
}

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

/** The heat-map cell under the click, with the values the tooltip gives at that point (cellAt() in
 *  MapView), so a phone, which has no tooltip, can read what a cell's colour stands for. */
function CellSection({ pick, located, period, periods, mapHidden }: {
  pick: CellPick;
  located: boolean;
  period: PeriodInfo;
  periods: PeriodInfo[];
  mapHidden: boolean;
}) {
  // While another period is shown, the map reads the cell again (MapView); stale if it could not.
  // A map hidden behind the table reads nothing until it is shown again.
  const old = pick.period !== period.id;
  const reading = old && !pick.stale && !mapHidden;
  const readIn = periods.find((p) => p.id === pick.period)!;
  const v = pick.cell?.values;

  return (
    <section className={styles.cell}>
      <h3>
        {located ? "Konumundaki hücre" : "Tıkladığın hücre"}{" "}
        <span className={styles.muted}>
          {reading ? period.ad : [pick.cell && CELL_SIZE[pick.cell.level], readIn.ad].filter(Boolean).join(" · ")}
        </span>
      </h3>
      {reading ? (
        <p className={`${styles.muted} ${styles.nearbyLoading}`} role="status">
          <span className={styles.spinner} aria-hidden="true" />Yükleniyor…
        </p>
      ) : v ? (
        <p>
          {formatValue(DOWNLOAD, v.d)} indirme · {formatValue(UPLOAD, v.u)} yükleme · {formatValue(LATENCY, v.l)} gecikme
          <br />
          <span className={styles.muted}>
            {formatNumber(v.t)} test ({reliabilityLabel(v.t).toLocaleLowerCase("tr-TR")} güvenilirlik)
          </span>
        </p>
      ) : (
        <p>{located ? "Konumunda" : "Tıkladığın yerde"} {pick.period === period.id ? "bu dönemde" : `${readIn.ad} döneminde`} ölçüm yok.</p>
      )}
      {!reading && v && v.t < LOW_TESTS && <p className={styles.note}>{LOW_TESTS}&apos;dan az test var; değerler belirsiz.</p>}
      {old && mapHidden ? (
        <p className={styles.note}>
          Bu bilgi {readIn.ad} dönemine ait: harita gösterilmediği için {period.ad} dönemi okunamadı. Haritaya dönünce
          güncellenir.
        </p>
      ) : old && pick.stale && (
        <p className={styles.note}>
          Bu bilgi {readIn.ad} dönemine ait: {located ? "konumun" : "tıkladığın yer"} haritanın görünen kısmında olmadığı için {period.ad} dönemi
          okunamadı. Haritayı oraya geri kaydırınca güncellenir.
        </p>
      )}
    </section>
  );
}

/** Device-weighted averages of Ookla's 475 m squares within 1 km of the clicked point, read from the
 *  map tiles in the browser whatever the zoom (lib/nearby.ts). */
function NearbySection({ point, located, period }: { point: [number, number]; located: boolean; period: PeriodInfo }) {
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
      <h3>{located ? "Konumunun çevresi" : "Tıkladığın yerin çevresi"} <span className={styles.muted}>{formatNumber(NEARBY_RADIUS / 1000)} km</span></h3>
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
export default function RegionDetails({ area, province, national, isDistrict, periods, period, metric, point, located = false, cell, mapHidden = false }: {
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
  /** The point is the reader's own position (the Konumum button), not a click. */
  located?: boolean;
  /** In the heat map, the cell under that point. */
  cell?: CellPick;
  /** The table is shown in the map's place, so the map cannot read the cell. */
  mapHidden?: boolean;
}) {
  const theme = useColorScheme();
  const v = area.hiz[period.id];
  const n = national.hiz[period.id];
  const tests = metric.id === "guvenilirlik";
  const representation = v ? representationConditions(v) : [];
  const btk = province.btk!;
  const nationalBtk = national.btk!;
  const btkYears = Object.keys(btk).sort();
  const lastYear = btkYears[btkYears.length - 1];

  return (
    <div className={styles.details}>
      {cell && <CellSection pick={cell} located={located} period={period} periods={periods} mapHidden={mapHidden} />}
      {point && <NearbySection point={point} located={located} period={period} />}

      <section>
        {/* Under the cell and its surroundings, the heading says whose values these are. */}
        {cell ? (
          <h3>{isDistrict ? "İlçe geneli" : "İl geneli"} <span className={styles.muted}>{periodText(period)}</span></h3>
        ) : (
          <h3>{periodText(period)}</h3>
        )}
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
            Nüfusun ölçüm yapılan karelerde ya da hemen yanlarında yaşayan payı: {share(v.olculen_nufus_payi)} (Türkiye {share(n.olculen_nufus_payi)}).
          </p>
        )}
        {v && v.test < LOW_TESTS && <p className={styles.note}>{LOW_TESTS}&apos;dan az test var; değerler belirsiz.</p>}
        {representation.length > 0 && (
          <p className={styles.note}>
            Bu değer {isDistrict ? "ilçenin" : "ilin"} tamamını değil, ölçüm yapılan yerleri gösterir:{" "}
            {representation.map((condition) => (condition === "oneTile"
              ? `ağırlıkta tek bir 475 m'lik karenin payı ${share(v!.tek_kare_payi!)}`
              : `ölçüme yakın yaşayan nüfusun payı ${share(v!.olculen_nufus_payi!)}`)).join(", ")}.
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
        {(metric.id === "indirme" || metric.id === "yukleme") && (
          <p className={styles.note}>
            2025&apos;in son çeyreğinde ölçülen hızlar bir anda yükseldi; nedenini bilmiyoruz.{" "}
            <Link href="/yontem/#donemler">Ayrıntılar</Link>
          </p>
        )}
      </section>

      <SettlementSection
        province={province}
        national={national}
        isDistrict={isDistrict}
        periods={periods}
        period={period}
        metric={metric}
        theme={theme}
      />

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
        <ConnectionMix btk={btk} theme={theme} />
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
