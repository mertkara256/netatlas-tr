import assert from "node:assert/strict";
import test from "node:test";
import { loadLib } from "./load.mjs";

const { formatMapHash, parseMapHash } = loadLib("mapHash");

const PERIODS = ["2019", "2020", "2021", "2022", "2023", "2024", "2025", "guncel"];
const FULL = {
  camera: { zoom: 12, lat: 40.9876, lon: 29.0281 },
  period: "guncel",
  metric: "indirme",
  view: "kareler",
  selection: { kind: "ilceler", code: "TUR034013" },
};

test("a full state comes back from its hash", () => {
  const hash = formatMapHash(FULL);
  assert.equal(hash, "#12/40.9876/29.0281&d=guncel&m=indirme&g=kareler&s=ilceler:TUR034013");
  assert.deepEqual(parseMapHash(hash, PERIODS), FULL);
});

test("every period, measure, view and kind of area survives the round trip", () => {
  for (const period of PERIODS) {
    for (const metric of ["indirme", "yukleme", "gecikme", "guvenilirlik"]) {
      for (const view of ["kareler", "ilceler", "iller"]) {
        for (const selection of [{ kind: "iller", code: "34" }, { kind: "ilceler", code: "TUR001001" }]) {
          const state = { period, metric, view, selection };
          assert.deepEqual(parseMapHash(formatMapHash(state), PERIODS), state);
        }
      }
    }
  }
});

test("the position is rounded to about a pixel, finer as the map zooms in", () => {
  const at = (zoom) => formatMapHash({ camera: { zoom, lat: 39.123456789, lon: 35.987654321 } });
  assert.equal(at(5.123456), "#5.12/39.12/35.99");
  assert.equal(at(12), "#12/39.1235/35.9877");
  assert.equal(at(15), "#15/39.12346/35.98765");
  // Read back, the position is within a pixel of where it was.
  const { camera } = parseMapHash(at(12), PERIODS);
  assert.ok(Math.abs(camera.lat - 39.123456789) < 1e-4 && Math.abs(camera.lon - 35.987654321) < 1e-4);
});

test("missing keys are left out, so the map keeps its defaults", () => {
  assert.deepEqual(parseMapHash("", PERIODS), {});
  assert.deepEqual(parseMapHash("#", PERIODS), {});
  assert.deepEqual(parseMapHash("#s=iller:06", PERIODS), { selection: { kind: "iller", code: "06" } });
  assert.deepEqual(parseMapHash("#d=2021&g=iller", PERIODS), { period: "2021", view: "iller" });
  assert.deepEqual(parseMapHash("#7/39/35", PERIODS), { camera: { zoom: 7, lat: 39, lon: 35 } });
  // The "#" is optional, and the keys may come in any order.
  assert.deepEqual(parseMapHash("m=gecikme&8/41/29", PERIODS), { camera: { zoom: 8, lat: 41, lon: 29 }, metric: "gecikme" });
  assert.equal(formatMapHash({ period: "guncel" }), "#d=guncel");
});

test("unknown or malformed values are dropped and the rest is kept", () => {
  const cases = [
    "#d=2018", // a period no longer offered
    "#d=GUNCEL",
    "#m=hiz",
    "#g=mahalleler",
    "#s=mahalleler:1",
    "#s=iller",
    "#s=iller:",
    "#s=iller:06:07",
    "#s=iller:<script>",
    "#s=ilceler:%54UR",
    "#12/abc/29",
    "#12/41",
    "#12/41/29/3",
    "#//",
    "#NaN/NaN/NaN",
    "#Infinity/41/29",
    "%%%&&&===",
    "#x=1&=&&",
  ];
  for (const hash of cases) assert.deepEqual(parseMapHash(hash, PERIODS), {}, hash);
  assert.deepEqual(parseMapHash("#12/abc/29&d=2019&m=hiz&g=iller", PERIODS), { period: "2019", view: "iller" });
});

test("a position outside Türkiye or the map's zoom range is dropped", () => {
  for (const hash of ["#10/48.85/2.35", "#10/-39/35", "#10/39/-35", "#10/35.5/30", "#10/39/45.1", "#2/39/35", "#16/39/35", "#-1/39/35"]) {
    assert.deepEqual(parseMapHash(hash, PERIODS), {}, hash);
  }
  // Hakkâri, Edirne and the edges of the box are inside.
  for (const hash of ["#12/37.57/43.74", "#12/41.68/26.56", "#3/35.7/25.5", "#15/42.2/45"]) {
    assert.ok(parseMapHash(hash, PERIODS).camera, hash);
  }
});

test("a period is accepted only from the periods on offer", () => {
  assert.deepEqual(parseMapHash("#d=2019", ["2020", "guncel"]), {});
  assert.deepEqual(parseMapHash("#d=guncel", ["2020", "guncel"]), { period: "guncel" });
});
