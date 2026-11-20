import assert from "node:assert/strict";
import test from "node:test";
import { loadLib } from "./load.mjs";

const { compareAreas } = loadLib("order");
const { HIGH_TESTS } = loadLib("metrics");

// Bingöl's case: a district with a handful of tests has the fastest value.
const rows = [
  { ad: "Merkez", speed: 180, test: 2400 },
  { ad: "Yedisu", speed: 371.5, test: 10 },
  { ad: "Genç", speed: 150, test: HIGH_TESTS },
  { ad: "Adaklı" },
  { ad: "Karlıova", speed: 90, test: HIGH_TESTS - 1 },
];
const names = (sorted) => sorted.map((r) => r.ad);
const order = (options) => names([...rows].sort(compareAreas({
  value: (r) => r.speed, tests: (r) => r.test, ...options,
})));

test("reliable values come first, then the rest, then rows with no value", () => {
  assert.deepEqual(order({ dir: -1, reliableFirst: true }), ["Merkez", "Genç", "Yedisu", "Karlıova", "Adaklı"]);
});

test("without reliableFirst the values alone decide, and rows with no value still go last", () => {
  assert.deepEqual(order({ dir: -1, reliableFirst: false }), ["Yedisu", "Merkez", "Genç", "Karlıova", "Adaklı"]);
  assert.deepEqual(order({ dir: 1, reliableFirst: false }), ["Karlıova", "Genç", "Merkez", "Yedisu", "Adaklı"]);
});

test("ascending keeps the groups and turns each one around", () => {
  assert.deepEqual(order({ dir: 1, reliableFirst: true }), ["Genç", "Merkez", "Karlıova", "Yedisu", "Adaklı"]);
});

test("names sort in Turkish alphabetical order", () => {
  const sorted = [...rows].sort(compareAreas({ value: (r) => r.ad, tests: (r) => r.test, dir: 1, reliableFirst: false }));
  assert.deepEqual(names(sorted), ["Adaklı", "Genç", "Karlıova", "Merkez", "Yedisu"]);
});
