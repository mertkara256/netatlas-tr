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

// The possessive suffix a whole number takes as it is read aloud, chosen the same way: biri, ikisi, üçü ... dokuzu;
// onu, yirmisi ... doksanı; yüzü, bini, sıfırı.
const OF_DIGIT = ["", "i", "si", "ü", "ü", "i", "sı", "si", "i", "u"];
const OF_TENS = ["", "u", "si", "u", "ı", "si", "ı", "i", "i", "ı"];

/** A whole number as it follows a genitive: "81 ilin 17'si", "40'ı", "100'ü". */
export function countOf(value: number): string {
  const suffix = value % 10 ? OF_DIGIT[value % 10] : value % 100 ? OF_TENS[(value % 100) / 10]
    : value % 1000 ? "ü" : value ? "i" : "ı";
  return `${formatNumber(value)}'${suffix}`;
}

/** A whole percentage as it follows a genitive: "%40'ı", "%87'si", "%100'ü". */
export const percentOf = (value: number): string => `%${countOf(value)}`;
