import type { ExpressionSpecification } from "maplibre-gl";
import { LOW_TESTS, classIndex, type Metric } from "./metrics";

export type Theme = "light" | "dark";

// One-hue blue ramps from the reference sequential palette, evenly spaced in OKLab lightness
// (steps 250 -> 700 on light, 600 -> 100 on dark; both ends >= 2:1 against the surface).
// "muted" keeps each step's lightness with ~20% of its chroma: values from fewer than
// LOW_TESTS tests read grey, so the uncertainty shows without changing the value's lightness.
export const RAMPS: Record<Theme, { full: string[]; muted: string[]; reliability: string[]; noData: string }> = {
  light: {
    full: ["#86b6ef", "#619fe9", "#3987e5", "#2771ca", "#1c5cab", "#14498b", "#0d366b"],
    muted: ["#a9b3c0", "#919eae", "#79889c", "#657386", "#525f6f", "#414b59", "#303843"],
    reliability: ["#86b6ef", "#2771ca", "#0d366b"],
    noData: "#d6d5ce",
  },
  dark: {
    full: ["#184f95", "#2265b8", "#2f7ddb", "#5497e7", "#7db1ee", "#a6c9f5", "#cde2fb"],
    muted: ["#475160", "#5b6879", "#6f7f93", "#8896a8", "#a3aebc", "#bfc7d0", "#dbe0e6"],
    reliability: ["#184f95", "#5497e7", "#cde2fb"],
    noData: "#383835",
  },
};

// Panel charts: the selected area in categorical slot 1 (blue), Türkiye in the de-emphasis
// grey, and the reference palette's chart chrome.
export const CHART: Record<Theme, { area: string; national: string; grid: string; axis: string; muted: string; surface: string }> = {
  light: { area: "#2a78d6", national: "#898781", grid: "#e1e0d9", axis: "#c3c2b7", muted: "#898781", surface: "#fcfcfb" },
  dark: { area: "#3987e5", national: "#898781", grid: "#2c2c2a", axis: "#383835", muted: "#898781", surface: "#1a1a19" },
};

/** The legend's edges for a metric, as logarithms: its breaks, with the open-ended classes at both ends given their neighbour's width. */
function legendEdges(metric: Metric): number[] {
  const logBreaks = metric.breaks.map(Math.log);
  const k = logBreaks.length;
  return [2 * logBreaks[0] - logBreaks[1], ...logBreaks, 2 * logBreaks[k - 1] - logBreaks[k - 2]];
}

/**
 * Where a log value sits along the legend, from 0 to breaks + 1: class i spans [i, i + 1], with the
 * value placed log-linearly between its breaks.
 */
function classPosition(logValue: number, edges: number[]): number {
  const last = edges.length - 1;
  if (!(logValue > edges[0])) return 0;
  if (logValue >= edges[last]) return last;
  let i = 0;
  while (logValue >= edges[i + 1]) i++;
  return i + (logValue - edges[i]) / (edges[i + 1] - edges[i]);
}

const hex = (c: number) => c.toString(16).padStart(2, "0");
const hexColor = (rgb: number[]) => `#${rgb.map(hex).join("")}`;

/** A province's or district's fill. Reliability keeps its three classes; a speed takes the
 *  continuous colour for its value (muted under LOW_TESTS tests), so neighbouring areas in one
 *  class still differ and an area has the colour a heat map cell of that value has. */
export function areaColor(metric: Metric, value: number, tests: number, theme: Theme): string {
  const ramps = RAMPS[theme];
  if (metric.id === "guvenilirlik") return ramps.reliability[classIndex(tests, metric.breaks)];
  const position = classPosition(Math.log(Math.max(value, 0.01)), legendEdges(metric)) / (metric.breaks.length + 1);
  return hexColor(rampColor(tests < LOW_TESTS ? ramps.muted : ramps.full, position));
}

// Stops per class in a cell's colour expression. MapLibre blends between stops in RGB, which over
// a quarter of a class is the same colour as the OKLab blend to the eye.
const CELL_STOPS = 4;

/** A heat map cell's fill for a metric and period, as a MapLibre expression over the cell's own
 *  properties (d2019, t2019 ...): the colour areaColor() gives that value and test count. */
export function cellColor(metric: Metric, period: string, theme: Theme): ExpressionSpecification {
  const ramps = RAMPS[theme];
  const tests: ExpressionSpecification = ["get", `t${period}`];
  if (metric.id === "guvenilirlik") {
    const [first, ...rest] = ramps.reliability;
    return ["step", tests, first, ...metric.breaks.flatMap((b, i) => [b, rest[i]])] as ExpressionSpecification;
  }
  const edges = legendEdges(metric);
  const classes = edges.length - 1;
  // A zero average (no upload measured) still needs a logarithm.
  const logValue: ExpressionSpecification = ["ln", ["max", ["get", `${metric.tileKey}${period}`], 0.01]];
  const along = (ramp: string[]) => {
    const stops: (number | string)[] = [];
    for (let s = 0; s <= classes * CELL_STOPS; s++) {
      const i = Math.min(classes - 1, Math.floor(s / CELL_STOPS));
      stops.push(edges[i] + (s / CELL_STOPS - i) * (edges[i + 1] - edges[i]), hexColor(rampColor(ramp, s / CELL_STOPS / classes)));
    }
    return ["interpolate", ["linear"], logValue, ...stops] as ExpressionSpecification;
  };
  return ["case", ["<", tests, LOW_TESTS], along(ramps.muted), along(ramps.full)];
}

// Speeds are coloured continuously: each ramp colour sits at the centre of its legend segment
// and the colours between are blended in OKLab, where these ramps are evenly spaced.
type Lab = [number, number, number];

function toLab(hex: string): Lab {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function toRgb([L, a, b]: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  }) as [number, number, number];
}

const mix = (a: Lab, b: Lab, t: number): Lab => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A ramp's colour at x (0-1 along the legend). */
function rampColor(ramp: string[], x: number): [number, number, number] {
  const p = Math.min(ramp.length - 1, Math.max(0, x * ramp.length - 0.5));
  const i = Math.min(ramp.length - 2, Math.floor(p));
  return toRgb(mix(toLab(ramp[i]), toLab(ramp[i + 1]), p - i));
}

/** The speed colours as a CSS gradient for the legend, full or muted. */
export function heatGradient(theme: Theme, muted = false): string {
  const ramp = RAMPS[theme][muted ? "muted" : "full"];
  const stops = Array.from({ length: 25 }, (_, i) => {
    const [r, g, b] = rampColor(ramp, i / 24);
    return `rgb(${r} ${g} ${b}) ${(i / 24) * 100}%`;
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}
