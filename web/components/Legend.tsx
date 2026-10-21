import { RAMPS, type Theme } from "@/lib/colors";
import { periodText, type PeriodInfo, type View } from "@/lib/data";
import { LOW_TESTS, RELIABILITY_LABELS, breakLabels, type Metric } from "@/lib/metrics";
import styles from "./Atlas.module.css";

export default function Legend({ metric, period, view, theme }: {
  metric: Metric;
  period: PeriodInfo;
  view: View;
  theme: Theme;
}) {
  const ramps = RAMPS[theme];
  const reliability = metric.id === "guvenilirlik";
  const colors = reliability ? ramps.reliability : ramps.full;
  const columns = { gridTemplateColumns: `repeat(${colors.length}, 1fr)` };
  return (
    <div className={styles.legend}>
      <div className={styles.legendTitle}>
        {metric.title}
        {!reliability && `, ${metric.unit}`}
        {metric.note && <span className={styles.muted}> ({metric.note})</span>}
      </div>
      <div className={styles.legendPeriod}>{periodText(period)}</div>
      <div className={styles.swatches} style={columns}>
        {colors.map((c) => <span key={c} style={{ background: c }} />)}
      </div>
      {reliability ? (
        <div className={styles.classLabels} style={columns}>
          {RELIABILITY_LABELS.map((l, i) => (
            <span key={l}>{l} {["<10", "10–49", "50+"][i]}</span>
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
          <span className={`${styles.swatches} ${styles.small}`} style={columns}>
            {ramps.muted.map((c) => <span key={c} style={{ background: c }} />)}
          </span>
          <span>Gri: {LOW_TESTS}&apos;dan az test (belirsiz)</span>
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
