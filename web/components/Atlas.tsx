"use client";

import dynamic from "next/dynamic";
import type { Map as MapLibreMap } from "maplibre-gl";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { loadAreas, NATIONAL, REPO_URL, type Area, type AreaKind, type PeriodInfo, type Selection, type View } from "@/lib/data";
import { formatMapHash, parseMapHash, type Camera, type MoveMark } from "@/lib/mapHash";
import { metricById, type MetricId } from "@/lib/metrics";
import { loadPlaces, type Place } from "@/lib/search";
import { syncMaps } from "@/lib/syncMaps";
import { useColorScheme } from "@/lib/useColorScheme";
import AreaTable from "./AreaTable";
import CompareDivider from "./CompareDivider";
import Controls, { type Display } from "./Controls";
import Legend from "./Legend";
import MapLoading from "./MapLoading";
import RegionPanel from "./RegionPanel";
import SearchBox from "./SearchBox";
import Timeline from "./Timeline";
import Tooltip, { type HoverInfo } from "./Tooltip";
import styles from "./Atlas.module.css";

// While the periods play in turn, how long each stays on screen once its cells are drawn.
const PLAY_STEP = 1200; // ms

// The hash this page last wrote into its address (see Atlas), which is not read back as a change.
// Forgotten when the map page closes, so coming back to the same address reads it again.
let writtenHash: string | null = null;
const subscribeHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const currentHash = () => window.location.hash;
const noHash = () => null;

