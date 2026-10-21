// Files written by the data pipeline (`uv run python -m pipeline.tiles`) into public/data/.
export const DATA_DIR = "/data";
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

/** A speed cell's properties from the tiles: seviye plus d/u/l/t (download, upload, latency,
 *  tests) for each period with measurements, e.g. d2019, tguncel. */
export type CellProperties = Record<string, number>;

/** The area whose panel is open, and the speed cell that was clicked to open it, if any. */
export type Selection = { kind: AreaKind; code: string; cell?: CellProperties };

const loading = new Map<AreaKind, Promise<Record<string, Area>>>();

/** Province or district values; each file is fetched once, however many views ask for it. */
export function loadAreas(kind: AreaKind): Promise<Record<string, Area>> {
  if (!loading.has(kind)) {
    loading.set(kind, fetch(`${DATA_DIR}/${kind}.json`)
      .then((response) => response.json())
      .then((data) => (kind === "iller" ? data.iller : data)));
  }
  return loading.get(kind)!;
}
