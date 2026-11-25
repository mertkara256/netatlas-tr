"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "maplibre-gl/dist/maplibre-gl.css";
import { addProtocol, setWorkerUrl, type ExpressionSpecification, type StyleSpecification } from "maplibre-gl";
import Map, { Layer, Source, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import { RAMPS, type Theme } from "@/lib/colors";
import { BASE_PATH, BORDERS_ARCHIVE } from "@/lib/data";
import { formatNumber, inYear } from "@/lib/format";
import { vectorTile } from "@/lib/siteTiles";
import type { FiberProvince } from "./FiberView";
import Tooltip, { type HoverInfo } from "./Tooltip";

// As in MapView: MapLibre's worker from public/, and the site's tile archives behind "harita://".
setWorkerUrl(`${BASE_PATH}/maplibre-gl-worker.mjs`);
addProtocol("harita", vectorTile);

// The box MapView asks for tiles in (CELL_BOUNDS), which holds Türkiye; the map fits it.
const BOUNDS: [number, number, number, number] = [25.5, 35.7, 45.0, 42.2];
const PADDING = 4;
// No basemap: the provinces alone, on the page's own colour.
const STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] };
// Province edges in the page's colour (--page), so neighbours of one colour stay apart; the province
// under the pointer outlined in ink.
const EDGES: Record<Theme, { gap: string; hover: string }> = {
  light: { gap: "#f9f9f7", hover: "#0b0b0b" },
  dark: { gap: "#0d0d0d", hover: "#f0efec" },
};
const percent = (v: number) => `%${formatNumber(v * 100)}`;

/** Türkiye's provinces in the colours FiberView gives them, fixed in place: hovering one names it, its
 *  year and its shares; clicking opens its page. */
export default function FiberMap({ provinces, fill, theme, firstYear, lastYear }: {
  provinces: FiberProvince[];
  /** Fill colour by province code. */
  fill: Record<string, string>;
  theme: Theme;
  firstYear: string;
  lastYear: string;
}) {
  const router = useRouter();
  const mapRef = useRef<MapRef>(null);
  const hovered = useRef<string | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const byCode = Object.fromEntries(provinces.map((p) => [p.code, p]));
  const [[code, color], ...others] = Object.entries(fill);
  const fillColor: ExpressionSpecification = ["match", ["get", "il_kodu"], code, color, ...others.flat(), RAMPS[theme].noData];

  const outline = (code: string | null) => {
    const map = mapRef.current?.getMap();
    if (!map || hovered.current === code) return;
    if (hovered.current) map.setFeatureState({ source: "sinirlar", sourceLayer: "iller", id: hovered.current }, { hover: false });
    if (code) map.setFeatureState({ source: "sinirlar", sourceLayer: "iller", id: code }, { hover: true });
    hovered.current = code;
  };
  const provinceAt = (event: MapLayerMouseEvent) => byCode[event.features?.[0]?.properties?.il_kodu as string];

  const handleMove = (event: MapLayerMouseEvent) => {
    const p = provinceAt(event);
    outline(p?.code ?? null);
    if (!p) {
      setHover(null);
      return;
    }
    const canvas = event.target.getCanvas();
    setHover({
      x: event.point.x,
      y: event.point.y,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      title: p.name,
      subtitle: `BTK, ${lastYear} yıl sonu`,
      value: p.since ? `${inYear(p.since)}${p.since === firstYear ? " ya da önce" : ""} geçti` : "Henüz geçmedi",
      rows: [["Fiber", percent(p.fiber)], ["Telefon hattı", percent(p.xdsl)]],
    });
  };
  const clear = () => {
    outline(null);
    setHover(null);
  };
  const handleClick = (event: MapLayerMouseEvent) => {
    const p = provinceAt(event);
    if (p) router.push(p.path);
  };

  return (
    <>
      <Map
        ref={mapRef}
        initialViewState={{ bounds: BOUNDS, fitBoundsOptions: { padding: PADDING } }}
        mapStyle={STYLE}
        attributionControl={false}
        dragPan={false}
        dragRotate={false}
        scrollZoom={false}
        boxZoom={false}
        doubleClickZoom={false}
        keyboard={false}
        touchZoomRotate={false}
        touchPitch={false}
        interactiveLayerIds={["fiber-fill"]}
        // The list under the map gives keyboards and screen readers the same, so the canvas takes no focus.
        onLoad={(event) => event.target.getCanvas().setAttribute("tabindex", "-1")}
        onResize={(event) => event.target.fitBounds(BOUNDS, { padding: PADDING, animate: false })}
        onMouseMove={handleMove}
        onMouseLeave={clear}
        onMouseOut={clear}
        onClick={handleClick}
        style={{ position: "absolute", inset: 0 }}
      >
        <Source id="sinirlar" type="vector" tiles={[`harita://${BORDERS_ARCHIVE}/{z}/{x}/{y}`]} maxzoom={12} bounds={BOUNDS} promoteId={{ iller: "il_kodu" }}>
          <Layer id="fiber-fill" type="fill" source-layer="iller" paint={{ "fill-color": fillColor }} />
          <Layer id="fiber-edge" type="line" source-layer="iller" paint={{ "line-color": EDGES[theme].gap, "line-width": 1 }} />
          <Layer
            id="fiber-hover"
            type="line"
            source-layer="iller"
            paint={{ "line-color": EDGES[theme].hover, "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2, 0] }}
          />
        </Source>
      </Map>
      {hover && <Tooltip info={hover} />}
    </>
  );
}
