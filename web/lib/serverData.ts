// Build-time access to the pipeline's output in public/data/, for prerendered pages.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Area, PeriodInfo } from "./data";

async function readData<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(process.cwd(), "public", "data", name), "utf8"));
}

export type ProvinceFile = {
  donemler: PeriodInfo[];
  btk_yillari: number[];
  /** For Ookla's attribution: when the data was accessed, and the first and last quarter used. */
  ookla: { erisim: string; ilk: [number, number]; son: [number, number] };
  iller: Record<string, Area>;
};

export const readProvinces = () => readData<ProvinceFile>("iller.json");
export const readDistricts = () => readData<Record<string, Area>>("ilceler.json");

/** A row of data/processed/oecd_genisbant.csv (pipeline/oecd.py): an OECD member's fixed subscriptions per
 *  100 inhabitants and fiber's share of them (0–1) in one quarter ("2025-Q4"), each with its rank among the
 *  38, and the day the OECD's data was read. */
export type OecdRow = {
  ulke_kodu: string;
  ulke: string;
  donem: string;
  abone_100: number;
  abone_100_sira: number;
  fiber_payi: number;
  fiber_payi_sira: number;
  erisim: string;
};

/** The OECD's broadband database in its Data Explorer, the comparison's source. */
export const OECD_SOURCE_URL =
  "https://data-explorer.oecd.org/vis?df[ds]=dsDisseminateFinalDMZ&df[id]=DSD_BB_DATABASE%40DF_BB_TEL_DATABASE&df[ag]=OECD.STI.DEP";

/** The OECD comparison, by fiber's share from the highest. It is in git with the other tables, not in the data release. */
export async function readOecd(): Promise<OecdRow[]> {
  const csv = await readFile(path.join(process.cwd(), "..", "data", "processed", "oecd_genisbant.csv"), "utf8");
  const [header, ...lines] = csv.trim().split(/\r?\n/).map((line) => line.split(","));
  const numeric = new Set(["abone_100", "abone_100_sira", "fiber_payi", "fiber_payi_sira"]);
  return lines.map((cells) => Object.fromEntries(header.map((key, i) => [key, numeric.has(key) ? Number(cells[i]) : cells[i]])) as OecdRow);
}
