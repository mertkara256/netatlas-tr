"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { loadAreas, type Area, type AreaKind, type PeriodInfo, type View } from "@/lib/data";
import { metricById, type MetricId } from "@/lib/metrics";
import { useColorScheme } from "@/lib/useColorScheme";
import Controls from "./Controls";
import Legend from "./Legend";
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

  // Province and district values are only fetched once their view is opened.
  useEffect(() => {
    if (view === "kareler" || areas[view]) return;
    let cancelled = false;
    loadAreas(view).then((data) => {
      if (!cancelled) setAreas((loaded) => ({ ...loaded, [view]: data }));
    });
    return () => {
      cancelled = true;
    };
  }, [view, areas]);

  const period = periods[periodIndex];
  const metric = metricById(metricId);
  // Any change of what is shown makes an open tooltip stale.
  const andClearHover = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setHover(null);
  };

  return (
    <>
      <Controls
        periods={periods}
        periodIndex={periodIndex}
        onPeriod={andClearHover(setPeriodIndex)}
        metric={metricId}
        onMetric={andClearHover(setMetricId)}
        view={view}
        onView={andClearHover(setView)}
      />
      <div className={styles.mapWrap} role="region" aria-label="Hız haritası">
        <MapView
          period={period}
          metric={metric}
          view={view}
          theme={theme}
          areas={view === "kareler" ? null : areas[view] ?? null}
          onHover={setHover}
        />
        <Legend metric={metric} period={period} view={view} theme={theme} />
        {hover && <Tooltip info={hover} />}
      </div>
    </>
  );
}