// MapLibre needs the browser, so the map is left out of the prerendered HTML.
const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <MapLoading /> });

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
  // An area named in the address waits here until its kind is loaded, which tells whether it exists,
  // with the position the address gives, if any, for once its panel has opened.
  const [pending, setPending] = useState<{ kind: AreaKind; code: string; camera: Camera | null } | null>(null);
  // The table lists provinces in the province view and districts otherwise (cells are too many).
  const tableKind: AreaKind = view === "iller" ? "iller" : "ilceler";

  // Province and district values are fetched only when a view, the table or the panel needs
  // them; the table and the panel always need the provinces (names, BTK, Türkiye's values).
  const selectedKind = selection?.kind;
  const pendingKind = pending?.kind;
  const needed = useMemo(() => {
    const needed = new Set<AreaKind>();
    if (view !== "kareler") needed.add(view);
    if (display === "tablo") needed.add("iller").add(tableKind);
    if (selectedKind) needed.add("iller").add(selectedKind);
    if (pendingKind) needed.add("iller").add(pendingKind);
    return [...needed];
  }, [view, display, tableKind, selectedKind, pendingKind]);
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

  // Playing steps through the periods from the first, each shown once the map has drawn it. Picking a
  // period or the table stops it.
  const [playRequested, setPlaying] = useState(false);
  const [drawnPeriod, setDrawnPeriod] = useState<string | null>(null);
  const last = periods.length - 1;
  // It ends once the last period is drawn.
  const playing = playRequested && !(periodIndex === last && drawnPeriod === period.id);
  useEffect(() => {
    if (!playing || drawnPeriod !== period.id) return;
    const timer = setTimeout(() => {
      setPeriodIndex(periodIndex + 1);
      setHover(null);
    }, PLAY_STEP);
    return () => clearTimeout(timer);
  }, [playing, drawnPeriod, period.id, periodIndex, last]);
  const togglePlay = () => {
    if (!playing && periodIndex === last) setPeriodIndex(0);
    setPlaying(!playing);
    setHover(null);
  };
  // Comparing puts another period's map over the left part of this one, up to a line the reader
  // drags; the two maps move together. The right map is the period picked as usual, the left one
  // its own. Only over the map: the table shows one period.
  const [leftIndex, setLeftIndex] = useState<number | null>(null);
  const [split, setSplit] = useState(50);
  const comparing = leftIndex !== null && display === "harita";
  const toggleCompare = () => {
    setHover(null);
    if (leftIndex !== null) return setLeftIndex(null);
    setPlaying(false);
    // The first period on the left, against the one on screen, or the latest if that is the first.
    if (periodIndex === 0) setPeriodIndex(last);
    setLeftIndex(0);
  };
  const pickLeft = (index: number) => {
    setLeftIndex(index);
    setHover(null);
  };
  const [mainMap, setMainMap] = useState<MapLibreMap | null>(null);
  const [leftMap, setLeftMap] = useState<MapLibreMap | null>(null);
  useEffect(() => {
    if (comparing && mainMap && leftMap) return syncMaps(mainMap, leftMap);
  }, [comparing, mainMap, leftMap]);

  const pickPeriod = (index: number) => {
    setPlaying(false);
    setPeriodIndex(index);
    setHover(null);
  };
  // The map-or-table switch is drawn afresh in its new place (over the map or in the table's bar),
  // so focus follows it there.
  const displaySwitched = useRef(false);
  const pickDisplay = (next: Display) => {
    if (next === "tablo") setPlaying(false);
    displaySwitched.current = true;
    setDisplay(next);
    setHover(null);
  };
  useEffect(() => {
    if (!displaySwitched.current) return;
    displaySwitched.current = false;
    document.querySelector<HTMLElement>('[role="group"][aria-label="Gösterim"] [aria-pressed="true"]')?.focus();
  }, [display]);
  const controls = (floating: boolean, children?: ReactNode) => (
    <Controls
      metric={metricId}
      onMetric={andClearHover(setMetricId)}
      view={view}
      onView={andClearHover(setView)}
      display={display}
      onDisplay={pickDisplay}
      floating={floating}
    >
      {children}
    </Controls>
  );
  // A search result opens its panel and brings it into view; the counter lets the same place
  // be flown to again.
  const [focus, setFocus] = useState<{ bbox: Place["bbox"]; count: number } | null>(null);
  const pickPlace = (place: Place) => {
    setSelection({ kind: place.tur === "il" ? "iller" : "ilceler", code: place.kod });
    setFocus((last) => ({ bbox: place.bbox, count: (last?.count ?? 0) + 1 }));
    setHover(null);
  };

  // The address keeps the map's position, period, measure, view and open area (lib/mapHash.ts). The
  // prerendered page has no hash, so it is read once the page has hydrated. It is read again whenever
  // it changes from outside: typed, back and forward, or a link from a province page; what this page
  // writes itself is skipped.
  const hash = useSyncExternalStore(subscribeHash, currentHash, noHash);
  const [seenHash, setSeenHash] = useState<string | null>(null);
  // The position the address keeps: none until the map is placed by the reader, a search, a link or
  // the address itself. Until then the map shows all of Türkiye on each reader's own screen.
  const [kept, setKept] = useState<Camera | null>(null);
  // A position from the address, which the map flies to from where it is (MapView).
  const [jump, setJump] = useState<Camera | null>(null);
  // Whether the reader has moved the map since the address was last read. The map goes to the
  // address's position or area only once Türkiye is drawn and the area is loaded, which on a slow
  // connection takes seconds; a move the reader makes before that (or the Konumum flight) stands.
  const [held, setHeld] = useState(false);
  if (hash !== null && hash !== seenHash) {
    setSeenHash(hash);
    if (hash !== writtenHash) {
      setHeld(false);
      const ids = periods.map((p) => p.id);
      const state = parseMapHash(hash, ids);
      const index = state.period ? ids.indexOf(state.period) : -1;
      setPeriodIndex(index === -1 ? last : index);
      setMetricId(state.metric ?? "indirme");
      setView(state.view ?? "kareler");
      setPlaying(false);
      // The address keeps no comparison, so a new one shows a single period.
      setLeftIndex(null);
      setHover(null);
      const named = state.selection;
      // The open area stays as it is, with its clicked point, if the address names it.
      setSelection((current) => (current && named && current.kind === named.kind && current.code === named.code ? current : null));
      const camera = state.camera ?? null;
      if (camera) setKept(camera);
      setPending(named ? { ...named, camera } : null);
      if (!named && camera) setJump(camera);
    }
  }

  // A named area that exists opens its panel once its kind is loaded; one that does not (or Türkiye's
  // own entry) is dropped quietly. The map then goes to the address's position, so it is the one
  // seen beside the panel, or without one flies to the area as to a search result.
  const [fitTo, setFitTo] = useState<{ kind: AreaKind; code: string } | null>(null);
  const pendingAreas = pending && areas[pending.kind];
  if (pending && pendingAreas) {
    setPending(null);
    const { kind, code, camera } = pending;
    const exists = code !== NATIONAL && Boolean(pendingAreas[code]);
    if (exists) setSelection((current) => (current?.kind === kind && current.code === code ? current : { kind, code }));
    if (camera) {
      if (!held) setJump(camera);
    } else if (exists && !held) setFitTo({ kind, code });
  }
  useEffect(() => {
    if (!fitTo) return;
    let cancelled = false;
    loadPlaces().then((places) => {
      const place = places.find((p) => p.kod === fitTo.code && (p.tur === "il") === (fitTo.kind === "iller"));
      if (place && !cancelled) setFocus((last) => ({ bbox: place.bbox, count: (last?.count ?? 0) + 1 }));
    }, () => {});
    return () => {
      cancelled = true;
    };
  }, [fitTo]);

  // The position is taken when a move that placed the map ends: one the reader made on either map of
  // a comparison (which move together), or a fit or flight marked PLACED. A reader's move is told by
  // their input on that map, a wheel, press, touch or key since the last move ended: MapLibre leaves
  // the event off the end of a wheel zoom. A shift marked SHIFTED, the map making room for the panel,
  // is taken only once a position is kept, and a resize of the map, which keeps its centre, never.
  // A move the reader starts (MapLibre gives it its input event) or the Konumum flight drops the
  // address's flight or fit while it still waits to start (held).
  // The flight to the reader's own position, marked LOCATED, takes the position out of the address
  // until the reader moves the map, so a link shared after it does not show where they are.
  useEffect(() => {
    if (!mainMap) return;
    const maps = comparing && leftMap ? [mainMap, leftMap] : [mainMap];
    const inputs = ["wheel", "pointerdown", "touchstart", "keydown"];
    const listeners = maps.map((map) => {
      let input = false;
      let resized = false;
      const onInput = () => {
        input = true;
      };
      const onResize = () => {
        resized = true;
      };
      const onMoveStart = (e: { originalEvent?: unknown } & MoveMark) => {
        if (!e.originalEvent && !e.located) return;
        setHeld(true);
        setJump(null);
        setFitTo(null);
        setFocus(null);
      };
      const onMoveEnd = (e: { originalEvent?: unknown } & MoveMark) => {
        const byReader = input;
        input = false;
        if (e.located) {
          resized = false;
          setKept(null);
          return;
        }
        if (resized) {
          resized = false;
          return;
        }
        const { lng, lat } = mainMap.getCenter();
        const camera = { zoom: mainMap.getZoom(), lat, lon: lng };
        if (e.shifted) setKept((last) => (last ? camera : last));
        else if (byReader || e.originalEvent || e.placed) setKept(camera);
      };
      const container = map.getContainer();
      for (const type of inputs) container.addEventListener(type, onInput, { capture: true, passive: true });
      map.on("resize", onResize);
      map.on("movestart", onMoveStart);
      map.on("moveend", onMoveEnd);
      return () => {
        for (const type of inputs) container.removeEventListener(type, onInput, { capture: true });
        map.off("resize", onResize);
        map.off("movestart", onMoveStart);
        map.off("moveend", onMoveEnd);
      };
    });
    return () => {
      for (const off of listeners) off();
    };
  }, [mainMap, leftMap, comparing]);

  // Written back with replaceState, so moving the map adds no history entries. An area still waiting
  // to load is kept in it. Also after every hash read from outside, so values that were dropped leave
  // the address; but never over a hash that has not been read yet (a link's, arriving just after the
  // page was drawn).
  const shown = selection ?? pending;
  const shownKind = shown?.kind;
  const shownCode = shown?.code;
  useEffect(() => {
    const current = window.location.hash;
    if (seenHash === null || (current !== seenHash && current !== writtenHash)) return;
    const hash = formatMapHash({
      camera: kept ?? undefined,
      period: period.id,
      metric: metricId,
      view,
      selection: shownKind && shownCode ? { kind: shownKind, code: shownCode } : undefined,
    });
    if (hash === current) return;
    writtenHash = hash;
    window.history.replaceState(null, "", hash);
  }, [kept, period.id, metricId, view, shownKind, shownCode, seenHash]);
  useEffect(() => () => {
    writtenHash = null;
  }, []);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.brand}>
          <h1 className={styles.title}>NetAtlas TR</h1>
          <p className={styles.subtitle}>Türkiye&apos;nin internet hızı haritası</p>
        </div>
        <SearchBox onPick={pickPlace} />
        <nav className={styles.nav} aria-label="Sayfalar">
          <Link className={styles.navLink} href="/il/">İller</Link>
          <Link className={styles.navLink} href="/yontem/">Yöntem</Link>
          <a className={styles.navLink} href={REPO_URL}>Kaynak kodu</a>
        </nav>
      </header>
      {/* Over the map the controls float on it; above the table they form a bar, with the period. */}
      {display === "tablo" && controls(false, (
        <div className={styles.field}>
          <span className={`${styles.fieldLabel} ${styles.groupLabel}`}>Dönem</span>
          <Timeline periods={periods} periodIndex={periodIndex} onPeriod={pickPeriod} playing={false} />
        </div>
      ))}
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
            jump={jump}
            focus={focus}
            onHover={setHover}
            onSelect={setSelection}
            onDrawn={setDrawnPeriod}
            onMap={setMainMap}
          />
          {comparing && (
            <>
              <div className={styles.compareLeft} style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
                <MapView
                  period={periods[leftIndex]}
                  metric={metric}
                  view={view}
                  theme={theme}
                  areas={view === "kareler" ? null : areas[view] ?? null}
                  selection={selection}
                  focus={null}
                  onHover={setHover}
                  onSelect={setSelection}
                  onMap={setLeftMap}
                  secondary
                />
              </div>
              <CompareDivider split={split} onSplit={setSplit} left={periods[leftIndex].ad} right={period.ad} />
            </>
          )}
          {controls(true)}
          {/* On phones the region panel and the dock would leave no map; the panel wins. */}
          <div className={`${styles.dock} ${selection ? styles.besidePanel : ""}`}>
            <Timeline
              periods={periods}
              periodIndex={periodIndex}
              onPeriod={pickPeriod}
              playing={playing}
              onPlay={togglePlay}
              compare={comparing ? { index: leftIndex, onPick: pickLeft } : null}
            />
            <span className={styles.dockDivider} />
            <Legend metric={metric} period={period} view={view} theme={theme} />
            <button type="button" className={styles.compareToggle} aria-pressed={comparing} aria-label="İki dönemi karşılaştır" title="İki dönemi karşılaştır" onClick={toggleCompare}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M12 3v18" />
              </svg>
            </button>
          </div>
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
            heatMap={view === "kareler"}
            mapHidden={display === "tablo"}
            onClose={closePanel}
            onSelect={setSelection}
          />
        )}
      </div>
    </>
  );
}
