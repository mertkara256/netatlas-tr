import assert from "node:assert/strict";
import test from "node:test";
import { loadLib } from "./load.mjs";

const { RELIABILITY_LABELS, RELIABILITY_RANGES, metricById, reliabilityLabel } = loadLib("metrics");

test("reliability changes label at 10 and 200 tests", () => {
  for (const [tests, label] of [[0, "Düşük"], [9, "Düşük"], [10, "Orta"], [199, "Orta"], [200, "Yüksek"], [12000, "Yüksek"]]) {
    assert.equal(reliabilityLabel(tests), label, `${tests} tests`);
  }
});

test("the legend's ranges and the reliability map's classes follow the same floors", () => {
  assert.deepEqual(RELIABILITY_RANGES, ["<10", "10–199", "200+"]);
  assert.equal(RELIABILITY_RANGES.length, RELIABILITY_LABELS.length);
  assert.deepEqual(metricById("guvenilirlik").breaks, [10, 200]);
});
