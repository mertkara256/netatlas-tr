"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import "./MapView.css";
import { addProtocol, setWorkerUrl, type ExpressionSpecification, type MapGeoJSONFeature, type Map as MapLibreMap, type StyleSpecification, type VectorTileSource } from "maplibre-gl";
import Map, { Layer, NavigationControl, Source, type ErrorEvent, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import { FEW_TESTS_FILL, RAMPS, areaColor, cellColor, type Theme } from "@/lib/colors";
import { BASE_PATH, BORDERS_ARCHIVE, CELL_SIZE, cellsArchive, type Area, type CellPick, type CellValues, type PeriodInfo, type Selection, type View } from "@/lib/data";
import { formatNumber, formatValue } from "@/lib/format";
import { LOCATED, PLACED, SHIFTED, type Camera } from "@/lib/mapHash";
import { LOW_TESTS, metricById, reliabilityLabel, type Metric } from "@/lib/metrics";
import { NEARBY_RADIUS } from "@/lib/nearby";
import { vectorTile } from "@/lib/siteTiles";
import { hasPhoneSheet } from "@/lib/viewport";
import styles from "./Atlas.module.css";
import LocateControl from "./LocateControl";
import MapLoading from "./MapLoading";
import type { HoverInfo } from "./Tooltip";

// Copied into public/ by scripts/copy-maplibre-worker.mjs before dev and build.
setWorkerUrl(`${BASE_PATH}/maplibre-gl-worker.mjs`);
// Our tiles come from the site's PMTiles archives, read with range requests (lib/siteTiles.ts).
addProtocol("harita", vectorTile);

// OpenFreeMap: free vector basemaps, no API key.
const BASEMAPS: Record<Theme, string> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
// When a basemap's style cannot be fetched, our borders and speeds are drawn on the page's colour
// (--page in app/globals.css) alone, without place names, until a retry finds the style again. Only
// the style itself counts: a missing font or basemap tile leaves the rest of the basemap drawn.
const plainStyle = (name: string, color: string): StyleSpecification => ({
  version: 8,
  name,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": color } }],
});
const FALLBACKS: Record<Theme, StyleSpecification> = {
  light: plainStyle("yedek-light", "#f9f9f7"),
  dark: plainStyle("yedek-dark", "#0d0d0d"),
};
// Images the dark basemap asks for but its sprite lacks: a dot beside city names below zoom 9 (the
// sprite has it as "circle_11") and the fill of woods from zoom 10. Neither was ever drawn.
const MISSING_BASEMAP_IMAGES = new Set(["circle-11", "wood-pattern"]);
const LINES: Record<Theme, { district: string; province: string; hover: string }> = {
  light: { district: "rgba(11, 11, 11, 0.22)", province: "rgba(11, 11, 11, 0.6)", hover: "#0b0b0b" },
  dark: { district: "rgba(240, 239, 236, 0.22)", province: "rgba(240, 239, 236, 0.6)", hover: "#f0efec" },
};
const TURKEY_BOUNDS: [number, number, number, number] = [25.6, 35.8, 44.9, 42.2];
// The box the pipeline takes Ookla's squares from, which holds the borders too; no tile is asked
// for outside it.
const CELL_BOUNDS: [number, number, number, number] = [25.5, 35.7, 45.0, 42.2];
// The deepest tile zoom in the archive (MAX_ZOOM in pipeline/tiles.py); MapLibre overzooms beyond.
const TILE_MAXZOOM = 12;
// How long a period change may leave the map without its cells before the loading message shows.
// A period read back from the cache is drawn well within it.
const PERIOD_LOADING_DELAY = 400; // ms
const cellTiles = (period: string) => `harita://${cellsArchive(period)}/{z}/{x}/{y}`;
const AREA_LAYERS = { ilceler: "district-fill", iller: "province-fill" } as const;
// The outline of a cell with few tests (see FEW_TESTS_FILL), kept inside the cell: a tile's rings
// run clockwise on screen, so a positive offset is inward. Thinner zoomed out, where a cell is
// only a few pixels wide and must still show its hollow.
const FEW_TESTS_LINE: { "line-width": ExpressionSpecification; "line-offset": ExpressionSpecification } = {
  "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.75, 6, 1.5],
  "line-offset": ["interpolate", ["linear"], ["zoom"], 3, 0.375, 6, 0.75],
};
// A district or province with few tests is hatched in its colour instead. Hollow, its outline was
// lost among neighbours of nearly the same colour and the area read as a gap, which is the slow
// end of the ramp. Hatch images are named by their colour and drawn when the map first asks.
const HATCH = "tarama-";
const HATCH_SIZE = 8; // px from one stripe to the next, drawn at twice that for dense screens

/** Stripes of a colour at 45 degrees, on nothing, that tile without a seam. */
function hatch(color: string): ImageData {
  const size = HATCH_SIZE * 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.strokeStyle = color;
  context.lineWidth = size * 0.36;
  for (const start of [-size, 0, size]) {
    context.beginPath();
    context.moveTo(start - 2, size + 2);
    context.lineTo(start + size + 2, -2);
    context.stroke();
  }
  return context.getImageData(0, 0, size, size);
}
// Zoomed out, a cell is drawn only where it was measured, in parts 1-2 px wide (FOOTPRINT_DEPTH in
// pipeline/tiles.py). Over the gaps between them the tooltip takes a part this many px away, so a
// value can be read without aiming at a single pixel.
const HIT_SLOP = 4;
// Share of the map the region panel covers on phones (max-height in RegionPanel.module.css).
const PHONE_SHEET_SHARE = 0.62;
// The "Konumum" button flies to the reader's position at about street level, where the 1 km circle
// fills much of the map (one level further out on phones, where the panel leaves a strip of map), and
// says why when it cannot. The position is used here alone: it is never sent anywhere or stored, and
// the flight (LOCATED) takes the map's position out of the address, which then names only the area.
const LOCATE_ZOOM = 14;
const LOCATE_NOTE_TIME = 6000; // ms
const LOCATE_ERRORS: Record<number, string> = {
  1: "Konum izni verilmedi.",
  2: "Konum alınamadı.",
  3: "Konum alınamadı, süre doldu.",
};
const OUTSIDE = "Konumun Türkiye dışında.";

/** The cell the tooltip reads at a point: the one drawn there, else, over the gaps between the parts
 *  drawn zoomed out, one within HIT_SLOP. A click reads it the same way for the region panel. */
function cellAt(map: MapLibreMap, { x, y }: { x: number; y: number }): MapGeoJSONFeature | undefined {
  if (!map.getLayer("cells")) return undefined;
  return map.queryRenderedFeatures([x, y], { layers: ["cells"] })[0]
    ?? map.queryRenderedFeatures([[x - HIT_SLOP, y - HIT_SLOP], [x + HIT_SLOP, y + HIT_SLOP]], { layers: ["cells"] })[0];
}

/** The district of a cell clicked where no district is: a coastal cell, on its side over the sea. Of
 *  the districts within the cell's box, the one nearest the click, found in squares growing from it. */
function districtOfCell(map: MapLibreMap, click: { x: number; y: number }, cell: MapGeoJSONFeature): MapGeoJSONFeature | undefined {
  const { geometry } = cell;
  const rings = geometry.type === "Polygon" ? geometry.coordinates : geometry.type === "MultiPolygon" ? geometry.coordinates.flat() : [];
  const corners = rings.flat().map(([lon, lat]) => map.project([lon, lat]));
  if (!corners.length) return undefined;
  const [minX, maxX] = [Math.min(...corners.map((c) => c.x)), Math.max(...corners.map((c) => c.x))];
  const [minY, maxY] = [Math.min(...corners.map((c) => c.y)), Math.max(...corners.map((c) => c.y))];
  // Zoomed out, the cell may be one found within HIT_SLOP of the click, outside its box.
  const x = Math.min(Math.max(click.x, minX), maxX);
  const y = Math.min(Math.max(click.y, minY), maxY);
  for (let r = HIT_SLOP; ; r *= 2) {
    const district = map.queryRenderedFeatures(
      [[Math.max(minX, x - r), Math.max(minY, y - r)], [Math.min(maxX, x + r), Math.min(maxY, y + r)]],
      { layers: ["district-hit"] },
    )[0];
    if (district || (x - r <= minX && y - r <= minY && x + r >= maxX && y + r >= maxY)) return district;
  }
}

/** A cell's values in one period, or null if it has none. */
function cellValues(p: MapGeoJSONFeature["properties"], period: string): CellValues | null {
  return p[`t${period}`] == null ? null : { d: p[`d${period}`], u: p[`u${period}`], l: p[`l${period}`], t: p[`t${period}`] };
}

/** The cell at a point as the tooltip gives it, for the region panel. */
function pickCell(map: MapLibreMap, point: { x: number; y: number }, period: string): CellPick {
  const feature = cellAt(map, point);
  const values = feature && cellValues(feature.properties, period);
  return { period, cell: feature && values ? { level: feature.properties.seviye, values } : null };
}

/** A circle of `radius` metres around a point, as a GeoJSON polygon of 64 sides. */
function circle([lon, lat]: [number, number], radius: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const dLat = (radius / 6371008.8) * (180 / Math.PI);
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  const ring = Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return [lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)];
  });
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

