import { periodText, type PeriodInfo } from "@/lib/data";
import styles from "./Atlas.module.css";

/** The period shown: a button per period, and over the map a button that steps through them in turn. */
export default function Timeline({ periods, periodIndex, onPeriod, playing, onPlay }: {
  periods: PeriodInfo[];
  periodIndex: number;
  onPeriod: (index: number) => void;
  playing: boolean;
  /** Left out where there is no map to watch (the table). */
  onPlay?: () => void;
}) {
  return (
    <div className={styles.timeline} role="group" aria-label="Dönem">
      {onPlay && (
        <button type="button" className={styles.play} aria-pressed={playing} aria-label="Dönemleri sırayla göster" onClick={onPlay}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            {playing ? <path d="M6 4h4v16H6zM14 4h4v16h-4z" /> : <path d="M7 4.5v15l13-7.5z" />}
          </svg>
        </button>
      )}
      <div className={styles.timelineBody}>
        <span className={styles.fieldLabel} aria-live="polite">
          Dönem: <strong>{periodText(periods[periodIndex])}</strong>
        </span>
        <div className={styles.periodButtons}>
          {periods.map((p, i) => (
            // On phones a year is written short ('19); the button keeps its full name.
            <button key={p.id} type="button" aria-label={p.ad} aria-pressed={i === periodIndex} onClick={() => onPeriod(i)}>
              {p.id === "guncel" ? p.ad : (
                <>
                  <span className={styles.longYear}>{p.ad}</span>
                  <span className={styles.shortYear}>&apos;{p.ad.slice(2)}</span>
                </>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
