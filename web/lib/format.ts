import type { Metric } from "./metrics";

const formats = new Map<number, Intl.NumberFormat>();

export function formatNumber(value: number, digits = 0): string {
  if (!formats.has(digits)) {
    formats.set(digits, new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  }
  return formats.get(digits)!.format(value);
}

export function formatValue(metric: Metric, value: number): string {
  return `${formatNumber(value, metric.digits)} ${metric.unit}`;
}

// The locative suffix a year takes as it is read aloud: by its last digit (bir, iki, üç ... dokuz) or,
// for a round number, by its tens (on, yirmi ... doksan); a whole hundred or thousand ends in yüz or bin.
const BY_DIGIT = ["", "de", "de", "te", "te", "te", "da", "de", "de", "da"];
const BY_TENS = ["", "da", "de", "da", "ta", "de", "ta", "te", "de", "da"];

/** "2020'de", "2024'te", "2026'da". */
export function inYear(year: number | string): string {
  const y = Number(year);
  return `${y}'${y % 10 ? BY_DIGIT[y % 10] : y % 100 ? BY_TENS[(y % 100) / 10] : "de"}`;
}