// The basemaps write place names in English and the local script; this site is in Turkish. Names
// come in Turkish where OpenStreetMap has one ("Yunanistan", "Halep"), else in Latin script, else as
// written locally. Road numbers keep their own labels.
const TURKISH_NAME: ExpressionSpecification = ["coalesce", ["get", "name:tr"], ["get", "name:latin"], ["get", "name"]];

function showTurkishNames(map: MapLibreMap) {
  for (const layer of map.getStyle().layers) {
    if (layer.type !== "symbol") continue;
    const field = map.getLayoutProperty(layer.id, "text-field");
    if (field && JSON.stringify(field).includes("name")) map.setLayoutProperty(layer.id, "text-field", TURKISH_NAME);
  }
}

// Our layers go above the basemap's fills and roads but below its final run of labels.
function firstLabelLayer(map: MapLibreMap): string {
  const layers = map.getStyle().layers;
  let first = layers.length;
  while (first > 0 && layers[first - 1].type === "symbol") first--;
  return layers[first]?.id ?? "";
}

function describe(metric: Metric, v: CellValues | null): Pick<HoverInfo, "value" | "rows"> {
  if (!v) return { value: null, rows: [] };
  const reliability = reliabilityLabel(v.t);
  const rows: [string, string][] = [
    ["İndirme", formatValue(metricById("indirme"), v.d)],
    ["Yükleme", formatValue(metricById("yukleme"), v.u)],
    ["Gecikme", formatValue(metricById("gecikme"), v.l)],
    ["Test", formatNumber(v.t)],
    ["Güvenilirlik", reliability],
  ];
  if (metric.id === "guvenilirlik") {
    return { value: `${reliability} (${formatNumber(v.t)} test)`, rows: rows.slice(0, 3) };
  }
  return { value: formatValue(metric, v[metric.tileKey]), rows: rows.filter(([k]) => k !== metric.label) };
}

