import { invalidateSiteArchive, nearby, siteArchive, type Nearby } from "./nearby";

export type NearbyRequestResult = { status: "ready"; value: Nearby | null } | { status: "error" };

/** Start one nearby query; its cleanup prevents an obsolete request from updating the panel. */
export function startNearbyRequest(lon: number, lat: number, period: string, onResult: (result: NearbyRequestResult) => void): () => void {
  let cancelled = false;
  let archive: ReturnType<typeof siteArchive> | undefined;
  // The promise also catches synchronous archive initialization failures.
  Promise.resolve().then(() => {
    archive = siteArchive();
    return nearby(archive, lon, lat, period);
  }).then(
    (value) => { if (!cancelled) onResult({ status: "ready", value }); },
    () => {
      if (archive) invalidateSiteArchive(archive);
      if (!cancelled) onResult({ status: "error" });
    },
  );
  return () => { cancelled = true; };
}
