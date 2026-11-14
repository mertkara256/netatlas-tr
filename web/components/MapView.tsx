"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addProtocol, setWorkerUrl, type ExpressionSpecification, type Map as MapLibreMap } from "maplibre-gl";
import Map, { Layer, NavigationControl, Source, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import { FEW_TESTS_FILL, RAMPS, areaColor, cellColor, type Theme } from "@/lib/colors";
import { BASE_PATH, CELL_SIZE, type Area, type PeriodInfo, type Selection, type View } from "@/lib/data";
import { formatNumber, formatValue } from "@/lib/format";
import { LOW_TESTS, metricById, reliabilityLabel, type Metric } from "@/lib/metrics";
import { NEARBY_RADIUS } from "@/lib/nearby";
import { vectorTile } from "@/lib/siteTiles";
import { hasPhoneSheet } from "@/lib/viewport";
import MapLoading from "./MapLoading";
import type { HoverInfo } from "./Tooltip";

// Copied into public/ by scripts/copy-maplibre-worker.mjs before dev and build.
setWorkerUrl(`${BASE_PATH}/maplibre-gl-worker.mjs`);
// Our tiles come from the single PMTiles file, read with range requests (lib/siteTiles.ts).
addProtocol("harita", vectorTile);

// OpenFreeMap: free vector basemaps, no API key.
const BASEMAPS: Record<Theme, string> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
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
// Share of the map the region panel covers on phones (max-height in RegionPanel.module.css).
const PHONE_SHEET_SHARE = 0.62;

type Values = { d: number; u: number; l: number; t: number };

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

function describe(metric: Metric, v: Values | null): Pick<HoverInfo, "value" | "rows"> {
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

const lowNote = (v: Values | null) => (v && v.t < LOW_TESTS ? " · az test, değer belirsiz" : "");

export default function MapView({ period, metric, view, theme, areas, selection, focus, onHover, onSelect }: {
  period: PeriodInfo;
  metric: Metric;
  view: View;
  theme: Theme;
  areas: Record<string, Area> | null;
  selection: Selection | null;
  /** A bounding box to fly to (a search result); count changes for every new request. */
  focus: { bbox: [number, number, number, number]; count: number } | null;
  onHover: (info: HoverInfo | null) => void;
  onSelect: (selection: Selection) => void;
}) {
  const mapRef = useRef<MapRef>(null);
  // MapLibre warns about each of the dark basemap's missing images on every load; an empty image
  // keeps them undrawn, quietly. Set as soon as the map exists, before its first tiles ask for them.
  const setMap = useCallback((ref: MapRef | null) => {
    mapRef.current = ref;
    ref?.getMap().setMissingStyleImageResolver((id) => {
      if (MISSING_BASEMAP_IMAGES.has(id)) ref.getMap().addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
      else if (id.startsWith(HATCH)) ref.getMap().addImage(id, hatch(id.slice(HATCH.length)), { pixelRatio: 2 });
    });
  }, []);
  // Which basemap has finished loading, and the label layer ours must go under. The light and
  // dark basemaps end in different label layers, so our layers are added afresh after a switch.
  const [loaded, setLoaded] = useState<{ theme: Theme; beforeId: string } | null>(null);
  const themeRef = useRef(theme);
  const hovered = useRef<{ layer: string; id: string } | null>(null);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  // The basemap draws well before the speed tiles arrive, and until then Türkiye shows no colour.
  // Our source is added in this commit, so the next idle comes once its tiles are drawn.
  const [drawnTheme, setDrawnTheme] = useState<Theme | null>(null);
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || loaded?.theme !== theme) return;
    const drawn = () => setDrawnTheme(theme);
    map.once("idle", drawn);
    return () => {
      map.off("idle", drawn);
    };
  }, [loaded, theme]);

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
  // of the phone sheet. The fit replaces the left-edge anchoring of that same resize.
  useEffect(() => {
    if (!focus) return;
    anchorLeft.current = false;
    const timer = setTimeout(() => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      const { clientHeight } = map.getContainer();
      const sheet = hasPhoneSheet() ? clientHeight * PHONE_SHEET_SHARE : 0;
      map.fitBounds(focus.bbox, { padding: { top: 30, left: 30, right: 30, bottom: 30 + sheet }, maxZoom: 11, duration: 800 });
    }, 80);
    return () => clearTimeout(timer);
  }, [focus]);

  const handleLoad = useCallback(() => {
    const map = mapRef.current!.getMap();
    const update = () => {
      showTurkishNames(map);
      setLoaded({ theme: themeRef.current, beforeId: firstLabelLayer(map) });
    };
    update();
    map.on("style.load", update);

    // MapLibre opens the compact attribution on load; where it and the legend (300 px) do not
    // fit side by side, it would run over the legend. The ⓘ button still opens it.
    const container = map.getContainer();
    const collapseAttribution = () => setTimeout(() => {
      if (container.clientWidth < 960) {
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
        map.panBy([(next - width) / 2, 0], { animate: false });
        anchorLeft.current = false;
      }
      width = next;
      collapseAttribution();
    });
  }, []);

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
    const feature = e.features?.[0];
    if (!feature) return clear();
    const container = e.target.getContainer();
    const base = { x: e.point.x, y: e.point.y, width: container.clientWidth, height: container.clientHeight };
    const p = feature.properties;
    if (view === "kareler") {
      const values = p[`t${period.id}`] == null ? null : {
        d: p[`d${period.id}`], u: p[`u${period.id}`], l: p[`l${period.id}`], t: p[`t${period.id}`],
      };
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

  // A click opens the panel of the area under the pointer; in the heat map, of the district,
  // remembering the clicked cell. On phones this replaces the tooltip.
  const handleClick = useCallback((e: MapLayerMouseEvent) => {
    let selection: Selection;
    const point: [number, number] = [e.lngLat.lng, e.lngLat.lat];
    if (view === "kareler") {
      if (!e.target.getLayer("district-hit")) return; // clicked before our layers were added
      const district = e.target.queryRenderedFeatures(e.point, { layers: ["district-hit"] })[0];
      if (!district) return;
      selection = { kind: "ilceler", code: String(district.properties.ilce_kodu), point };
    } else {
      const feature = e.features?.[0];
      if (!feature) return;
      selection = { kind: view, code: String(feature.id), point };
    }
    clear();
    onSelect(selection);
    // On phones the panel covers the lower part of the map; bring the clicked place above it.
    const { clientHeight } = e.target.getContainer();
    const visible = clientHeight * (1 - PHONE_SHEET_SHARE);
    if (hasPhoneSheet() && e.point.y > visible) e.target.panBy([0, e.point.y - visible / 2]);
  }, [view, clear, onSelect]);

  // Outline the selected area; tile features keep their state across period and metric changes,
  // but a basemap switch re-adds the source, so the state is set again then.
  const selected = useRef<Selection | null>(null);
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || loaded?.theme !== theme || !map.getSource("harita")) return;
    for (const [target, state] of [[selected.current, false], [selection, true]] as const) {
      if (target) map.setFeatureState({ source: "harita", sourceLayer: target.kind, id: target.code }, { selected: state });
    }
    selected.current = selection;
  }, [selection, loaded, theme]);

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
        mapStyle={BASEMAPS[theme]}
        minZoom={3}
        maxZoom={15}
        dragRotate={false}
        touchPitch={false}
        attributionControl={{ compact: true, customAttribution: "Speedtest® by Ookla® Open Data · OCHA COD-AB" }}
        locale={{
          "Map.Title": "Hız haritası: ok tuşlarıyla kaydır, + ve − ile yakınlaş",
          "NavigationControl.ZoomIn": "Yakınlaş",
          "NavigationControl.ZoomOut": "Uzaklaş",
          "AttributionControl.ToggleAttribution": "Kaynakları göster ya da gizle",
          "AttributionControl.MapFeedback": "Harita için geri bildirim",
        }}
        interactiveLayerIds={view === "kareler" ? ["cells"] : [AREA_LAYERS[view]]}
        onLoad={handleLoad}
        onMouseMove={handlePointer}
        onClick={handleClick}
        onMouseLeave={clear}
        onDragStart={clear}
        style={{ position: "absolute", inset: 0 }}
      >
        <NavigationControl showCompass={false} />
        {loaded?.theme === theme && (
          <Source
            key={theme}
            id="harita"
            type="vector"
            tiles={["harita://{z}/{x}/{y}"]}
            maxzoom={TILE_MAXZOOM}
            bounds={CELL_BOUNDS}
            promoteId={{ ilceler: "ilce_kodu", iller: "il_kodu" }}
          >
            {/* The heat map: every cell is a square in the colour of its own value, the one the tooltip
                gives. The squares are not blended into each other, on purpose: a blend shows colours that
                no cell has, so the colour under the pointer is not the tooltip's value, and neighbours
                of 27, 176 and 79 Mbps read as one steady drift (docs/YOL-HARITASI.md, "Hücrelerin
                çizimi"). Antialiasing would draw each square's outline half a pixel into its neighbours. */}
            <Layer
              id="cells"
              type="fill"
              source-layer="hucreler"
              filter={["has", `t${period.id}`]}
              layout={visible(view === "kareler")}
              paint={{ "fill-color": cellFill, "fill-opacity": hollow ? ["case", fewCellTests, FEW_TESTS_FILL, 1] : 1, "fill-antialias": false }}
              beforeId={before}
            />
            <Layer
              id="cells-few"
              type="line"
              source-layer="hucreler"
              filter={["all", ["has", `t${period.id}`], fewCellTests]}
              layout={visible(view === "kareler" && hollow)}
              paint={{ "line-color": cellFill, ...FEW_TESTS_LINE }}
              beforeId={before}
            />
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
        {/* The area the panel's "nearest 1 km" figure pools. */}
        {loaded?.theme === theme && nearbyCircle && (
          <Source key={`nearby-${theme}`} id="nearby" type="geojson" data={nearbyCircle}>
            <Layer id="nearby-line" type="line" paint={{ "line-color": lines.hover, "line-width": 2 }} beforeId={before} />
          </Source>
        )}
      </Map>
      {drawnTheme !== theme && <MapLoading />}
    </>
  );
}
