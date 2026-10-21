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

export function areaColor(metric: Metric, value: number, tests: number, theme: Theme): string {
  const ramps = RAMPS[theme];
  if (metric.id === "guvenilirlik") return ramps.reliability[classIndex(tests, metric.breaks)];
  return (tests < LOW_TESTS ? ramps.muted : ramps.full)[classIndex(value, metric.breaks)];
}

/** Fill colour of the speed cells for one metric and period. */
export function cellColor(metric: Metric, period: string, theme: Theme): ExpressionSpecification {
  const ramps = RAMPS[theme];
  const step = (key: string, colors: string[]): ExpressionSpecification =>
    ["step", ["get", key], colors[0], ...metric.breaks.flatMap((b, i) => [b, colors[i + 1]])];
  const tests = `t${period}`;
  if (metric.id === "guvenilirlik") return step(tests, ramps.reliability);
  const value = `${metric.tileKey}${period}`;
  return ["case", ["<", ["get", tests], LOW_TESTS], step(value, ramps.muted), step(value, ramps.full)];
}
