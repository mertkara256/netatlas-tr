import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { loadLib } from "./load.mjs";

const { FIBER_TARGET, fiberLead, fiberPer100 } = loadLib("btk");
const { countOf, inYear } = loadLib("format");

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

test("fiber per 100 people is the plan's measure: subscriptions over population", () => {
  // BTK's Türkiye totals for 2022 and 2025; the plan gives 6,7 for 2022.
  assert.equal(fiberPer100({ fiber: 5702865, nufus: 85279553 }).toFixed(2), "6.69");
  assert.equal(fiberPer100({ fiber: 9845226, nufus: 86092168 }).toFixed(2), "11.44");
  assert.deepEqual({ year: FIBER_TARGET.year, value: FIBER_TARGET.value }, { year: 2028, value: 11 });
});

test("a count takes the possessive suffix it is read aloud with", () => {
  assert.equal(countOf(17), "17'si");
  assert.equal(countOf(4), "4'ü");
  assert.equal(countOf(40), "40'ı");
  assert.equal(countOf(81), "81'i");
});

// Subscriptions per 100 households, as the pipeline wrote them to public/data/iller.json (skipped where it has not been
// downloaded): per 100 people times TÜİK's average household size in the province that year.
const provincesFile = new URL("../public/data/iller.json", import.meta.url);
const noData = !existsSync(provincesFile) && "no site data in public/data/";
const provinces = () => JSON.parse(readFileSync(provincesFile, "utf8")).iller;

test("fixed and fiber per 100 households use the same household size", { skip: noData }, () => {
  let checked = 0;
  for (const [code, province] of Object.entries(provinces())) {
    for (const [year, btk] of Object.entries(province.btk)) {
      const size = btk.abone_100_hane / (btk.sabit_genisbant / btk.nufus * 100);
      // TÜİK's averages in 2020-2025 run from 2,49 (Tunceli, 2025) to 5,75 (Şırnak, 2020).
      assert.ok(size > 2.4 && size < 5.8, `${code} ${year}: ${size}`);
      assert.ok(Math.abs(btk.fiber_100_hane - fiberPer100(btk) * size) < 0.01, `${code} ${year}`);
      checked++;
    }
  }
  assert.equal(checked, 82 * 6);
});

test("per 100 households in 2025: Türkiye, İstanbul and the lowest provinces in fiber", { skip: noData }, () => {
  const all = provinces();
  const turkiye = all["00"].btk["2025"];
  assert.deepEqual([turkiye.abone_100.toFixed(1), turkiye.abone_100_hane.toFixed(1)], ["24.4", "75.2"]);
  assert.deepEqual([fiberPer100(turkiye).toFixed(1), turkiye.fiber_100_hane.toFixed(1)], ["11.4", "35.2"]);
  // Business subscriptions count too, so a province can come close to one subscription per household.
  assert.equal(all["34"].btk["2025"].abone_100_hane.toFixed(1), "97.9");
  const lowest = (value) => Object.entries(all).filter(([code]) => code !== "00")
    .sort(([, a], [, b]) => value(a.btk["2025"]) - value(b.btk["2025"])).slice(0, 3).map(([, p]) => p.ad);
  assert.deepEqual(lowest(fiberPer100), ["Hatay", "Muş", "Ağrı"]);
  assert.deepEqual(lowest((btk) => btk.fiber_100_hane), ["Hatay", "Gümüşhane", "Sinop"]);
});
