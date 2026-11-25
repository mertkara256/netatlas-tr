import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, usePlotArea, useYAxisScale } from "recharts";
import { CHART, type Theme } from "@/lib/colors";
import { HIGH_TESTS } from "@/lib/metrics";
import type { TrendLine, TrendPoint } from "./TrendChart";
import styles from "./RegionPanel.module.css";

const LABEL_SIZE = 11; // px, as the axis labels
// Room on the right for the names at the lines' ends: the longest, "Orta yoğun kent", is about 80 px.
const END_LABEL_ROOM = 92;
// Names closer than this would overlap, so the lower ones move down.
const LABEL_GAP = LABEL_SIZE + 2;

/** 0 up to just above max in a round step (1, 2, 2.5 or 5 times a power of ten), about 4 steps. */
function roundTicks(max: number): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough)!;
  const count = Math.ceil(max / step);
  return Array.from({ length: count + 1 }, (_, i) => Number((i * step).toPrecision(12)));
}

const valueOf = (point: TrendPoint, line: TrendLine) => point[line.key] as number | undefined;

/** Each line's name beside its last value, right of the plot, so a line is told by more than its colour. */
function EndLabels({ data, lines, color }: { data: TrendPoint[]; lines: TrendLine[]; color: string }) {
  const y = useYAxisScale();
  const plot = usePlotArea();
  if (!y || !plot) return null;
  const last = data[data.length - 1];
  const labels = lines
    .map((line) => ({ line, at: y(valueOf(last, line)) }))
    .filter((label): label is { line: TrendLine; at: number } => label.at != null)
    .sort((a, b) => a.at - b.at);
  for (let i = 1; i < labels.length; i++) labels[i].at = Math.max(labels[i].at, labels[i - 1].at + LABEL_GAP);
  return (
    <g>
      {labels.map(({ line, at }) => (
        <text key={line.key} x={plot.x + plot.width + 6} y={at} dy="0.35em" fill={color} fontSize={LABEL_SIZE}>
          {line.name}
        </text>
      ))}
    </g>
  );
}

/** The plot of a TrendChart, with its hover tooltip. */
export default function TrendLines({ data, lines, endLabels, format, axisFormat, theme, height }: {
  data: TrendPoint[];
  /** The area's ("alan") and Türkiye's ("turkiye"), or lines of the chart's own. */
  lines: TrendLine[];
  /** Name each line at its end. */
  endLabels: boolean;
  format: (value: number) => string;
  axisFormat: (value: number) => string;
  theme: Theme;
  height: number;
}) {
  const c = CHART[theme];
  const ticks = roundTicks(Math.max(...data.flatMap((d) => lines.map((line) => valueOf(d, line) ?? 0))));
  return (
    <ResponsiveContainer width="100%" height={height}>
      {/* Room on the right for the last axis label ("Güncel"), which is centred on its point, or for the lines' names. */}
      {/* Hidden from screen readers, with no keyboard stop: the table under the chart gives its values. */}
      <LineChart data={data} margin={{ top: 8, right: endLabels ? END_LABEL_ROOM : 22, bottom: 0, left: 0 }} accessibilityLayer={false} aria-hidden>
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
                {point.azTest && point.alan != null && <div className={styles.chartTooltipNote}>{HIGH_TESTS}&apos;den az test</div>}
                {lines.map((line) => {
                  const value = valueOf(point, line);
                  return value == null ? null : (
                    <div key={line.key} className={styles.chartTooltipRow}>
                      <span><i style={{ background: line.color }} />{line.name}</span>
                      <span>{format(value)}</span>
                    </div>
                  );
                })}
              </div>
            );
          }}
        />
        {/* The first line is drawn last, on top: the area over Türkiye. */}
        {[...lines].reverse().map((line) => line.key === "alan" ? (
          <Line
            key={line.key}
            dataKey="alan"
            stroke={line.color}
            strokeWidth={2}
            // A hollow dot marks a value from fewer tests than a reliable one (TrendPoint.azTest).
            dot={({ cx, cy, index, payload }) => (
              <circle
                key={index}
                cx={cx}
                cy={cy}
                r={(payload as TrendPoint).azTest ? 3.5 : 4}
                fill={(payload as TrendPoint).azTest ? c.surface : line.color}
                stroke={(payload as TrendPoint).azTest ? line.color : c.surface}
                strokeWidth={(payload as TrendPoint).azTest ? 1.5 : 2}
              />
            )}
            activeDot={{ r: 5, fill: line.color, stroke: c.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        ) : (
          <Line
            key={line.key}
            dataKey={line.key}
            stroke={line.color}
            strokeWidth={2}
            dot={false}
            // Türkiye beside an area stays in the background; lines of the chart's own are marked as the area's.
            activeDot={endLabels ? { r: 4, fill: line.color, stroke: c.surface, strokeWidth: 2 } : false}
            isAnimationActive={false}
          />
        ))}
        {endLabels && <EndLabels data={data} lines={lines} color={c.muted} />}
      </LineChart>
    </ResponsiveContainer>
  );
}
