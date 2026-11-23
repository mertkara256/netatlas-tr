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
 *  it. Over the map a button beside it steps through the periods in turn. While two periods are
 *  compared the line has two handles, Sol (the left map) and Sağ (the right one), blue between them:
 *  a press moves the nearer handle (or the one pressed) and a drag carries it, never onto or past the
 *  other, so Sol stays before Sağ. */
export default function Timeline({ periods, periodIndex, onPeriod, playing, onPlay, compare }: {
  periods: PeriodInfo[];
  periodIndex: number;
  onPeriod: (index: number) => void;
  playing: boolean;
  /** Left out where there is no map to watch (the table). */
  onPlay?: () => void;
  /** The left map's period while two are compared; the right map shows `periodIndex`. */
  compare?: { index: number; onPick: (index: number) => void } | null;
}) {
  const count = periods.length;
  const left = compare ? compare.index : null;
  const [from, to] = left === null ? [0, periodIndex] : [Math.min(left, periodIndex), Math.max(left, periodIndex)];
  const state = (i: number) => i === left ? "ring" : i === periodIndex ? "on" : i > from && i < to ? "in" : "off";

  /** Which handle a press at point i takes: the one there, else the nearer (Sağ on a tie). */
  const handleFor = (i: number) =>
    left === null || i === periodIndex ? "right" : i === left || Math.abs(i - left) < Math.abs(i - periodIndex) ? "left" : "right";
  /** Moves a handle to point i, short of the other handle. */
  const move = (handle: "left" | "right", i: number) => {
    if (handle === "left" && compare) {
      const next = Math.min(i, periodIndex - 1);
      if (next !== left && next >= 0) compare.onPick(next);
    } else {
      const next = left === null ? i : Math.max(i, left + 1);
      if (next !== periodIndex && next < count) onPeriod(next);
    }
  };

  // The line takes the pointer while it is pressed, so a drag keeps going past the points' edges.
  const grabbed = useRef<"left" | "right" | null>(null);
  const name = (i: number) => periodText(periods[i]) + (i === left ? ", solda" : i === periodIndex && left !== null ? ", sağda" : "");
  return (
    <div className={styles.timeline}>
      {onPlay && left === null && (
        <button type="button" className={styles.play} aria-pressed={playing} aria-label="Dönemleri sırayla göster" onClick={onPlay}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            {playing ? <path d="M6 4h4v16H6zM14 4h4v16h-4z" /> : <path d="M7 4.5v15l13-7.5z" />}
          </svg>
        </button>
      )}
      <div
        className={styles.track}
        role="group"
        aria-label={left === null ? "Dönem" : "Karşılaştırılan dönemler"}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const i = indexAt(e, count);
          grabbed.current = handleFor(i);
          move(grabbed.current, i);
        }}
        onPointerMove={(e) => grabbed.current && move(grabbed.current, indexAt(e, count))}
        onPointerUp={() => (grabbed.current = null)}
        onPointerCancel={() => (grabbed.current = null)}
      >
        <span className={styles.trackLine} />
        <span className={styles.trackFill} style={{ "--from": from / Math.max(1, count - 1), "--to": to / Math.max(1, count - 1) } as CSSProperties} />
        {periods.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={styles.tick}
            data-state={state(i)}
            style={along(i, count)}
            aria-label={name(i)}
            aria-pressed={i === periodIndex || i === left}
            title={periodText(p)}
            // A pointer picks through the line above; this is for the keyboard.
            onClick={() => i !== periodIndex && i !== left && move(handleFor(i), i)}
          >
            {left !== null && (i === left || i === periodIndex) && (
              <span className={styles.tickTag} aria-hidden="true">{i === left ? "Sol" : "Sağ"}</span>
            )}
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
      <span className={styles.srOnly} aria-live="polite">
        {left === null ? `Dönem: ${periodText(periods[periodIndex])}` : `Solda ${periods[left].ad}, sağda ${periods[periodIndex].ad}`}
      </span>
    </div>
  );
}
