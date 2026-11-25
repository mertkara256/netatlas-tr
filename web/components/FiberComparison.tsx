"use client";

import { CHART } from "@/lib/colors";
import { formatNumber } from "@/lib/format";
import { useColorScheme } from "@/lib/useColorScheme";
import TrendChart, { type TrendPoint, type TrendReference } from "./TrendChart";
import styles from "./Fiber.module.css";
import chartStyles from "./RegionPanel.module.css";

/** Türkiye's fiber subscriptions per 100 people by year, under the Development Plan's target. */
export function FiberTargetChart({ data, target }: { data: TrendPoint[]; target: TrendReference }) {
  const theme = useColorScheme();
  return (
    <TrendChart
      title="100 kişiye fiber abonelik"
      data={data}
      areaName="Türkiye"
      reference={target}
      format={(v) => formatNumber(v, 2)}
      theme={theme}
    />
  );
}

/** An OECD member's fiber share, with its rank, and its fixed subscriptions per 100 inhabitants, with its rank. */
export type OecdBar = { code: string; name: string; share: number; shareRank: number; per100: number; per100Rank: number };

const percent = (share: number, digits: number) => `%${formatNumber(share * 100, digits)}`;

/** The OECD members by fiber's share of fixed subscriptions, highest first: Türkiye in the panel charts' area
 *  blue and in bold, the others in their grey, and a dashed line at the members' median. Every bar is named
 *  and labelled with its value, so the chart reads on a phone without hovering; the table under it repeats
 *  the values with both measures' ranks for screen readers. */
export function OecdFiberBars({ bars, median, per100Median, period }: {
  bars: OecdBar[];
  /** The members' medians of the two measures. */
  median: number;
  per100Median: number;
  period: string;
}) {
  const c = CHART[useColorScheme()];
  const at = `${median * 100}%`;
  return (
    <figure className={chartStyles.chart}>
      <figcaption className={chartStyles.chartTitle}>Fiberin sabit abonelikteki payı, OECD ülkeleri, {period}</figcaption>
      <div className={styles.bars} aria-hidden="true">
        <div className={styles.barRow}>
          <span />
          <span className={styles.track}>
            <span className={styles.medianLabel} style={{ left: at }}>OECD ortancası {percent(median, 1)}</span>
          </span>
          <span />
        </div>
        {bars.map((bar) => {
          const turkey = bar.code === "TUR";
          return (
            <div key={bar.code} className={`${styles.barRow} ${turkey ? styles.highlight : ""}`}>
              <span className={styles.barName}>{bar.name}</span>
              <span className={styles.track}>
                <span className={styles.bar} style={{ width: `${bar.share * 100}%`, background: turkey ? c.area : c.national }} />
                <span className={styles.median} style={{ left: at }} />
              </span>
              <span className={styles.barValue}>{percent(bar.share, 1)}</span>
            </div>
          );
        })}
      </div>
      <details className={chartStyles.chartTable}>
        <summary>Tablo olarak göster</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Ülke</th>
              <th scope="col">Fiber payı (sıra)</th>
              <th scope="col">100 kişiye sabit abonelik (sıra)</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((bar) => (
              <tr key={bar.code} className={bar.code === "TUR" ? styles.highlight : undefined}>
                <th scope="row">{bar.name}</th>
                <td>{percent(bar.share, 2)} ({bar.shareRank}.)</td>
                <td>{formatNumber(bar.per100, 2)} ({bar.per100Rank}.)</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={3}>OECD ortancası: fiber payı {percent(median, 1)}, 100 kişiye sabit abonelik {formatNumber(per100Median, 1)}</td></tr>
          </tfoot>
        </table>
      </details>
    </figure>
  );
}
