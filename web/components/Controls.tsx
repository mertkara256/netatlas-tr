import type { ReactNode } from "react";
import type { View } from "@/lib/data";
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

/** What the map shows and how. Over the map (floating) the groups take its top edge, unlabelled; above
 *  the table they form a bar with their labels, followed by `children` (the period). */
export default function Controls(props: {
  metric: MetricId;
  onMetric: (id: MetricId) => void;
  view: View;
  onView: (view: View) => void;
  display: Display;
  onDisplay: (display: Display) => void;
  floating: boolean;
  children?: ReactNode;
}) {
  const groups = (
    <>
      <Segmented
        label="Gösterge"
        options={METRICS.map((m) => ({ id: m.id, label: m.label }))}
        value={props.metric}
        onChange={props.onMetric}
      />
      <Segmented label="Görünüm" options={VIEWS} value={props.view} onChange={props.onView} />
    </>
  );
  const display = <Segmented label="Gösterim" options={DISPLAYS} value={props.display} onChange={props.onDisplay} />;
  return props.floating ? (
    <div className={styles.mapControls}>
      <div className={styles.mapControlsMain}>{groups}</div>
      {display}
    </div>
  ) : (
    <div className={styles.controls}>
      {props.children}
      {groups}
      {display}
    </div>
  );
}
