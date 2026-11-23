import { useEffect, useId, useRef, useState } from "react";
import { FEW_TESTS_FILL, RAMPS, heatGradient, type Theme } from "@/lib/colors";
import { periodText, type PeriodInfo, type View } from "@/lib/data";
import { LOW_TESTS, RELIABILITY_LABELS, RELIABILITY_RANGES, breakLabels, type Metric } from "@/lib/metrics";
import styles from "./Atlas.module.css";

/** What the colours mean, in one line beside the period (Atlas's dock): the scale with its breaks. The
 *  ⓘ button opens the rest: the metric's full name, the period, and what hollow, hatched and empty
 *  places mean. */
export default function Legend({ metric, period, view, theme }: {
  metric: Metric;
  period: PeriodInfo;
  view: View;
  theme: Theme;
}) {
  const ramps = RAMPS[theme];
  const reliability = metric.id === "guvenilirlik";
  // Speeds are coloured continuously in every view; reliability keeps its three classes.
  const colors = reliability ? ramps.reliability : ramps.full;
  const columns = { gridTemplateColumns: `repeat(${colors.length}, 1fr)` };
  // The few-test swatch (hollow for cells, hatched for areas) takes the ramp's middle colour; on
  // the map it takes each value's own.
  const few = ramps.full[Math.floor(ramps.full.length / 2)];
  const faint = `color-mix(in srgb, ${few} ${FEW_TESTS_FILL * 100}%, transparent)`;

  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  // Closed by Escape or by a press anywhere else.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onPress = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPress);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPress);
    };
  }, [open]);

  return (
    <div ref={box} className={styles.legend}>
      <div className={styles.legendScale}>
        <span className={styles.legendTitle}>
          {metric.label}
          {!reliability && `, ${metric.unit}`}
        </span>
        {reliability ? (
          <>
            <div className={styles.swatches} style={columns}>
              {colors.map((c) => <span key={c} style={{ background: c }} />)}
            </div>
            <div className={styles.classLabels} style={columns}>
              {RELIABILITY_LABELS.map((l) => <span key={l}>{l}</span>)}
            </div>
          </>
        ) : (
          <>
            <div className={styles.gradient} style={{ background: heatGradient(theme) }} />
            {/* Each break sits on the boundary between two colours of the ramp. */}
            <div className={styles.breakLabels}>
              {breakLabels(metric).map((l, i) => (
                <span key={l} style={{ left: `${((i + 1) / colors.length) * 100}%` }}>{l}</span>
              ))}
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        className={styles.legendInfo}
        aria-expanded={open}
        aria-controls={id}
        aria-label="Renklerin ve boş yerlerin anlamı"
        onClick={() => setOpen(!open)}
      >
        i
      </button>
      {open && (
        <div id={id} className={styles.legendPopover}>
          <div className={styles.legendPopoverTitle}>
            {metric.title}
            {!reliability && `, ${metric.unit}`}
            {metric.note && <span className={styles.muted}> ({metric.note})</span>}
          </div>
          <div className={styles.muted}>{periodText(period)}</div>
          {reliability && (
            <ul className={styles.legendList}>
              {RELIABILITY_LABELS.map((l, i) => (
                <li key={l} className={styles.legendRow}>
                  <span className={styles.noData} style={{ background: colors[i] }} />
                  <span>{l}: {RELIABILITY_RANGES[i]}</span>
                </li>
              ))}
            </ul>
          )}
          <ul className={styles.legendList}>
            {!reliability && (
              <li className={styles.legendRow}>
                {view === "kareler" ? (
                  <span className={styles.fewTests} style={{ borderColor: few, background: faint }} />
                ) : (
                  <span className={styles.fewTests} style={{ borderColor: "transparent", background: `repeating-linear-gradient(135deg, ${few} 0 2px, ${faint} 2px 5px)` }} />
                )}
                <span>{view === "kareler" ? "İçi boş" : "Taralı"}: {LOW_TESTS}&apos;dan az test (belirsiz)</span>
              </li>
            )}
            {view === "kareler" ? (
              <li className={styles.legendRow}>
                <span className={`${styles.noData} ${styles.empty}`} />
                <span>Boş yerler: ölçüm yok</span>
              </li>
            ) : (
              <li className={styles.legendRow}>
                <span className={styles.noData} style={{ background: ramps.noData }} />
                <span>Ölçüm yok</span>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
