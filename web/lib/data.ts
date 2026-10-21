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

export type Area = { ad: string; il_kodu?: string; hiz: Record<string, SpeedValues> };
export type AreaKind = "iller" | "ilceler";
// The map colours either the speed cells (a heat map) or whole districts or provinces.
export type View = "kareler" | AreaKind;

export async function loadAreas(kind: AreaKind): Promise<Record<string, Area>> {
  const response = await fetch(`${DATA_DIR}/${kind}.json`);
  const data = await response.json();
  return kind === "iller" ? data.iller : data;
}
