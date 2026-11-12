import assert from "node:assert/strict";
import test from "node:test";
import { loadLib } from "./load.mjs";

const { areaColor, RAMPS } = loadLib("colors");
const { metricById, LOW_TESTS } = loadLib("metrics");
const download = metricById("indirme");
const reliability = metricById("guvenilirlik");

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const near = (a, b) => rgb(a).every((c, i) => Math.abs(c - rgb(b)[i]) <= 3);
// Relative luminance is enough to compare along a one-hue ramp.
const luminance = (hex) => rgb(hex).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);

test("a speed at the middle of its class takes that class's ramp colour", () => {
  // 50-100 Mbps is class 3; its log-midpoint is about 70.7.
  for (const theme of ["light", "dark"]) {
    assert.ok(near(areaColor(download, Math.sqrt(50 * 100), 1000, theme), RAMPS[theme].full[3]), theme);
    assert.ok(near(areaColor(download, Math.sqrt(50 * 100), 1, theme), RAMPS[theme].muted[3]), theme);
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

test("few tests mute the colour; reliability keeps its three classes", () => {
  assert.notEqual(areaColor(download, 120, LOW_TESTS - 1, "light"), areaColor(download, 120, LOW_TESTS, "light"));
  assert.equal(areaColor(reliability, 0, 5, "light"), RAMPS.light.reliability[0]);
  assert.equal(areaColor(reliability, 0, 20, "light"), RAMPS.light.reliability[1]);
  assert.equal(areaColor(reliability, 0, 500, "dark"), RAMPS.dark.reliability[2]);
});