const lowNote = (v: CellValues | null) => (v && v.t < LOW_TESTS ? " · az test, değer belirsiz" : "");

export default function MapView({ period, metric, view, theme, areas, selection, jump = null, focus, onHover, onSelect, onDrawn, onMap, secondary = false }: {
  period: PeriodInfo;
  metric: Metric;
  view: View;
  theme: Theme;
  areas: Record<string, Area> | null;
  selection: Selection | null;
  /** A position to fly to (from the address) once Türkiye is drawn; a new one for every request. */
  jump?: Camera | null;
  /** A bounding box to fly to (a search result); count changes for every new request. */
  focus: { bbox: [number, number, number, number]; count: number } | null;
  onHover: (info: HoverInfo | null) => void;
  onSelect: (selection: Selection) => void;
  /** Called with a period's id once its cells are drawn (the periods play on this). */
  onDrawn?: (period: string) => void;
  /** Called with the map once it exists, and with null when it goes, so another map can follow it. */
  onMap?: (map: MapLibreMap | null) => void;
  /** The left-hand map of a comparison, drawn over the main one and moved with it (Atlas): it has no
   *  zoom buttons, sources strip or loading messages of its own, and leaves flying to search results,
   *  making room for the panel and reading the panel's cell again to the main map. */
  secondary?: boolean;
}) {
  const mapRef = useRef<MapRef>(null);
  // MapLibre warns about each of the dark basemap's missing images on every load; an empty image
  // keeps them undrawn, quietly. Set as soon as the map exists, before its first tiles ask for them.
  const setMap = useCallback((ref: MapRef | null) => {
    mapRef.current = ref;
    onMap?.(ref?.getMap() ?? null);
    ref?.getMap().setMissingStyleImageResolver((id) => {
      if (MISSING_BASEMAP_IMAGES.has(id)) ref.getMap().addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
      else if (id.startsWith(HATCH)) ref.getMap().addImage(id, hatch(id.slice(HATCH.length)), { pixelRatio: 2 });
    });
  }, [onMap]);
  // The basemap, or the plain style that stands in for it (see FALLBACKS), named by its URL or name.
  const [fallback, setFallback] = useState(false);
  const mapStyle = fallback ? FALLBACKS[theme] : BASEMAPS[theme];
  const style = typeof mapStyle === "string" ? mapStyle : mapStyle.name!;
  // Which style has finished loading, and the label layer ours must go under. The light and
  // dark basemaps end in different label layers, so our layers are added afresh after a switch.
  const [loaded, setLoaded] = useState<{ style: string; beforeId: string } | null>(null);
  const hovered = useRef<{ layer: string; id: string } | null>(null);

  // The basemap draws well before the speed tiles arrive, and until then Türkiye shows no colour.
  // Our sources are added in this commit, so an idle comes once their tiles are drawn. A new
  // period's cells are added a moment after the old ones are removed, and the map can go idle in
  // between, so only an idle with that period's source in counts.
  const [drawn, setDrawn] = useState<{ theme: Theme; period: string } | null>(null);
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || loaded?.style !== style) return;
    const check = () => {
      if (!map.getLayer("cells") || map.getSource<VectorTileSource>("kareler")?.tiles[0] !== cellTiles(period.id)) return;
      map.off("idle", check);
      setDrawn({ theme, period: period.id });
      onDrawn?.(period.id);
    };
    map.on("idle", check);
    return () => {
      map.off("idle", check);
    };
  }, [loaded, style, theme, period.id, onDrawn]);
  // After a period change the map can stay empty until the new period's tiles arrive. The loading
  // message waits a moment, so a period read back from the cache, drawn at once, shows none.
  const periodPending = drawn !== null && drawn.theme === theme && drawn.period !== period.id;
  const [periodSlow, setPeriodSlow] = useState(false);
  useEffect(() => {
    if (!periodPending) return;
    const timer = setTimeout(() => setPeriodSlow(true), PERIOD_LOADING_DELAY);
    return () => {
      clearTimeout(timer);
      setPeriodSlow(false);
    };
  }, [periodPending]);

  // Set when the panel opens or closes, for the next resize only (see handleLoad). None comes
  // on phones, where the panel lies over the map, hence the timeout.
  const anchorLeft = useRef(false);
  const panelOpen = selection !== null;
  const wasOpen = useRef(panelOpen);
  useEffect(() => {
    if (wasOpen.current === panelOpen) return;
    wasOpen.current = panelOpen;
    anchorLeft.current = true;
    const timer = setTimeout(() => (anchorLeft.current = false), 1000);
    return () => clearTimeout(timer);
  }, [panelOpen]);

  // Fly to a search result once the panel it opens has taken its place, keeping the area clear
  // of the phone sheet. The fit replaces the left-edge anchoring of that same resize. Opening the
  // page on a link, Türkiye is drawn first, so the reader sees where the place lies.
  const ready = drawn !== null;
  useEffect(() => {
    if (!focus || secondary || !ready) return;
    anchorLeft.current = false;
    const timer = setTimeout(() => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      const { clientHeight } = map.getContainer();
      const sheet = hasPhoneSheet() ? clientHeight * PHONE_SHEET_SHARE : 0;
      map.fitBounds(focus.bbox, { padding: { top: 30, left: 30, right: 30, bottom: 30 + sheet }, maxZoom: 11, duration: 800 }, PLACED);
    }, 80);
    return () => clearTimeout(timer);
  }, [focus, secondary, ready]);

  // Fly to a position from the address the same way, so it is the one seen beside the panel. Readers
  // who ask for less motion get there at once (MapLibre skips a flight that is not `essential`).
  useEffect(() => {
    if (!jump || secondary || !ready) return;
    anchorLeft.current = false;
    const timer = setTimeout(() => {
      mapRef.current?.getMap().flyTo({ center: [jump.lon, jump.lat], zoom: jump.zoom, duration: 1600 }, PLACED);
    }, 80);
    return () => clearTimeout(timer);
  }, [jump, secondary, ready]);

  const handleLoad = useCallback(() => {
    const map = mapRef.current!.getMap();
    const update = () => {
      showTurkishNames(map);
      // Read from the map: a plain style is swapped in within react-map-gl's layout effect, before
      // this component's effects could note which one was asked for.
      setLoaded({ style: map.getStyleUrl() ?? map.getStyle().name ?? "", beforeId: firstLabelLayer(map) });
    };
    update();
    map.on("style.load", update);
    if (secondary) return;

    // MapLibre opens the compact attribution (about 640 px) on load; where it and the period and
    // legend box (about 680 px, Atlas.module.css .dock) do not fit side by side, it would run over
    // the box. The ⓘ button still opens it.
    const container = map.getContainer();
    const collapseAttribution = () => setTimeout(() => {
      if (container.clientWidth < 1340) {
        container.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      }
    }, 0);
    collapseAttribution();

    // When the region panel opens beside the map, MapLibre keeps the centre and the place
    // just clicked slides left. Keep the left edge instead, so the panel takes the right side.
    let width = container.clientWidth;
    map.on("resize", () => {
      const next = container.clientWidth;
      if (anchorLeft.current && next !== width) {
        map.panBy([(next - width) / 2, 0], { animate: false }, SHIFTED);
        anchorLeft.current = false;
      }
      width = next;
      collapseAttribution();
    });
  }, [secondary]);

  // The basemap's style could not be fetched (the service is down, or the request blocked): draw
  // ours on the plain style instead. Other errors are logged, as react-map-gl does by default.
  const handleError = useCallback((e: ErrorEvent) => {
    const url = (e.error as { url?: string }).url;
    if (url && Object.values(BASEMAPS).includes(url)) setFallback(true);
    else console.error(e.error);
  }, []);

  // A retry asks for the style first and switches back only if it comes, so a failed retry leaves
  // the map as it was.
  const [retry, setRetry] = useState<"none" | "trying" | "failed">("none");
  const retryBasemap = useCallback(async () => {
    setRetry("trying");
    const ok = await fetch(BASEMAPS[theme]).then((response) => response.ok, () => false);
    setRetry(ok ? "none" : "failed");
    if (ok) setFallback(false);
  }, [theme]);

  const highlight = useCallback((next: { layer: string; id: string } | null) => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    for (const [target, hover] of [[hovered.current, false], [next, true]] as const) {
      if (target) map.setFeatureState({ source: "harita", sourceLayer: target.layer, id: target.id }, { hover });
    }
    hovered.current = next;
  }, []);

  const clear = useCallback(() => {
    highlight(null);
    onHover(null);
  }, [highlight, onHover]);

  const handlePointer = useCallback((e: MapLayerMouseEvent) => {
    const feature = view === "kareler" ? cellAt(e.target, e.point) : e.features?.[0];
    if (!feature) return clear();
    const container = e.target.getContainer();
    const base = { x: e.point.x, y: e.point.y, width: container.clientWidth, height: container.clientHeight };
    const p = feature.properties;
    if (view === "kareler") {
      const values = cellValues(p, period.id);
      const district = e.target.queryRenderedFeatures(e.point, { layers: ["district-hit"] })[0]?.properties;
      highlight(null);
      onHover({
        ...base,
        title: district ? `${district.ilce}, ${district.il}` : "Türkiye",
        subtitle: `${CELL_SIZE[p.seviye]} hücre · ${period.ad}${lowNote(values)}`,
        ...describe(metric, values),
      });
      return;
    }
    const code = String(feature.id);
    const v = areas?.[code]?.hiz[period.id];
    const values = v ? { d: v.indirme_mbps, u: v.yukleme_mbps, l: v.gecikme_ms, t: v.test } : null;
    highlight({ layer: view, id: code });
    onHover({
      ...base,
      title: view === "ilceler" ? `${p.ilce}, ${p.il}` : p.il,
      subtitle: `${view === "ilceler" ? "İlçe" : "İl"} · ${period.ad}${lowNote(values)}`,
      ...describe(metric, values),
    });
  }, [view, period, metric, areas, highlight, onHover, clear]);

  // A click opens the panel of the area at a point; in the heat map, of the district (or, over the
  // sea, the cell's district), remembering the point and the cell the tooltip gives there. On phones
  // this replaces the tooltip. The "Konumum" button opens the reader's own point the same way.
  // Returns whether an area was found there.
  const selectAt = useCallback((map: MapLibreMap, point: [number, number]): boolean => {
    let selection: Selection;
    const at = map.project(point);
    if (view === "kareler") {
      if (!map.getLayer("district-hit")) return false; // before our layers were added
      const cell = cellAt(map, at);
      const district = map.queryRenderedFeatures(at, { layers: ["district-hit"] })[0]
        ?? (cell && districtOfCell(map, at, cell));
      if (!district) return false;
      selection = { kind: "ilceler", code: String(district.properties.ilce_kodu), point, cell: pickCell(map, at, period.id) };
    } else {
      const feature = map.getLayer(AREA_LAYERS[view]) && map.queryRenderedFeatures(at, { layers: [AREA_LAYERS[view]] })[0];
      if (!feature) return false;
      selection = { kind: view, code: String(feature.id), point };
    }
    clear();
    onSelect(selection);
    // On phones the panel covers the lower part of the map; bring the place above it.
    const { clientHeight } = map.getContainer();
    const visible = clientHeight * (1 - PHONE_SHEET_SHARE);
    if (hasPhoneSheet() && at.y > visible) map.panBy([0, at.y - visible / 2], undefined, SHIFTED);
    return true;
  }, [view, period.id, clear, onSelect]);

  const handleClick = useCallback((e: MapLayerMouseEvent) => {
    selectAt(e.target, [e.lngLat.lng, e.lngLat.lat]);
  }, [selectAt]);

  // One position, asked for once: no watching, no marker. The map flies there (on phones, into the
  // part above the panel) and, once the flight has ended and the map is drawn, opens the panel there
  // as a click would. Outside the tiles' box nothing is flown to; inside it, a point with no area
  // under it is outside Türkiye too. A flight the reader stops by moving the map ends quietly.
  const [locating, setLocating] = useState(false);
  const [locateNote, setLocateNote] = useState<string | null>(null);
  useEffect(() => {
    if (!locateNote) return;
    const timer = setTimeout(() => setLocateNote(null), LOCATE_NOTE_TIME);
    return () => clearTimeout(timer);
  }, [locateNote]);
  const locate = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || locating) return;
    setLocateNote(null);
    if (!("geolocation" in navigator)) return setLocateNote(LOCATE_ERRORS[2]);
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
      const point: [number, number] = [position.coords.longitude, position.coords.latitude];
      const [west, south, east, north] = CELL_BOUNDS;
      if (point[0] < west || point[0] > east || point[1] < south || point[1] > north) {
        setLocating(false);
        return setLocateNote(OUTSIDE);
      }
      const sheet = hasPhoneSheet() ? map.getContainer().clientHeight * PHONE_SHEET_SHARE : 0;
      const zoom = sheet ? LOCATE_ZOOM - 1 : LOCATE_ZOOM;
      map.once("moveend", () => map.once("idle", () => {
        setLocating(false);
        if (Math.abs(map.getZoom() - zoom) > 0.01) return; // stopped on the way
        const at = map.project(point);
        const { clientWidth, clientHeight } = map.getContainer();
        if (at.x < 0 || at.y < 0 || at.x > clientWidth || at.y > clientHeight - sheet) return;
        if (!selectAt(map, point) && !map.queryRenderedFeatures(at, { layers: ["district-hit"] }).length) setLocateNote(OUTSIDE);
      }));
      map.flyTo({ center: point, zoom, offset: [0, -sheet / 2] }, LOCATED);
    }, (error) => {
      setLocating(false);
      setLocateNote(LOCATE_ERRORS[error.code] ?? LOCATE_ERRORS[2]);
    }, { timeout: 15000, maximumAge: 60000 });
  }, [locating, selectAt]);

  // The panel's cell belongs to the period it was read in. When another period is shown, read it
  // again as a new click at the same point would, once that period's cells are drawn: tried at
  // every idle until it succeeds. A point off the map cannot be read: the panel then says which
  // period its values are from, until the map is moved back over the point. Nor can a map hidden
  // behind the table (Atlas), which the panel says itself; it is read once the map is shown again.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    const pick = selection?.cell;
    const point = selection?.point;
    if (secondary || !map || !pick || !point || pick.period === period.id || view !== "kareler" || loaded?.style !== style) return;
    const read = () => {
      // The new period's source is added a moment after the old one is removed, and the map can go
      // idle in between, with no cells drawn.
      if (!map.getLayer("cells") || map.getSource<VectorTileSource>("kareler")?.tiles[0] !== cellTiles(period.id)) return;
      const at = map.project(point);
      const { clientWidth, clientHeight } = map.getContainer();
      if (!clientWidth) return; // hidden
      if (at.x >= 0 && at.y >= 0 && at.x < clientWidth && at.y < clientHeight) {
        onSelect({ ...selection, cell: pickCell(map, at, period.id) });
      } else if (!pick.stale) {
        onSelect({ ...selection, cell: { ...pick, stale: true } });
      }
    };
    map.on("idle", read);
    return () => {
      map.off("idle", read);
    };
  }, [selection, period.id, view, loaded, style, onSelect, secondary]);

  // Outline the selected area; tile features keep their state across period and metric changes,
  // but a basemap switch re-adds the source, so the state is set again then.
  const selected = useRef<Selection | null>(null);
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || loaded?.style !== style || !map.getSource("harita")) return;
    for (const [target, state] of [[selected.current, false], [selection, true]] as const) {
      if (target) map.setFeatureState({ source: "harita", sourceLayer: target.kind, id: target.code }, { selected: state });
    }
    selected.current = selection;
  }, [selection, loaded, style]);

  // Speeds from fewer than LOW_TESTS tests are drawn hollow; reliability shows the tests themselves.
  const hollow = metric.id !== "guvenilirlik";

  // Each area's colour, and which areas have few tests.
  const areaPaint = useMemo<{ color: ExpressionSpecification; few: ExpressionSpecification } | null>(() => {
    if (view === "kareler" || !areas) return null;
    const pairs: string[] = [];
    const few: string[] = [];
    for (const [code, area] of Object.entries(areas)) {
      const v = area.hiz[period.id];
      if (!v) continue;
      pairs.push(code, areaColor(metric, v[metric.areaKey] as number, v.test, theme));
      if (hollow && v.test < LOW_TESTS) few.push(code);
    }
    const key: ExpressionSpecification = ["get", view === "ilceler" ? "ilce_kodu" : "il_kodu"];
    return {
      // TypeScript cannot see that the spread holds code/colour pairs, hence the cast.
      color: ["match", key, ...pairs, RAMPS[theme].noData] as unknown as ExpressionSpecification,
      few: ["in", key, ["literal", few]],
    };
  }, [view, areas, period.id, metric, theme, hollow]);

  const cellFill = useMemo(() => cellColor(metric, period.id, theme), [metric, period.id, theme]);
  const fewCellTests: ExpressionSpecification = ["<", ["get", `t${period.id}`], LOW_TESTS];

  const point = selection?.point;
  const nearbyCircle = useMemo(() => (point ? circle(point, NEARBY_RADIUS) : null), [point]);

  const lines = LINES[theme];
  const before = loaded?.beforeId || undefined;
  const visible = (on: boolean) => ({ visibility: on ? ("visible" as const) : ("none" as const) });
  const hoverWidth: ExpressionSpecification = ["case", ["boolean", ["feature-state", "hover"], false], 2.5, 0];
  const selectedWidth: ExpressionSpecification = ["case", ["boolean", ["feature-state", "selected"], false], 3, 0];

  return (
    <>
      <Map
        ref={setMap}
        initialViewState={{ bounds: TURKEY_BOUNDS, fitBoundsOptions: { padding: 12 } }}
        mapStyle={mapStyle}
        // A basemap that failed to load cannot be diffed against; the plain style is built afresh.
        styleDiffing={!fallback}
        minZoom={3}
        maxZoom={15}
        dragRotate={false}
        touchPitch={false}
        attributionControl={secondary ? false : { compact: true, customAttribution: "Speedtest® by Ookla® Open Data · OCHA COD-AB" }}
        locale={{
          "Map.Title": "Hız haritası: ok tuşlarıyla kaydır, + ve − ile yakınlaş",
          "NavigationControl.ZoomIn": "Yakınlaş",
          "NavigationControl.ZoomOut": "Uzaklaş",
          "AttributionControl.ToggleAttribution": "Kaynakları göster ya da gizle",
          "AttributionControl.MapFeedback": "Harita için geri bildirim",
        }}
        interactiveLayerIds={view === "kareler" ? ["cells"] : [AREA_LAYERS[view]]}
        onLoad={handleLoad}
        onError={handleError}
        onMouseMove={handlePointer}
        onClick={handleClick}
        onMouseLeave={clear}
        onDragStart={clear}
        style={{ position: "absolute", inset: 0 }}
      >
        {!secondary && <NavigationControl showCompass={false} />}
        {!secondary && <LocateControl busy={locating} note={locateNote} onLocate={locate} />}
        {loaded?.style === style && (
          <Source
            key={style}
            id="harita"
            type="vector"
            tiles={[`harita://${BORDERS_ARCHIVE}/{z}/{x}/{y}`]}
            maxzoom={TILE_MAXZOOM}
            bounds={CELL_BOUNDS}
            promoteId={{ ilceler: "ilce_kodu", iller: "il_kodu" }}
          >
            {(["ilceler", "iller"] as const).map((layer) => (
              <Layer
                key={layer}
                id={AREA_LAYERS[layer]}
                type="fill"
                source-layer={layer}
                layout={visible(view === layer && areaPaint !== null)}
                paint={view === layer && areaPaint
                  ? { "fill-color": areaPaint.color, "fill-opacity": ["case", areaPaint.few, FEW_TESTS_FILL, 1] }
                  : { "fill-color": RAMPS[theme].noData }}
                beforeId={before}
              />
            ))}
            {(["ilceler", "iller"] as const).map((layer) => (
              <Layer
                key={`${layer}-few`}
                id={`${layer}-few`}
                type="fill"
                source-layer={layer}
                filter={view === layer && areaPaint ? areaPaint.few : false}
                layout={visible(view === layer && areaPaint !== null)}
                paint={view === layer && areaPaint ? { "fill-pattern": ["image", ["concat", HATCH, areaPaint.color]] } : {}}
                beforeId={before}
              />
            ))}
            {/* Invisible, so the cell tooltip can name the district under the pointer. */}
            <Layer id="district-hit" type="fill" source-layer="ilceler" paint={{ "fill-opacity": 0 }} beforeId={before} />
            <Layer
              id="district-line"
              type="line"
              source-layer="ilceler"
              minzoom={view === "kareler" ? 7 : 0}
              paint={{ "line-color": lines.district, "line-width": 0.7 }}
              beforeId={before}
            />
            <Layer
              id="province-line"
              type="line"
              source-layer="iller"
              paint={{ "line-color": lines.province, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.7, 10, 1.6] }}
              beforeId={before}
            />
            {(["ilceler", "iller"] as const).map((layer) => (
              <Layer
                key={`${layer}-hover`}
                id={`${layer}-hover`}
                type="line"
                source-layer={layer}
                paint={{ "line-color": lines.hover, "line-width": hoverWidth }}
                beforeId={before}
              />
            ))}
            {(["ilceler", "iller"] as const).map((layer) => (
              <Layer
                key={`${layer}-selected`}
                id={`${layer}-selected`}
                type="line"
                source-layer={layer}
                paint={{ "line-color": lines.hover, "line-width": selectedWidth }}
                beforeId={before}
              />
            ))}
          </Source>
        )}
        {/* The selected period's cells, from that period's archive. A new period adds the source
            afresh; its layers go under the districts and provinces, as before the split. */}
        {loaded?.style === style && (
          <Source
            key={`${style}-${period.id}`}
            id="kareler"
            type="vector"
            tiles={[cellTiles(period.id)]}
            maxzoom={TILE_MAXZOOM}
            bounds={CELL_BOUNDS}
          >
            {/* The heat map: every cell is drawn in the colour of its own value, the one the tooltip
                gives, and only on its measured parts: zoomed out, filling whole cells painted up to 37
                times the measured area. Each period has its own archive, as its parts differ. Cells are
                not blended into each other, on purpose: a blend shows colours that no cell has, so the
                colour under the pointer is not the tooltip's value, and neighbours of 27, 176 and 79
                Mbps read as one steady drift (docs/YOL-HARITASI.md, "Hücrelerin çizimi"). Antialiasing
                would draw each part's outline half a pixel into its neighbours. */}
            <Layer
              id="cells"
              type="fill"
              source-layer="hucreler"
              filter={["has", `t${period.id}`]}
              layout={visible(view === "kareler")}
              paint={{ "fill-color": cellFill, "fill-opacity": hollow ? ["case", fewCellTests, FEW_TESTS_FILL, 1] : 1, "fill-antialias": false }}
              beforeId={AREA_LAYERS.ilceler}
            />
            <Layer
              id="cells-few"
              type="line"
              source-layer="hucreler"
              filter={["all", ["has", `t${period.id}`], fewCellTests]}
              layout={visible(view === "kareler" && hollow)}
              paint={{ "line-color": cellFill, ...FEW_TESTS_LINE }}
              beforeId={AREA_LAYERS.ilceler}
            />
          </Source>
        )}
        {/* The area the panel's "nearest 1 km" figure pools. */}
        {loaded?.style === style && nearbyCircle && (
          <Source key={`nearby-${style}`} id="nearby" type="geojson" data={nearbyCircle}>
            <Layer id="nearby-line" type="line" paint={{ "line-color": lines.hover, "line-width": 2 }} beforeId={before} />
          </Source>
        )}
      </Map>
      {!secondary && (drawn?.theme !== theme || (periodPending && periodSlow)) && <MapLoading />}
      {fallback && !secondary && (
        <div className={styles.basemapNotice} role="status">
          <p>Altlık harita {retry === "failed" ? "yine " : ""}yüklenemedi, yer adları gösterilmiyor.</p>
          <button type="button" onClick={retryBasemap} disabled={retry === "trying"}>
            {retry === "trying" ? "Deneniyor…" : "Yeniden dene"}
          </button>
        </div>
      )}
    </>
  );
}
