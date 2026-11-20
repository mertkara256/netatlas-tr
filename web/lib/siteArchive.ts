import { PMTiles } from "pmtiles";
import { archivePath } from "./data";

const archives = new Map<string, PMTiles>();

/** One of the site's tile archives (lib/data.ts), shared by every reader on the page. */
export function siteArchive(name: string): PMTiles {
  let archive = archives.get(name);
  if (!archive) {
    archive = new PMTiles(`${window.location.origin}${archivePath(name)}`);
    archives.set(name, archive);
  }
  return archive;
}

/** A failed header or directory can remain cached; let the next reader use a fresh archive. */
export function invalidateSiteArchive(failed: PMTiles): void {
  for (const [name, archive] of archives) if (archive === failed) archives.delete(name);
}
