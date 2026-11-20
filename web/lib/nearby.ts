import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { siteTile } from "./siteTiles";

// Ookla's own 475 m squares (level 16) are stored at full detail from tile zoom 10 on; zoom 12
// tiles hold 16 x 16 of them each, so the query reads few, small tiles.
const TILE_ZOOM = 12;
const SQUARE_LEVEL = 16;
const EARTH_RADIUS = 6371008.8; // m

export const NEARBY_RADIUS = 1000; // m

/** Averages of the squares around a point, weighted by devices as the map's cells and the areas are. */
export type Nearby = { squares: number; tests: number; download: number; upload: number; latency: number };

function lonLatToTile(lon: number, lat: number, zoom: number): [number, number] {
  const n = 2 ** zoom;
  const r = (lat * Math.PI) / 180;
  return [Math.floor(((lon + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)];
}

/** Great-circle distance in metres. */
export function distance(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(a));
}

/** Pool the squares whose centres lie within `radius` of the point, for one period, from the named
 *  archive. Its tiles are read together, through the map's tile cache (lib/siteTiles.ts). */
export async function nearby(archive: string, lon: number, lat: number, period: string, radius = NEARBY_RADIUS): Promise<Nearby | null> {
  const dLat = ((radius / EARTH_RADIUS) * 180) / Math.PI;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  const [x0, y0] = lonLatToTile(lon - dLon, lat + dLat, TILE_ZOOM);
  const [x1, y1] = lonLatToTile(lon + dLon, lat - dLat, TILE_ZOOM);
  const n = 2 ** TILE_ZOOM;
  const reads: Promise<[number, number, ArrayBuffer | undefined]>[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) reads.push(siteTile(archive, TILE_ZOOM, x, y).then((data) => [x, y, data]));
  }
  let squares = 0, tests = 0, devices = 0, download = 0, upload = 0, latency = 0;

  for (const [x, y, data] of await Promise.all(reads)) {
    const layer = data && new VectorTile(new PbfReader(new Uint8Array(data))).layers.hucreler;
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const p = feature.properties;
      const t = p[`t${period}`];
      if (p.seviye !== SQUARE_LEVEL || typeof t !== "number") continue;
      const [minX, minY, maxX, maxY] = feature.bbox();
      const cx = (minX + maxX) / 2 / layer.extent;
      const cy = (minY + maxY) / 2 / layer.extent;
      // Tippecanoe repeats a sliver of each neighbouring tile's squares as a buffer; count
      // every square only in the tile that holds its centre.
      if (cx < 0 || cx >= 1 || cy < 0 || cy >= 1) continue;
      const squareLon = ((x + cx) / n) * 360 - 180;
      const squareLat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + cy)) / n))) * 180) / Math.PI;
      if (distance(lon, lat, squareLon, squareLat) > radius) continue;
      const c = p[`c${period}`] as number;
      squares++;
      tests += t;
      devices += c;
      download += (p[`d${period}`] as number) * c;
      upload += (p[`u${period}`] as number) * c;
      latency += (p[`l${period}`] as number) * c;
    }
  }
  return squares ? { squares, tests, download: download / devices, upload: upload / devices, latency: latency / devices } : null;
}
