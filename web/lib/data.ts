// Files written by the data pipeline (`uv run python -m pipeline.tiles`) into public/data/.
export const PMTILES_PATH = "/data/harita.pmtiles";

// Periods in the tiles: calendar years plus "guncel", the latest four published quarters.
export type Period = "2019" | "2020" | "2021" | "2022" | "2023" | "2024" | "2025" | "guncel";
