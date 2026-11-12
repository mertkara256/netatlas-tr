import type { SpeedValues } from "./data";

export type MetricId = "indirme" | "yukleme" | "gecikme" | "guvenilirlik";

export type Metric = {
  id: MetricId;
  label: string;
  title: string;
  unit: string;
  /** Property prefix in the tiles: d2019, u2019, l2019, t2019 ... */
  tileKey: "d" | "u" | "l" | "t";
  areaKey: keyof SpeedValues;
  /** Class breaks: a value v falls in class i when breaks[i-1] <= v < breaks[i]. */
  breaks: number[];
  digits: number;
  note?: string;
};

// Values under this many tests in a period are uncertain (see the pipeline's split-half check).
export const LOW_TESTS = 10;
// From this many tests on a value is reliable (the pipeline's RELIABILITY floors are the same).
export const HIGH_TESTS = 200;
// An area whose largest 475 m tile holds at least this share of its weight gets a note in its panel.
export const ONE_TILE_SHARE = 0.3;
const RELIABILITY_BREAKS = [LOW_TESTS, HIGH_TESTS];

// Speeds span two orders of magnitude (2019's median square ~16 Mbps, today's ~120), so the
// breaks are roughly log-spaced and the same in every period: a colour means the same speed
// in every year, and each year still spreads over several classes.
export const METRICS: Metric[] = [
  {
    id: "indirme", label: "İndirme", title: "Ölçülen ortalama indirme hızı", unit: "Mbps",
    tileKey: "d", areaKey: "indirme_mbps", breaks: [10, 25, 50, 100, 200, 400], digits: 1,
  },
  {
    id: "yukleme", label: "Yükleme", title: "Ölçülen ortalama yükleme hızı", unit: "Mbps",
    tileKey: "u", areaKey: "yukleme_mbps", breaks: [2, 5, 10, 25, 50, 100], digits: 1,
  },
  {
    id: "gecikme", label: "Gecikme", title: "Ölçülen ortalama gecikme", unit: "ms",
    tileKey: "l", areaKey: "gecikme_ms", breaks: [10, 15, 20, 30, 50, 80], digits: 0, note: "düşük daha iyi",
  },
  {
    id: "guvenilirlik", label: "Güvenilirlik", title: "Güvenilirlik (test sayısı)", unit: "test",
    tileKey: "t", areaKey: "test", breaks: RELIABILITY_BREAKS, digits: 0,
  },
];

export const RELIABILITY_LABELS = ["Düşük", "Orta", "Yüksek"];
/** The test counts behind each label, for the legend. */
export const RELIABILITY_RANGES = [`<${LOW_TESTS}`, `${LOW_TESTS}–${HIGH_TESTS - 1}`, `${HIGH_TESTS}+`];

export function metricById(id: MetricId): Metric {
  return METRICS.find((m) => m.id === id)!;
}

export function classIndex(value: number, breaks: number[]): number {
  return breaks.filter((b) => value >= b).length;
}

/** "Düşük", "Orta" or "Yüksek" for a value from this many tests. */
export function reliabilityLabel(tests: number): string {
  return RELIABILITY_LABELS[classIndex(tests, RELIABILITY_BREAKS)];
}

const integer = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

/** Labels for the boundaries between legend swatches. */
export function breakLabels(metric: Metric): string[] {
  return metric.breaks.map((v) => integer.format(v));
}
