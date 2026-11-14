import { FEW_TESTS_FILL, RAMPS, heatGradient, type Theme } from "@/lib/colors";
import { periodText, type PeriodInfo, type View } from "@/lib/data";
import { LOW_TESTS, RELIABILITY_LABELS, RELIABILITY_RANGES, breakLabels, type Metric } from "@/lib/metrics";
import styles from "./Atlas.module.css";

export default function Legend({ metric, period, view, theme, panelOpen }: {
  metric: Metric;
  period: PeriodInfo;
  view: View;
  theme: Theme;
  /** On phones the region panel and the legend would leave no map; the panel wins. */
  panelOpen: boolean;
}) {
  const ramps = RAMPS[theme];
  const reliability = metric.id === "guvenilirlik";
  // Speeds are coloured continuously in every view; reliability keeps its three classes.
  const continuous = !reliability;
  const colors = reliability ? ramps.reliability : ramps.full;
  const columns = { gridTemplateColumns: `repeat(${colors.length}, 1fr)` };
  // The hollow swatch takes the ramp's middle colour; on the map it takes each value's own.
  const few = ramps.full[Math.floor(ramps.full.length / 2)];
  return (
    <div className={`${styles.legend} ${panelOpen ? styles.besidePanel : ""}`}>
      <div className={styles.legendTitle}>
        {metric.title}
        {!reliability && `, ${metric.unit}`}
        {metric.note && <span className={styles.muted}> ({metric.note})</span>}
      </div>
      <div className={styles.legendPeriod}>{periodText(period)}</div>
      {continuous ? (
        <div className={styles.gradient} style={{ background: heatGradient(theme) }} />
      ) : (
        <div className={styles.swatches} style={columns}>
          {colors.map((c) => <span key={c} style={{ background: c }} />)}
        </div>
      )}
      {reliability ? (
        <div className={styles.classLabels} style={columns}>
          {RELIABILITY_LABELS.map((l, i) => (
            <span key={l}>{l} {RELIABILITY_RANGES[i]}</span>
          ))}
        </div>
      ) : (
        // Each break sits on the boundary between two swatches.
        <div className={styles.breakLabels}>
          {breakLabels(metric).map((l, i) => (
            <span key={l} style={{ left: `${((i + 1) / colors.length) * 100}%` }}>{l}</span>
          ))}
        </div>
      )}
      {!reliability && (
        <div className={styles.legendRow}>
          <span className={styles.fewTests} style={{ borderColor: few, background: `color-mix(in srgb, ${few} ${FEW_TESTS_FILL * 100}%, transparent)` }} />
          <span>İçi boş: {LOW_TESTS}&apos;dan az test (belirsiz)</span>
        </div>
      )}
      {view !== "kareler" && (
        <div className={styles.legendRow}>
          <span className={styles.noData} style={{ background: ramps.noData }} />
          <span>Ölçüm yok</span>
        </div>
      )}
    </div>
  );
}
