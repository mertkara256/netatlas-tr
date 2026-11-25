import assert from "node:assert/strict";
import test from "node:test";
import { loadLib } from "./load.mjs";

const { fiberLead } = loadLib("btk");
const { inYear } = loadLib("format");

// Fiber and xDSL subscriptions per year, as BTK gives them for 2020-2025.
const years = (pairs) => Object.fromEntries(pairs.map(([fiber, xdsl], i) => [String(2020 + i), { fiber, xdsl }]));

test("fiber leads from the first year of the run that lasts to the last year", () => {
  assert.deepEqual(fiberLead(years([[1, 9], [2, 8], [3, 7], [4, 6], [6, 4], [8, 2]])), { since: "2024", fromStart: false });
  // Ahead, behind, then ahead again: only the run up to the last year counts.
  assert.deepEqual(fiberLead(years([[6, 4], [3, 7], [4, 6], [6, 4], [7, 3], [8, 2]])), { since: "2023", fromStart: false });
});

test("fiber ahead in BTK's first year may have been ahead earlier", () => {
  assert.deepEqual(fiberLead(years([[6, 4], [6, 4], [7, 3], [7, 3], [8, 2], [9, 1]])), { since: "2020", fromStart: true });
});

test("no lead while xDSL has as many or more in the last year", () => {
  assert.equal(fiberLead(years([[1, 9], [2, 8], [3, 7], [4, 6], [5, 5], [5, 5]])), null);
  assert.equal(fiberLead(years([[6, 4], [6, 4], [7, 3], [7, 3], [8, 2], [4, 6]])), null);
});

test("a year takes the locative suffix it is read aloud with", () => {
  const expected = {
    2020: "2020'de", 2021: "2021'de", 2022: "2022'de", 2023: "2023'te", 2024: "2024'te", 2025: "2025'te",
    2026: "2026'da", 2027: "2027'de", 2028: "2028'de", 2029: "2029'da", 2030: "2030'da", 2040: "2040'ta",
    2050: "2050'de", 2060: "2060'ta", 2070: "2070'te", 2080: "2080'de", 2090: "2090'da", 2000: "2000'de", 2100: "2100'de",
  };
  for (const [year, text] of Object.entries(expected)) assert.equal(inYear(year), text);
});
