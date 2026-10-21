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
