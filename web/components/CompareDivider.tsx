import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import styles from "./Atlas.module.css";

// How far the line can go towards either edge, and how far an arrow key moves it, in percent.
const EDGE = 4;
const STEP = 5;

const clamp = (value: number) => Math.min(100 - EDGE, Math.max(EDGE, value));

/** The line between the two periods of a comparison: the left period's map shows left of it. Dragged
 *  by its handle, or moved with the arrow keys once the handle has focus. */
export default function CompareDivider({ split, onSplit, left, right }: {
  /** The line's place, in percent of the map's width from its left edge. */
  split: number;
  onSplit: (split: number) => void;
  /** The periods' names, written on each side of the line. */
  left: string;
  right: string;
}) {
  const line = useRef<HTMLDivElement>(null);
  const dragTo = (e: PointerEvent) => {
    const box = line.current?.parentElement?.getBoundingClientRect();
    if (box?.width) onSplit(clamp(((e.clientX - box.left) / box.width) * 100));
  };
  const onKey = (e: KeyboardEvent) => {
    const next = { ArrowLeft: split - STEP, ArrowRight: split + STEP, Home: EDGE, End: 100 - EDGE }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onSplit(clamp(next));
  };
  return (
    <div ref={line} className={styles.compareLine} style={{ left: `${split}%` }}>
      <span className={`${styles.compareLabel} ${styles.compareLabelLeft}`} aria-hidden="true">{left}</span>
      <span className={styles.compareLabel} aria-hidden="true">{right}</span>
      <div
        className={styles.compareHandle}
        role="slider"
        tabIndex={0}
        aria-label="Karşılaştırma çizgisi"
        aria-valuemin={EDGE}
        aria-valuemax={100 - EDGE}
        aria-valuenow={Math.round(split)}
        aria-valuetext={`Solda ${left}, sağda ${right}; çizgi soldan yüzde ${Math.round(split)}`}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragTo(e);
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && dragTo(e)}
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l-5 6 5 6M15 6l5 6-5 6" />
        </svg>
      </div>
    </div>
  );
}
