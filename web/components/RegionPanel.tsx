import Link from "next/link";
import { useEffect, useRef } from "react";
import { NATIONAL, type Area, type AreaKind, type PeriodInfo, type Selection } from "@/lib/data";
import type { Metric } from "@/lib/metrics";
import { provincePath } from "@/lib/slug";
import RegionDetails from "./RegionDetails";
import styles from "./RegionPanel.module.css";

export default function RegionPanel({ selection, areas, periods, period, metric, onClose, onSelect }: {
  selection: Selection;
  areas: Partial<Record<AreaKind, Record<string, Area>>>;
  periods: PeriodInfo[];
  period: PeriodInfo;
  metric: Metric;
  onClose: () => void;
  onSelect: (selection: Selection) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [selection.kind, selection.code]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const provinces = areas.iller;
  const area = areas[selection.kind]?.[selection.code];
  const provinceCode = selection.kind === "iller" ? selection.code : area?.il_kodu;
  const province = provinceCode ? provinces?.[provinceCode] : undefined;
  const national = provinces?.[NATIONAL];

  return (
    <aside className={styles.panel} aria-label="Bölge bilgileri">
      <div className={styles.head}>
        <div>
          <h2 ref={heading} tabIndex={-1}>{area?.ad ?? "Yükleniyor…"}</h2>
          <p className={styles.kind}>
            {selection.kind === "iller" ? "İl" : "İlçe"}
            {selection.kind === "ilceler" && province && provinceCode && (
              <>
                {" · "}
                <button type="button" className={styles.link} onClick={() => onSelect({ kind: "iller", code: provinceCode })}>
                  {province.ad}
                </button>
              </>
            )}
            {province && (
              <>
                {" · "}
                <Link className={styles.link} href={provincePath(province.ad)}>İl sayfası</Link>
              </>
            )}
          </p>
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Paneli kapat">×</button>
      </div>

      {area && province?.btk && national?.btk && (
        <RegionDetails
          area={area}
          province={province}
          national={national}
          isDistrict={selection.kind === "ilceler"}
          periods={periods}
          period={period}
          metric={metric}
          cell={selection.cell}
        />
      )}
    </aside>
  );
}
