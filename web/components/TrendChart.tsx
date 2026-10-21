import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, type Theme } from "@/lib/colors";
import styles from "./RegionPanel.module.css";

/** One period: a short axis label, the full label for the tooltip, the area's and Türkiye's value. */
export type TrendPoint = { kisa: string; etiket: string; alan?: number; turkiye?: number };

const compact = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });

/** 0 up to just above max in a round step (1, 2, 2.5 or 5 times a power of ten), about 4 steps. */
function roundTicks(max: number): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough)!;
  const count = Math.ceil(max / step);
  return Array.from({ length: count + 1 }, (_, i) => Number((i * step).toPrecision(12)));
}

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
  const ticks = roundTicks(Math.max(...data.flatMap((d) => [d.alan ?? 0, d.turkiye ?? 0])));
  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartTitle}>{title}</figcaption>
      <div className={styles.chartLegend}>
        <span><i style={{ background: c.area }} />{areaName}</span>
        {national && <span><i style={{ background: c.national }} />Türkiye</span>}
      </div>
      <ResponsiveContainer width="100%" height={140}>
        {/* Room on the right for the last axis label ("Güncel"), which is centred on its point. */}
        <LineChart data={data} margin={{ top: 8, right: 22, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey="kisa" interval={0} tickLine={false} axisLine={{ stroke: c.axis }} tick={{ fill: c.muted, fontSize: 11 }} />
          <YAxis width={38} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} tickLine={false} axisLine={false} tick={{ fill: c.muted, fontSize: 11 }} tickFormatter={axisFormat} />
          <Tooltip
            cursor={{ stroke: c.axis }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as TrendPoint;
              return (
                <div className={styles.chartTooltip}>
                  <div className={styles.chartTooltipTitle}>{point.etiket}</div>
                  {[[areaName, point.alan, c.area], ["Türkiye", point.turkiye, c.national]].map(([name, value, color]) =>
                    value == null ? null : (
                      <div key={name as string} className={styles.chartTooltipRow}>
                        <span><i style={{ background: color as string }} />{name}</span>
                        <span>{format(value as number)}</span>
                      </div>
                    ))}
                </div>
              );
            }}
          />
          {national && (
            <Line dataKey="turkiye" stroke={c.national} strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />
          )}
          <Line
            dataKey="alan"
            stroke={c.area}
            strokeWidth={2}
            dot={{ r: 4, fill: c.area, stroke: c.surface, strokeWidth: 2 }}
            activeDot={{ r: 5, fill: c.area, stroke: c.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
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
                <td>{d.alan == null ? "–" : format(d.alan)}</td>
                {national && <td>{d.turkiye == null ? "–" : format(d.turkiye)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
