// Build-time access to the pipeline's output in public/data/, for prerendered pages.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Area, PeriodInfo } from "./data";

async function readData<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(process.cwd(), "public", "data", name), "utf8"));
}

export type ProvinceFile = { donemler: PeriodInfo[]; btk_yillari: number[]; iller: Record<string, Area> };

export const readProvinces = () => readData<ProvinceFile>("iller.json");
export const readDistricts = () => readData<Record<string, Area>>("ilceler.json");
