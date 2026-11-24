import type { AreaKind, View } from "./data";
import { METRICS, type MetricId } from "./metrics";

// The map's address keeps what is on screen after its "#", so a view can be shared: the map's
// position first, then the period, the measure, the view and the area whose panel is open, as in
// "#12/40.988/29.028&d=guncel&m=indirme&g=kareler&s=ilceler:TUR034013". A hash, not a query: the site
// is static files. Comparison, the dividing line, the table and the clicked cell are not kept.

export type Camera = { zoom: number; lat: number; lon: number };
export type MapHash = {
  camera?: Camera;
  period?: string;
  metric?: MetricId;
  view?: View;
  selection?: { kind: AreaKind; code: string };
};

const KEYS = { period: "d", metric: "m", view: "g", selection: "s" } as const;
const METRIC_IDS = METRICS.map((m) => m.id);
const VIEWS: View[] = ["kareler", "ilceler", "iller"];
const KINDS: AreaKind[] = ["iller", "ilceler"];
// The map's zoom range and the box no tile is asked for outside of (minZoom, maxZoom and CELL_BOUNDS
// in components/MapView.tsx): a position outside them is dropped.
const MIN_ZOOM = 3;
const MAX_ZOOM = 15;
const BOUNDS = [25.5, 35.7, 45.0, 42.2];

/** What the hash says, keeping only the values that can be shown: a value that is unknown, malformed
 *  or outside Türkiye is left out, as is a missing one, so the map uses its default instead. A period
 *  must be one of `periods` (years come and go with the quarters; "guncel" stays). An area's code is
 *  only checked for its form here; whether it exists is known once the areas are loaded. */
export function parseMapHash(hash: string, periods: string[]): MapHash {
  const state: MapHash = {};
  for (const part of hash.replace(/^#/, "").split("&")) {
    const at = part.indexOf("=");
    if (at === -1) {
      const [zoom, lat, lon] = part.split("/").map((n) => (n.trim() === "" ? NaN : Number(n)));
      if (part.split("/").length === 3 && zoom >= MIN_ZOOM && zoom <= MAX_ZOOM
        && lon >= BOUNDS[0] && lon <= BOUNDS[2] && lat >= BOUNDS[1] && lat <= BOUNDS[3]) {
        state.camera = { zoom, lat, lon };
      }
      continue;
    }
    const key = part.slice(0, at);
    const value = part.slice(at + 1);
    if (key === KEYS.period && periods.includes(value)) state.period = value;
    else if (key === KEYS.metric && (METRIC_IDS as string[]).includes(value)) state.metric = value as MetricId;
    else if (key === KEYS.view && (VIEWS as string[]).includes(value)) state.view = value as View;
    else if (key === KEYS.selection) {
      const [kind, code, ...rest] = value.split(":");
      if (!rest.length && (KINDS as string[]).includes(kind) && /^[A-Za-z0-9]{1,16}$/.test(code ?? "")) {
        state.selection = { kind: kind as AreaKind, code };
      }
    }
  }
  return state;
}

/** Decimals that place the centre within about a pixel at this zoom (512 px tiles). */
const decimals = (zoom: number) => Math.max(0, Math.ceil(Math.log10((2 ** zoom * 512) / 360)));
const round = (n: number, digits: number) => String(Number(n.toFixed(digits)));

/** The hash for a state: "#" and the values given, in a fixed order. */
export function formatMapHash(state: MapHash): string {
  const parts: string[] = [];
  const { camera } = state;
  if (camera) {
    const digits = decimals(camera.zoom);
    parts.push(`${round(camera.zoom, 2)}/${round(camera.lat, digits)}/${round(camera.lon, digits)}`);
  }
  if (state.period) parts.push(`${KEYS.period}=${state.period}`);
  if (state.metric) parts.push(`${KEYS.metric}=${state.metric}`);
  if (state.view) parts.push(`${KEYS.view}=${state.view}`);
  if (state.selection) parts.push(`${KEYS.selection}=${state.selection.kind}:${state.selection.code}`);
  return `#${parts.join("&")}`;
}
