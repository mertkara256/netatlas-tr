import dynamic from "next/dynamic";
import { CHART, type Theme } from "@/lib/colors";
import { HIGH_TESTS } from "@/lib/metrics";
import styles from "./RegionPanel.module.css";

/** One period: a short axis label, the full label for the tooltip, the area's and Türkiye's value,
 *  and whether the area's value rests on fewer tests than a "Yüksek" (reliable) one. */
export type TrendPoint = { kisa: string; etiket: string; alan?: number; turkiye?: number; azTest?: boolean };

const compact = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });

const PLOT_HEIGHT = 140; // px
// The plot needs Recharts, a third of the map page's script before the panel opens; it is fetched
// with the first chart instead, and an empty box of its height holds its place until then.
const TrendLines = dynamic(() => import("./TrendLines"), { loading: () => <div style={{ height: PLOT_HEIGHT }} /> });

export default function TrendChart({ title, data, areaName, format, axisFormat = (v) => compact.format(v), theme }: {
  title: string;
  data: TrendPoint[];
  areaName: string;
  format: (value: number) => string;
  axisFormat?: (value: number) => string;
  theme: Theme;
}) {
  const c = CHART[theme];
  const national = data.some((d) => d.turkiye != null);
  const fewTests = data.some((d) => d.azTest && d.alan != null);
  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartTitle}>{title}</figcaption>
      <div className={styles.chartLegend}>
        <span><i style={{ background: c.area }} />{areaName}</span>
        {national && <span><i style={{ background: c.national }} />Türkiye</span>}
        {fewTests && <span><b className={styles.hollowDot} style={{ borderColor: c.area }} />{HIGH_TESTS}&apos;den az test</span>}
      </div>
      <TrendLines
        data={data}
        areaName={areaName}
        format={format}
        axisFormat={axisFormat}
        theme={theme}
        national={national}
        height={PLOT_HEIGHT}
      />
      {/* The chart's values without the chart, for screen readers and anyone who wants the numbers. */}
      <details className={styles.chartTable}>
        <summary>Tablo olarak göster</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Dönem</th>
              <th scope="col">{areaName}</th>
              {national && <th scope="col">Türkiye</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.etiket}>
                <th scope="row">{d.etiket}</th>
                <td>{d.alan == null ? "–" : `${format(d.alan)}${d.azTest ? ` (${HIGH_TESTS}'den az test)` : ""}`}</td>
                {national && <td>{d.turkiye == null ? "–" : format(d.turkiye)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
