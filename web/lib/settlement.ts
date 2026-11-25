import type { SettlementType, SettlementValues } from "./data";
import { formatNumber, percentOf } from "./format";
import { HIGH_TESTS } from "./metrics";

/** TÜİK's names for the degree of urbanisation, in the panel's order (pipeline/settlement.py). */
export const SETTLEMENT_TYPES: { key: SettlementType; label: string }[] = [
  { key: "yogun_kent", label: "Yoğun kent" },
  { key: "orta_yogun_kent", label: "Orta yoğun kent" },
  { key: "kir", label: "Kır" },
];

export type SettlementKey = "indirme_mbps" | "yukleme_mbps" | "gecikme_ms";

/** A type's speeds are shown from HIGH_TESTS tests on, as a reliable value; under that the panel says there
 *  are not enough tests. */
export function enoughTests(v: SettlementValues | undefined): v is SettlementValues {
  return v != null && v.test >= HIGH_TESTS;
}

/** Kır's value over yoğun kent's, or null unless both have enough tests. */
export function ruralRatio(types: Partial<Record<SettlementType, SettlementValues>> | undefined, key: SettlementKey): number | null {
  const city = types?.yogun_kent;
  const rural = types?.kir;
  return enoughTests(city) && enoughTests(rural) ? rural[key] / city[key] : null;
}

// Under this a ratio reads as a share ("%87'si", "%106'sı"), from it on as a multiple ("2,8 katı"), as latency does.
const MULTIPLE_FROM = 1.5;

/** How a ratio reads after "kentte ölçülenin": "%40'ı", "%106'sı", "2,8 katı". */
export function ratioText(ratio: number): string {
  return ratio < MULTIPLE_FROM ? percentOf(Math.round(ratio * 100)) : `${formatNumber(ratio, 1)} katı`;
}
