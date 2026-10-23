"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadAreas, type Area, type AreaKind, type PeriodInfo, type Selection, type View } from "@/lib/data";
import { metricById, type MetricId } from "@/lib/metrics";
import type { Place } from "@/lib/search";
import { useColorScheme } from "@/lib/useColorScheme";
import AreaTable from "./AreaTable";
import Controls, { type Display } from "./Controls";
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
  const [areaErrors, setAreaErrors] = useState<Partial<Record<AreaKind, boolean>>>({});
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [display, setDisplay] = useState<Display>("harita");
  // The table lists provinces in the province view and districts otherwise (cells are too many).
  const tableKind: AreaKind = view === "iller" ? "iller" : "ilceler";

  // Province and district values are fetched only when a view, the table or the panel needs
  // them; the table and the panel always need the provinces (names, BTK, Türkiye's values).
  const selectedKind = selection?.kind;
  const needed = useMemo(() => {
    const needed = new Set<AreaKind>();
    if (view !== "kareler") needed.add(view);
    if (display === "tablo") needed.add("iller").add(tableKind);
    if (selectedKind) needed.add("iller").add(selectedKind);
    return [...needed];
  }, [view, display, tableKind, selectedKind]);
  useEffect(() => {
    let cancelled = false;
    for (const kind of needed) {
      // A failed kind waits for the retry button rather than retrying on every render.
      if (areas[kind] || areaErrors[kind]) continue;
      loadAreas(kind).then((data) => {
        if (!cancelled) setAreas((loaded) => ({ ...loaded, [kind]: data }));
      }).catch(() => {
        if (!cancelled) setAreaErrors((errors) => ({ ...errors, [kind]: true }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [needed, areas, areaErrors]);
  const loadingFailed = needed.some((kind) => areaErrors[kind]);

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
        <nav className={styles.nav} aria-label="Sayfalar">
          <Link className={styles.navLink} href="/il/">İller</Link>
          <Link className={styles.navLink} href="/yontem/">Yöntem</Link>
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
        display={display}
        onDisplay={andClearHover(setDisplay)}
      />
      {loadingFailed && (
        <div className={styles.loadError} role="alert">
          <p>Bölge verileri yüklenemedi. Bağlantını kontrol edip yeniden deneyebilirsin.</p>
          <button type="button" onClick={() => setAreaErrors({})}>Yeniden dene</button>
        </div>
      )}
      <div className={styles.body}>
        {/* Hidden rather than removed in table mode, so the map keeps its view. */}
        <div className={styles.mapWrap} role="region" aria-label="Hız haritası" hidden={display === "tablo"}>
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
        {display === "tablo" && (
          areas[tableKind] && areas.iller ? (
            <AreaTable
              kind={tableKind}
              areas={areas[tableKind]}
              provinces={areas.iller}
              period={period}
              metric={metric}
              onSelect={setSelection}
            />
          ) : (
            <p className={styles.loading}>
              {areaErrors[tableKind] || areaErrors.iller ? "Tablo verileri yüklenemedi." : "Yükleniyor…"}
            </p>
          )
        )}
        {selection && (
          <RegionPanel
            selection={selection}
            areas={areas}
            periods={periods}
            period={period}
            metric={metric}
            loadingFailed={Boolean(areaErrors[selection.kind] || areaErrors.iller)}
            onClose={closePanel}
            onSelect={setSelection}
          />
        )}
      </div>
    </>
  );
}
