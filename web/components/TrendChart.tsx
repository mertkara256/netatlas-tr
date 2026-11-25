import dynamic from "next/dynamic";
import { CHART, type Theme } from "@/lib/colors";
import { HIGH_TESTS } from "@/lib/metrics";
import styles from "./RegionPanel.module.css";

/** One period: a short axis label, the full label for the tooltip, the area's and Türkiye's value,
 *  and whether the area's value rests on fewer tests than a "Yüksek" (reliable) one. A chart with
 *  lines of its own carries each line's value under the line's key instead. */
export type TrendPoint = {
  kisa: string;
  etiket: string;
  alan?: number;
  turkiye?: number;
  azTest?: boolean;
  [line: string]: string | number | boolean | undefined;
};

/** A line of a chart that draws a set of its own (Türkiye's settlement types) rather than an area
 *  beside Türkiye: its key in the points, its name and its colour. */
export type TrendLine = { key: string; name: string; color: string };

const compact = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });

const PLOT_HEIGHT = 140; // px
// The plot needs Recharts, a third of the map page's script before the panel opens; it is fetched
// with the first chart instead, and an empty box of its height holds its place until then.
const TrendLines = dynamic(() => import("./TrendLines"), { loading: () => <div style={{ height: PLOT_HEIGHT }} /> });

export default function TrendChart({ title, data, areaName, lines, format, axisFormat = (v) => compact.format(v), theme }: {
  title: string;
  data: TrendPoint[];
  format: (value: number) => string;
  axisFormat?: (value: number) => string;
  theme: Theme;
} & (
  /** The area's line, and Türkiye's where the points have it. */
  | { areaName: string; lines?: undefined }
  /** Lines of its own, each named at its end as well as in the legend. */
  | { areaName?: undefined; lines: TrendLine[] }
)) {
  const c = CHART[theme];
  const national = !lines && data.some((d) => d.turkiye != null);
  const fewTests = !lines && data.some((d) => d.azTest && d.alan != null);
  const drawn: TrendLine[] = lines ?? [
    { key: "alan", name: areaName, color: c.area },
    ...(national ? [{ key: "turkiye", name: "Türkiye", color: c.national }] : []),
  ];
  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartTitle}>{title}</figcaption>
      <div className={styles.chartLegend}>
        {drawn.map((line) => <span key={line.key}><i style={{ background: line.color }} />{line.name}</span>)}
        {fewTests && <span><b className={styles.hollowDot} style={{ borderColor: c.area }} />{HIGH_TESTS}&apos;den az test</span>}
      </div>
      <TrendLines
        data={data}
        lines={drawn}
        endLabels={lines != null}
        format={format}
        axisFormat={axisFormat}
        theme={theme}
        height={PLOT_HEIGHT}
      />
      {/* The chart's values without the chart, for screen readers and anyone who wants the numbers. */}
      <details className={styles.chartTable}>
        <summary>Tablo olarak göster</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Dönem</th>
              {drawn.map((line) => <th key={line.key} scope="col">{line.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.etiket}>
                <th scope="row">{d.etiket}</th>
                {drawn.map((line) => {
                  const value = d[line.key] as number | undefined;
                  return (
                    <td key={line.key}>
                      {value == null ? "–" : `${format(value)}${line.key === "alan" && d.azTest ? ` (${HIGH_TESTS}'den az test)` : ""}`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
