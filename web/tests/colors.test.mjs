import assert from "node:assert/strict";
import test from "node:test";
import { createExpression, latest } from "@maplibre/maplibre-gl-style-spec";
import { loadLib } from "./load.mjs";

const { areaColor, cellColor, RAMPS } = loadLib("colors");
const { metricById, LOW_TESTS } = loadLib("metrics");
const download = metricById("indirme");
const reliability = metricById("guvenilirlik");

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const near = (a, b) => rgb(a).every((c, i) => Math.abs(c - rgb(b)[i]) <= 3);
const toHex = (color) => `#${[color.r, color.g, color.b].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("")}`;

/** The colour MapLibre fills a heat map cell with, given the cell's properties in the tile. */
function drawnColor(metric, period, theme, properties) {
  const compiled = createExpression(cellColor(metric, period, theme), "layers[0].paint.fill-color", latest.paint_fill["fill-color"]);
  assert.equal(compiled.result, "success", JSON.stringify(compiled.value));
  return toHex(compiled.value.evaluate({ zoom: 12 }, { type: "Polygon", properties }));
}

// Relative luminance is enough to compare along a one-hue ramp.
const luminance = (hex) => rgb(hex).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);

test("a speed at the middle of its class takes that class's ramp colour", () => {
  // 50-100 Mbps is class 3; its log-midpoint is about 70.7.
  for (const theme of ["light", "dark"]) {
    assert.ok(near(areaColor(download, Math.sqrt(50 * 100), 1000, theme), RAMPS[theme].full[3]), theme);
  }
});

test("two speeds in one class get different colours, in order", () => {
  // 120 and 180 Mbps share the 100-200 class, which used to give them one colour.
  assert.notEqual(areaColor(download, 120, 1000, "light"), areaColor(download, 180, 1000, "light"));
  const speeds = [5, 12, 30, 70, 120, 180, 300, 900];
  const light = speeds.map((v) => luminance(areaColor(download, v, 1000, "light")));
  const dark = speeds.map((v) => luminance(areaColor(download, v, 1000, "dark")));
  assert.deepEqual(light, [...light].sort((a, b) => b - a), "light: faster is darker");
  assert.deepEqual(dark, [...dark].sort((a, b) => a - b), "dark: faster is lighter");
});

test("few tests leave a speed its colour; reliability keeps its three classes", () => {
  // A value from few tests is drawn hollow, in the colour of the value.
  assert.equal(areaColor(download, 120, LOW_TESTS - 1, "light"), areaColor(download, 120, LOW_TESTS, "light"));
  assert.equal(areaColor(reliability, 0, 5, "light"), RAMPS.light.reliability[0]);
  assert.equal(areaColor(reliability, 0, 20, "light"), RAMPS.light.reliability[1]);
  assert.equal(areaColor(reliability, 0, 500, "dark"), RAMPS.dark.reliability[2]);
});

test("a heat map cell is drawn in the colour of its own value", () => {
  // Three neighbours in Dikili: 26.8 Mbps from 1 test, 176.1 from 21 and 79.0 from 189. Blended
  // into each other they read as one drift from grey to blue; each must show its own colour.
  const cells = [[26.8, 1], [176.1, 21], [79, 189], [0, 3], [4.2, 9], [10, 10], [399.9, 200], [2500, 40]];
  for (const theme of ["light", "dark"]) {
    for (const id of ["indirme", "yukleme", "gecikme"]) {
      const metric = metricById(id);
      for (const [value, tests] of cells) {
        const drawn = drawnColor(metric, "guncel", theme, { [`${metric.tileKey}guncel`]: value, tguncel: tests, d2019: 1, t2019: 999 });
        assert.ok(near(drawn, areaColor(metric, value, tests, theme)), `${theme} ${id} ${value} from ${tests} tests: ${drawn}`);
      }
    }
  }
  const [slow, fast] = [drawnColor(download, "guncel", "dark", { dguncel: 79, tguncel: 189 }), drawnColor(download, "guncel", "dark", { dguncel: 176.1, tguncel: 21 })];
  assert.ok(luminance(fast) > luminance(slow) + 20, `${slow} and ${fast} must be told apart`);
});

test("a heat map cell's reliability is one of the three classes", () => {
  for (const theme of ["light", "dark"]) {
    for (const [tests, label] of [[1, 0], [LOW_TESTS - 1, 0], [LOW_TESTS, 1], [199, 1], [200, 2], [5000, 2]]) {
      assert.equal(drawnColor(reliability, "2024", theme, { t2024: tests }), RAMPS[theme].reliability[label], `${theme} ${tests}`);
    }
  }
});
