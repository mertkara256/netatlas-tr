// The map's vector source reads its tiles from the site's archive. A tile is kept after its first
// read, so a basemap switch, which adds the source afresh, does not fetch it again; a failed fetch
// is tried once more with a fresh archive (lib/retry.ts).
import type { AddProtocolAction } from "maplibre-gl";
import { invalidateSiteArchive, siteArchive } from "./nearby";
import { retryOnce } from "./retry";

const CACHED_TILES = 64;
const tiles = new Map<string, Promise<ArrayBuffer | undefined>>();

/** One tile's bytes, decompressed, or undefined where the archive has none. Kept for the next
 *  reader, least recently used dropped first; a failed read is not kept. */
export function siteTile(z: number, x: number, y: number): Promise<ArrayBuffer | undefined> {
  const key = `${z}/${x}/${y}`;
  let tile = tiles.get(key);
  if (tile) tiles.delete(key);
  else {
    let archive: ReturnType<typeof siteArchive> | undefined;
    tile = retryOnce(
      () => (archive = siteArchive()).getZxy(z, x, y),
      () => archive && invalidateSiteArchive(archive),
    ).then((found) => found?.data).catch((error) => {
      tiles.delete(key);
      throw error;
    });
  }
  tiles.set(key, tile);
  if (tiles.size > CACHED_TILES) tiles.delete(tiles.keys().next().value!);
  return tile;
}

/** "harita://{z}/{x}/{y}" for the vector source. MapLibre hands the bytes to its worker, which
 *  empties the buffer it gets, so it gets a copy and the kept tile stays whole. */
export const vectorTile: AddProtocolAction = async (request) => {
  const [z, x, y] = request.url.slice("harita://".length).split("/").map(Number);
  const data = await siteTile(z, x, y);
  return { data: data ? data.slice(0) : new ArrayBuffer(0) };
};
