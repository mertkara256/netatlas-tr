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

export function areaColor(metric: Metric, value: number, tests: number, theme: Theme): string {
  const ramps = RAMPS[theme];
  if (metric.id === "guvenilirlik") return ramps.reliability[classIndex(tests, metric.breaks)];
  return (tests < LOW_TESTS ? ramps.muted : ramps.full)[classIndex(value, metric.breaks)];
}

// The heat map colours continuously: each ramp colour sits at the centre of its legend segment
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

/** The ramp's colour at x (0-1 along the legend), mixed toward the muted ramp by `share` (0-1). */
function rampColor(full: string[], muted: string[] | null, x: number, share = 0): [number, number, number] {
  const p = Math.min(full.length - 1, Math.max(0, x * full.length - 0.5));
  const i = Math.min(full.length - 2, Math.floor(p));
  const at = (ramp: string[]) => mix(toLab(ramp[i]), toLab(ramp[i + 1]), p - i);
  return toRgb(muted && share > 0 ? mix(at(full), at(muted), share) : at(full));
}

/** The ramps for a metric: speeds have a muted twin for few-test values, reliability does not. */
function heatRamps(metric: Metric, theme: Theme): [string[], string[] | null] {
  const ramps = RAMPS[theme];
  return metric.id === "guvenilirlik" ? [ramps.reliability, null] : [ramps.full, ramps.muted];
}

export const HEAT_STEPS = 256;
export const HEAT_LEVELS = 9;
const tables = new Map<string, Uint8ClampedArray>();

/** RGB for HEAT_LEVELS shares of few-test cells x HEAT_STEPS positions along the legend. */
export function heatTable(metric: Metric, theme: Theme): Uint8ClampedArray {
  const key = `${theme}/${metric.id === "guvenilirlik"}`;
  let table = tables.get(key);
  if (!table) {
    const [full, muted] = heatRamps(metric, theme);
    table = new Uint8ClampedArray(HEAT_LEVELS * HEAT_STEPS * 3);
    for (let level = 0; level < HEAT_LEVELS; level++) {
      for (let step = 0; step < HEAT_STEPS; step++) {
        const rgb = rampColor(full, muted, (step + 0.5) / HEAT_STEPS, level / (HEAT_LEVELS - 1));
        table.set(rgb, (level * HEAT_STEPS + step) * 3);
      }
    }
    tables.set(key, table);
  }
  return table;
}

/** The heat map's colours as a CSS gradient for the legend, full or muted. */
export function heatGradient(metric: Metric, theme: Theme, mutedRamp = false): string {
  const [full, muted] = heatRamps(metric, theme);
  const stops = Array.from({ length: 25 }, (_, i) => {
    const [r, g, b] = rampColor(mutedRamp && muted ? muted : full, null, i / 24);
    return `rgb(${r} ${g} ${b}) ${(i / 24) * 100}%`;
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}
