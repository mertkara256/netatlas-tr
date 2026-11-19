import assert from "node:assert/strict";
import test from "node:test";
import { loadLib } from "./load.mjs";

const { RELIABILITY_LABELS, RELIABILITY_RANGES, metricById, reliabilityLabel, representationConditions } = loadLib("metrics");

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

// An area with 216 tests, a tenth of its weight in one tile and nine in ten residents near a test.
const area = (values) => ({ test: 216, tek_kare_payi: 0.1, olculen_nufus_payi: 0.9, ...values });

test("one tile holding 30% or more of an area's weight is a representation condition", () => {
  assert.deepEqual(representationConditions(area({ tek_kare_payi: 0.3 })), ["oneTile"]);
  assert.deepEqual(representationConditions(area({ tek_kare_payi: 0.299 })), []);
});

test("fewer than half of an area's residents living near a test is a representation condition", () => {
  assert.deepEqual(representationConditions(area({ olculen_nufus_payi: 0.499 })), ["residents"]);
  assert.deepEqual(representationConditions(area({ olculen_nufus_payi: 0.5 })), []);
});

test("an area can meet both representation conditions, or none", () => {
  // Aybastı in the current period: one tile 36%, residents 56%.
  assert.deepEqual(representationConditions(area({ tek_kare_payi: 0.357, olculen_nufus_payi: 0.56 })), ["oneTile"]);
  assert.deepEqual(representationConditions(area({ tek_kare_payi: 0.357, olculen_nufus_payi: 0.3 })), ["oneTile", "residents"]);
  assert.deepEqual(representationConditions(area({})), []);
});

test("values from fewer than 10 tests get no representation conditions; their own note says they are uncertain", () => {
  assert.deepEqual(representationConditions(area({ test: 9, tek_kare_payi: 1, olculen_nufus_payi: 0 })), []);
  assert.deepEqual(representationConditions(area({ test: 10, tek_kare_payi: 1, olculen_nufus_payi: 0 })), ["oneTile", "residents"]);
});
