import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, type Theme } from "@/lib/colors";
import type { TrendPoint } from "./TrendChart";
import styles from "./RegionPanel.module.css";

/** 0 up to just above max in a round step (1, 2, 2.5 or 5 times a power of ten), about 4 steps. */
function roundTicks(max: number): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough)!;
  const count = Math.ceil(max / step);
  return Array.from({ length: count + 1 }, (_, i) => Number((i * step).toPrecision(12)));
}

/** The plot of a TrendChart, with its hover tooltip. */
export default function TrendLines({ data, areaName, format, axisFormat, theme, national, height }: {
  data: TrendPoint[];
  areaName: string;
  format: (value: number) => string;
  axisFormat: (value: number) => string;
  theme: Theme;
  /** Whether Türkiye's line is drawn. */
  national: boolean;
  height: number;
}) {
  const c = CHART[theme];
  const ticks = roundTicks(Math.max(...data.flatMap((d) => [d.alan ?? 0, d.turkiye ?? 0])));
  return (
    <ResponsiveContainer width="100%" height={height}>
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
  );
}
