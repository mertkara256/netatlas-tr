import { useState } from "react";
import { NATIONAL, periodText, type Area, type AreaKind, type PeriodInfo, type Selection } from "@/lib/data";
import { formatNumber, formatValue } from "@/lib/format";
import { LOW_TESTS, RELIABILITY_LABELS, classIndex, metricById, type Metric } from "@/lib/metrics";
import { normalize } from "@/lib/search";
import styles from "./AreaTable.module.css";

type Column = "ad" | "il" | "indirme_mbps" | "yukleme_mbps" | "gecikme_ms" | "test";
type Row = { code: string; ad: string; il?: string; values?: Area["hiz"][string] };

const DOWNLOAD = metricById("indirme");
const UPLOAD = metricById("yukleme");
const LATENCY = metricById("gecikme");

/** The map without the map: every province or district for one period, sortable and filterable. */
export default function AreaTable({ kind, areas, provinces, period, metric, onSelect }: {
  kind: AreaKind;
  areas: Record<string, Area>;
  /** For district rows' province names. */
  provinces: Record<string, Area>;
  period: PeriodInfo;
  metric: Metric;
  onSelect: (selection: Selection) => void;
}) {
  const [query, setQuery] = useState("");
  // Until a header is clicked, sort by the chosen metric, best first.
  const [sort, setSort] = useState<{ column: Column; dir: 1 | -1 } | null>(null);
  const order = sort ?? {
    column: (metric.id === "guvenilirlik" ? "test" : metric.areaKey) as Column,
    dir: metric.id === "gecikme" ? 1 : -1,
  };

  const q = normalize(query);
  const rows: Row[] = Object.entries(areas)
    .filter(([code]) => code !== NATIONAL)
    .map(([code, a]) => ({
      code,
      ad: a.ad,
      il: kind === "ilceler" && a.il_kodu ? provinces[a.il_kodu]?.ad : undefined,
      values: a.hiz[period.id],
    }))
    .filter((r) => !q || normalize(`${r.ad} ${r.il ?? ""}`).includes(q))
    .sort((a, b) => {
      const x = order.column === "ad" || order.column === "il" ? a[order.column] : a.values?.[order.column];
      const y = order.column === "ad" || order.column === "il" ? b[order.column] : b.values?.[order.column];
      if (x == null || y == null) return Number(x == null) - Number(y == null); // no data last
      return order.dir * (typeof x === "string" ? x.localeCompare(y as string, "tr") : (x as number) - (y as number));
    });

  const columns: { key: Column; label: string; numeric?: boolean }[] = [
    { key: "ad", label: kind === "iller" ? "İl" : "İlçe" },
    ...(kind === "ilceler" ? [{ key: "il" as const, label: "İl" }] : []),
    { key: "indirme_mbps", label: "İndirme", numeric: true },
    { key: "yukleme_mbps", label: "Yükleme", numeric: true },
    { key: "gecikme_ms", label: "Gecikme", numeric: true },
    { key: "test", label: "Test", numeric: true },
  ];

  return (
    <div className={styles.wrap}>
      <div className={styles.bar}>
        <input
          type="search"
          aria-label={kind === "iller" ? "İllerde ara" : "İlçelerde ara"}
          placeholder={kind === "iller" ? "İllerde ara" : "İlçe ya da il ara"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className={styles.count} aria-live="polite">{formatNumber(rows.length)} {kind === "iller" ? "il" : "ilçe"}</span>
      </div>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <caption className={styles.caption}>
            {kind === "iller" ? "İller" : "İlçeler"}, {periodText(period)}. Ada tıklayınca bölge paneli açılır.
            Sütun başlıklarıyla sıralanır.
          </caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const sorted = order.column === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={c.numeric ? styles.num : undefined}
                    aria-sort={sorted ? (order.dir === 1 ? "ascending" : "descending") : "none"}
                  >
                    <button
                      type="button"
                      onClick={() => setSort({ column: c.key, dir: sorted ? (-order.dir as 1 | -1) : c.numeric ? -1 : 1 })}
                    >
                      {c.label}
                      <span aria-hidden="true">{sorted ? (order.dir === 1 ? " ↑" : " ↓") : ""}</span>
                    </button>
                  </th>
                );
              })}
              <th scope="col">Güvenilirlik</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <th scope="row">
                  <button type="button" className={styles.name} onClick={() => onSelect({ kind, code: r.code })}>{r.ad}</button>
                </th>
                {kind === "ilceler" && <td>{r.il}</td>}
                {r.values ? (
                  <>
                    <td className={styles.num}>{formatValue(DOWNLOAD, r.values.indirme_mbps)}</td>
                    <td className={styles.num}>{formatValue(UPLOAD, r.values.yukleme_mbps)}</td>
                    <td className={styles.num}>{formatValue(LATENCY, r.values.gecikme_ms)}</td>
                    <td className={styles.num}>{formatNumber(r.values.test)}</td>
                    <td className={r.values.test < LOW_TESTS ? styles.low : undefined}>
                      {RELIABILITY_LABELS[classIndex(r.values.test, [LOW_TESTS, 50])]}
                    </td>
                  </>
                ) : (
                  <td colSpan={5} className={styles.muted}>Bu dönemde ölçüm yok</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
