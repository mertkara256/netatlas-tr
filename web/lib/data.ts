// The prefix of every URL on the site (see next.config.ts). Next adds it to links, not to fetches.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
// The site's origin, for the addresses that must be absolute (link previews, the sitemap). Only
// read at build time; the deploy workflow sets it, local builds point at the dev server.
export const SITE_ORIGIN = process.env.SITE_ORIGIN ?? "http://localhost:3000";
// Files written by the data pipeline (`uv run python -m pipeline.tiles`) into public/data/.
export const DATA_DIR = `${BASE_PATH}/data`;
export const PMTILES_PATH = `${DATA_DIR}/harita.pmtiles`;

// A period is a calendar year ("2019") or "guncel", the latest four published quarters.
export type PeriodInfo = { id: string; ad: string; aralik: string };

/** "2019 Ç1 – Ç4" for a year, "Güncel · 2025 Ç4 – 2026 Ç3" for the latest quarters. */
export function periodText(period: PeriodInfo): string {
  return period.aralik.startsWith(period.ad) ? period.aralik : `${period.ad} · ${period.aralik}`;
}

export type SpeedValues = {
  kare: number;
  test: number;
  indirme_mbps: number;
  yukleme_mbps: number;
  gecikme_ms: number;
  guvenilirlik: "yuksek" | "orta" | "dusuk";
};

export type BtkValues = { nufus: number; sabit_genisbant: number; abone_100: number; fiber_payi: number };

/** A province (with its BTK figures per year) or a district (with its province's code). */
export type Area = { ad: string; il_kodu?: string; hiz: Record<string, SpeedValues>; btk?: Record<string, BtkValues> };
export type AreaKind = "iller" | "ilceler";
// The map colours either the speed cells (a heat map) or whole districts or provinces.
export type View = "kareler" | AreaKind;
// Türkiye's own entry among the provinces.
export const NATIONAL = "00";

// Cell width at Türkiye's latitude for each level in the tiles (Ookla's own squares are level 16).
export const CELL_SIZE: Record<number, string> = {
  10: "~30 km", 11: "~15 km", 12: "~7,6 km", 13: "~3,8 km", 14: "~1,9 km", 15: "~950 m", 16: "~475 m",
};

/** The area whose panel is open, and the point clicked on the map to open it, if any. */
export type Selection = { kind: AreaKind; code: string; point?: [number, number] };

const loading = new Map<AreaKind, Promise<Record<string, Area>>>();

/** Fetch JSON only from successful responses; error pages must not become cached data. */
export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Data request failed (${response.status}): ${url}`);
  return response.json();
}

/** Province or district values; successful requests are shared, failed requests can be retried. */
export function loadAreas(kind: AreaKind): Promise<Record<string, Area>> {
  if (!loading.has(kind)) {
    const request: Promise<Record<string, Area>> = fetchJson<Record<string, unknown>>(`${DATA_DIR}/${kind}.json`)
      .then((data) => {
        const areas = kind === "iller" ? data?.iller : data;
        if (!areas || typeof areas !== "object" || Array.isArray(areas)
          || !Object.keys(areas).length
          || Object.values(areas).some((area) => !area || typeof area.ad !== "string"
            || !area.hiz || typeof area.hiz !== "object" || Array.isArray(area.hiz))) {
          throw new Error(`Invalid area data: ${kind}`);
        }
        return areas as Record<string, Area>;
      })
      .catch((error) => {
        if (loading.get(kind) === request) loading.delete(kind);
        throw error;
      });
    loading.set(kind, request);
  }
  return loading.get(kind)!;
}
