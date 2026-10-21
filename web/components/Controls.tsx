import { periodText, type PeriodInfo, type View } from "@/lib/data";
import { METRICS, type MetricId } from "@/lib/metrics";
import styles from "./Atlas.module.css";

export type Display = "harita" | "tablo";

const DISPLAYS: { id: Display; label: string }[] = [
  { id: "harita", label: "Harita" },
  { id: "tablo", label: "Tablo" },
];

const VIEWS: { id: View; label: string }[] = [
  { id: "kareler", label: "Isı haritası" },
  { id: "ilceler", label: "İlçeler" },
  { id: "iller", label: "İller" },
];

function Segmented<T extends string>(props: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className={styles.field}>
      <span className={`${styles.fieldLabel} ${styles.groupLabel}`}>{props.label}</span>
      <div className={styles.segmented} role="group" aria-label={props.label}>
        {props.options.map((o) => (
          <button key={o.id} type="button" aria-pressed={o.id === props.value} onClick={() => props.onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Controls(props: {
  periods: PeriodInfo[];
  periodIndex: number;
  onPeriod: (index: number) => void;
  metric: MetricId;
  onMetric: (id: MetricId) => void;
  view: View;
  onView: (view: View) => void;
  display: Display;
  onDisplay: (display: Display) => void;
}) {
  const period = props.periods[props.periodIndex];
  return (
    <div className={styles.controls}>
      <label className={`${styles.field} ${styles.periodField}`}>
        <span className={styles.fieldLabel}>
          Dönem: <strong>{periodText(period)}</strong>
        </span>
        <input
          type="range"
          min={0}
          max={props.periods.length - 1}
          step={1}
          value={props.periodIndex}
          onChange={(e) => props.onPeriod(Number(e.target.value))}
          aria-valuetext={periodText(period)}
        />
        <span className={styles.ticks} aria-hidden="true">
          {props.periods.map((p) => (
            <span key={p.id}>{p.id === "guncel" ? p.ad : `'${p.ad.slice(2)}`}</span>
          ))}
        </span>
      </label>
      <Segmented
        label="Gösterge"
        options={METRICS.map((m) => ({ id: m.id, label: m.label }))}
        value={props.metric}
        onChange={props.onMetric}
      />
      <Segmented label="Görünüm" options={VIEWS} value={props.view} onChange={props.onView} />
      <Segmented label="Gösterim" options={DISPLAYS} value={props.display} onChange={props.onDisplay} />
    </div>
  );
}
