// The heat map as raster tiles drawn in the browser: a MapLibre protocol reads the speed cells from
// the same vector tiles as the rest of the map and paints their smooth surface (see surface.ts).
import { VectorTile } from "@mapbox/vector-tile";
import type { AddProtocolAction } from "maplibre-gl";
import { PbfReader } from "pbf";
import { HEAT_LEVELS, HEAT_STEPS, heatTable, type Theme } from "./colors";
import { LOW_TESTS, metricById, type Metric, type MetricId } from "./metrics";
import { siteTile } from "./siteTiles";
import { PAD, classPosition, smoothSurface } from "./surface";

/** Pixels per tile side. The surface is smooth, so MapLibre can stretch it over the 512 px tile. */
const SIZE = 256;
// Each tile zoom holds one cell level (pipeline/tiles.py): level 10 up to zoom 4, then zoom + 6, up to level 16.
const FIRST_LEVEL = 10;
const LAST_LEVEL = 16;
// Coverage where the surface starts to show and where it is opaque. Coverage is 0.5 on the edge
// between a cell with data and one without, so the surface ends there, softly; a lone cell still
// shows, and a cell without data among others stays open.
const EDGE = [0.3, 0.55];
const CACHED_TILES = 128;

/** One tile's cells, with the ring of its neighbours' cells that its buffer repeats: grid position and every property (d2019, t2019 ...) by cell. */
type TileCells = { n: number; i: Int16Array; j: Int16Array; columns: Map<string, Float32Array> };

async function readTile(z: number, x: number, y: number): Promise<TileCells | null> {
  const data = await siteTile(z, x, y);
  const layer = data && new VectorTile(new PbfReader(new Uint8Array(data))).layers.hucreler;
  if (!layer) return null;
  const level = Math.min(LAST_LEVEL, Math.max(FIRST_LEVEL, z + 6));
  const n = 2 ** (level - z);
  const i = new Int16Array(layer.length);
  const j = new Int16Array(layer.length);
  const columns = new Map<string, Float32Array>();
  let count = 0;
  for (let f = 0; f < layer.length; f++) {
    const feature = layer.feature(f);
    if (feature.properties.seviye !== level) continue;
    // Tippecanoe repeats the neighbouring tiles' cells that touch this one, clipped at its buffer;
    // any point of a clipped square still lies in that square, so the middle of its box gives its
    // grid position. That ring is all the blending at the tile's edge needs.
    const [minX, minY, maxX, maxY] = feature.bbox();
    const ci = Math.floor(((minX + maxX) / 2 / layer.extent) * n);
    const cj = Math.floor(((minY + maxY) / 2 / layer.extent) * n);
    if (ci < -PAD || cj < -PAD || ci >= n + PAD || cj >= n + PAD) continue;
    i[count] = ci;
    j[count] = cj;
    for (const [key, value] of Object.entries(feature.properties)) {
      if (key === "seviye" || typeof value !== "number") continue;
      let column = columns.get(key);
      if (!column) columns.set(key, (column = new Float32Array(layer.length).fill(NaN)));
      column[count] = value;
    }
    count++;
  }
  for (const [key, column] of columns) columns.set(key, column.subarray(0, count));
  return { n, i: i.subarray(0, count), j: j.subarray(0, count), columns };
}

// Decoding is the slow part, so tiles are kept, least recently used dropped first: switching the
// period, metric or theme then only repaints.
const tiles = new Map<string, Promise<TileCells | null>>();

function cachedTile(z: number, x: number, y: number): Promise<TileCells | null> {
  const key = `${z}/${x}/${y}`;
  let tile = tiles.get(key);
  if (tile) tiles.delete(key);
  else tile = readTile(z, x, y).catch((error) => {
    tiles.delete(key);
    throw error;
  });
  tiles.set(key, tile);
  if (tiles.size > CACHED_TILES) tiles.delete(tiles.keys().next().value!);
  return tile;
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** RGBA pixels of one tile for a metric and period, or null when nothing in it has data then. */
function paint(cells: TileCells, metric: Metric, period: string, theme: Theme): Uint8ClampedArray<ArrayBuffer> | null {
  const tests = cells.columns.get(`t${period}`);
  const values = cells.columns.get(`${metric.tileKey}${period}`);
  if (!tests || !values) return null;
  // A zero average (no upload measured) still needs a logarithm; NaN, no data, stays NaN.
  const value = values.map((v) => Math.log(Math.max(v, 0.01)));
  const low = tests.map((t) => (metric.id !== "guvenilirlik" && t < LOW_TESTS ? 1 : 0));
  const surface = smoothSurface(cells.n, SIZE, { i: cells.i, j: cells.j, value, low });

  const table = heatTable(metric, theme);
  const logBreaks = metric.breaks.map(Math.log);
  const classes = metric.breaks.length + 1;
  const pixels = new Uint8ClampedArray(SIZE * SIZE * 4);
  let drawn = false;
  for (let o = 0; o < SIZE * SIZE; o++) {
    const alpha = smoothstep(EDGE[0], EDGE[1], surface.coverage[o]);
    if (alpha === 0) continue;
    const step = Math.min(HEAT_STEPS - 1, Math.floor((classPosition(surface.value[o], logBreaks) / classes) * HEAT_STEPS));
    const t = (Math.round(surface.low[o] * (HEAT_LEVELS - 1)) * HEAT_STEPS + step) * 3;
    pixels[o * 4] = table[t];
    pixels[o * 4 + 1] = table[t + 1];
    pixels[o * 4 + 2] = table[t + 2];
    pixels[o * 4 + 3] = Math.round(alpha * 255);
    drawn = true;
  }
  return drawn ? pixels : null;
}

/** "isi://{period}/{metric}/{theme}/{z}/{x}/{y}" for a raster source. */
export const heatTile: AddProtocolAction = async (request, abortController) => {
  const [period, metricId, theme, z, x, y] = request.url.slice("isi://".length).split("/");
  const cells = await cachedTile(Number(z), Number(x), Number(y));
  // An empty answer is a transparent tile.
  if (!cells || abortController.signal.aborted) return { data: new ArrayBuffer(0) };
  const pixels = paint(cells, metricById(metricId as MetricId), period, theme as Theme);
  if (!pixels) return { data: new ArrayBuffer(0) };
  return { data: await createImageBitmap(new ImageData(pixels, SIZE, SIZE)) };
};
