"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { loadAreas, type Area, type AreaKind, type PeriodInfo, type Selection, type View } from "@/lib/data";
import { metricById, type MetricId } from "@/lib/metrics";
import type { Place } from "@/lib/search";
import { useColorScheme } from "@/lib/useColorScheme";
import Controls from "./Controls";
import Legend from "./Legend";
import RegionPanel from "./RegionPanel";
import SearchBox from "./SearchBox";
import Tooltip, { type HoverInfo } from "./Tooltip";
import styles from "./Atlas.module.css";

// MapLibre needs the browser, so the map is left out of the prerendered HTML.
const MapView = dynamic(() => import("./MapView"), { ssr: false });

export default function Atlas({ periods }: { periods: PeriodInfo[] }) {
  const theme = useColorScheme();
  const [periodIndex, setPeriodIndex] = useState(periods.length - 1);
  const [metricId, setMetricId] = useState<MetricId>("indirme");
  const [view, setView] = useState<View>("kareler");
  const [areas, setAreas] = useState<Partial<Record<AreaKind, Record<string, Area>>>>({});
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  // Province and district values are fetched only when a view or the panel needs them;
  // the panel always needs the provinces, for BTK figures and Türkiye's values.
  useEffect(() => {
    const needed = new Set<AreaKind>();
    if (view !== "kareler") needed.add(view);
    if (selection) needed.add("iller").add(selection.kind);
    let cancelled = false;
    for (const kind of needed) {
      if (areas[kind]) continue;
      loadAreas(kind).then((data) => {
        if (!cancelled) setAreas((loaded) => ({ ...loaded, [kind]: data }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [view, selection, areas]);

  const period = periods[periodIndex];
  const metric = metricById(metricId);
  // Any change of what is shown makes an open tooltip stale.
  const andClearHover = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setHover(null);
  };
  const closePanel = useCallback(() => setSelection(null), []);
  // A search result opens its panel and brings it into view; the counter lets the same place
  // be flown to again.
  const [focus, setFocus] = useState<{ bbox: Place["bbox"]; count: number } | null>(null);
  const pickPlace = (place: Place) => {
    setSelection({ kind: place.tur === "il" ? "iller" : "ilceler", code: place.kod });
    setFocus((last) => ({ bbox: place.bbox, count: (last?.count ?? 0) + 1 }));
    setHover(null);
  };

  return (
    <>
      <header className={styles.header}>
        <div className={styles.brand}>
          <h1 className={styles.title}>NetAtlas TR</h1>
          <p className={styles.subtitle}>Türkiye&apos;de ölçülen sabit internet hızları, 475 m&apos;lik karelere kadar</p>
        </div>
        <SearchBox onPick={pickPlace} />
        <nav aria-label="Sayfalar">
          <Link className={styles.navLink} href="/il/">İller</Link>
        </nav>
      </header>
      <Controls
        periods={periods}
        periodIndex={periodIndex}
        onPeriod={andClearHover(setPeriodIndex)}
        metric={metricId}
        onMetric={andClearHover(setMetricId)}
        view={view}
        onView={andClearHover(setView)}
      />
      <div className={styles.body}>
        <div className={styles.mapWrap} role="region" aria-label="Hız haritası">
          <MapView
            period={period}
            metric={metric}
            view={view}
            theme={theme}
            areas={view === "kareler" ? null : areas[view] ?? null}
            selection={selection}
            focus={focus}
            onHover={setHover}
            onSelect={setSelection}
          />
          <Legend metric={metric} period={period} view={view} theme={theme} panelOpen={selection !== null} />
          {hover && <Tooltip info={hover} />}
        </div>
        {selection && (
          <RegionPanel
            selection={selection}
            areas={areas}
            periods={periods}
            period={period}
            metric={metric}
            onClose={closePanel}
            onSelect={setSelection}
          />
        )}
      </div>
    </>
  );
}
