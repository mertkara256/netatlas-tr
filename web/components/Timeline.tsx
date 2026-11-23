import { useRef, type CSSProperties, type PointerEvent } from "react";
import { periodText, type PeriodInfo } from "@/lib/data";
import styles from "./Atlas.module.css";

/** A place along the track, from 0 (first period) to 1 (last), for the stylesheet's --at. */
const along = (i: number, count: number) => ({ "--at": count > 1 ? i / (count - 1) : 0 }) as CSSProperties;

/** The period at a pointer along the track: the nearest point, measured as the stylesheet places them
 *  (--pad in from each end of the track). */
function indexAt(e: PointerEvent<HTMLElement>, count: number): number {
  const box = e.currentTarget.getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(e.currentTarget).getPropertyValue("--pad")) || 0;
  const x = (e.clientX - box.left - pad) / Math.max(1, box.width - 2 * pad);
  return Math.min(count - 1, Math.max(0, Math.round(x * (count - 1))));
}

/** The period shown, as points on a line: the line is blue from the first period up to the one picked
 *  and grey after it. A press on the line picks the nearest point, and dragging moves the pick along
 *  it. Over the map a button beside it steps through the periods in turn. */
export default function Timeline({ periods, periodIndex, onPeriod, playing, onPlay }: {
  periods: PeriodInfo[];
  periodIndex: number;
  onPeriod: (index: number) => void;
  playing: boolean;
  /** Left out where there is no map to watch (the table). */
  onPlay?: () => void;
}) {
  const count = periods.length;
  // The line takes the pointer while it is pressed, so a drag keeps going past the points' edges.
  const dragging = useRef(false);
  const dragTo = (e: PointerEvent<HTMLDivElement>) => {
    const i = indexAt(e, count);
    if (i !== periodIndex) onPeriod(i);
  };
  return (
    <div className={styles.timeline}>
      {onPlay && (
        <button type="button" className={styles.play} aria-pressed={playing} aria-label="Dönemleri sırayla göster" onClick={onPlay}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            {playing ? <path d="M6 4h4v16H6zM14 4h4v16h-4z" /> : <path d="M7 4.5v15l13-7.5z" />}
          </svg>
        </button>
      )}
      <div
        className={styles.track}
        role="group"
        aria-label="Dönem"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = true;
          dragTo(e);
        }}
        onPointerMove={(e) => dragging.current && dragTo(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <span className={styles.trackLine} />
        <span className={styles.trackFill} style={{ "--from": 0, "--to": count > 1 ? periodIndex / (count - 1) : 0 } as CSSProperties} />
        {periods.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={styles.tick}
            data-state={i === periodIndex ? "on" : i < periodIndex ? "in" : "off"}
            style={along(i, count)}
            aria-label={periodText(p)}
            aria-pressed={i === periodIndex}
            title={periodText(p)}
            // A pointer picks through the line above; this is for the keyboard.
            onClick={() => i !== periodIndex && onPeriod(i)}
          >
            <span className={styles.tickDot} />
            {/* On phones a year is written short ('19). */}
            <span className={styles.tickLabel}>
              {p.id === "guncel" ? p.ad : (
                <>
                  <span className={styles.longYear}>{p.ad}</span>
                  <span className={styles.shortYear}>&apos;{p.ad.slice(2)}</span>
                </>
              )}
            </span>
          </button>
        ))}
      </div>
      <span className={styles.srOnly} aria-live="polite">Dönem: {periodText(periods[periodIndex])}</span>
    </div>
  );
}
