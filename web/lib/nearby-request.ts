import { cellsArchive } from "./data";
import { nearby, type Nearby } from "./nearby";

export type NearbyRequestResult = { status: "ready"; value: Nearby | null } | { status: "error" };

/** Start one nearby query; its cleanup prevents an obsolete request from updating the panel. A failed
 *  tile is tried once more with a fresh archive (lib/siteTiles.ts) and not kept, so a retry reads it again. */
export function startNearbyRequest(lon: number, lat: number, period: string, onResult: (result: NearbyRequestResult) => void): () => void {
  let cancelled = false;
  // The promise also catches synchronous query failures.
  Promise.resolve().then(() => nearby(cellsArchive(period), lon, lat, period)).then(
    (value) => { if (!cancelled) onResult({ status: "ready", value }); },
    () => { if (!cancelled) onResult({ status: "error" }); },
  );
  return () => { cancelled = true; };
}
