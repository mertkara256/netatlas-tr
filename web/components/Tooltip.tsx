import styles from "./Atlas.module.css";

export type HoverInfo = {
  /** Pointer position and map size in px, to keep the box inside the map. */
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  subtitle: string;
  value: string | null;
  rows: [string, string][];
};

const WIDTH = 224; // px, matches .tooltip in Atlas.module.css
const GAP = 14;
const MARGIN = 8;

export default function Tooltip({ info }: { info: HoverInfo }) {
  // Beside the pointer where there is room, otherwise clamped inside the map (narrow phones).
  const right = info.x + GAP + WIDTH <= info.width - MARGIN;
  const left = right ? info.x + GAP : Math.max(MARGIN, Math.min(info.x - GAP - WIDTH, info.width - WIDTH - MARGIN));
  const above = info.y > info.height / 2;
  const style = {
    left,
    top: info.y,
    transform: `translateY(${above ? `calc(-100% - ${GAP}px)` : `${GAP}px`})`,
  };
  return (
    <div className={styles.tooltip} style={style} role="status">
      <div className={styles.tooltipTitle}>{info.title}</div>
      <div className={styles.muted}>{info.subtitle}</div>
      {info.value ? <div className={styles.tooltipValue}>{info.value}</div> : <div>Bu dönemde ölçüm yok</div>}
      {info.rows.length > 0 && (
        <dl>
          {info.rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
