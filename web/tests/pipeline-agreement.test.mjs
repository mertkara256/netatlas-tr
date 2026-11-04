// The site and the Python pipeline compute some things twice, and the two must agree: the pipeline
// folds place names into the search index (pipeline.common.normalize_name) and labels reliability
// (pipeline.build.RELIABILITY); the site folds what people type and labels tile cells. These tests
// read the pipeline's output in public/data/, so they are skipped where it has not been downloaded.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { loadLib } from "./load.mjs";

const data = (name) => new URL(`../public/data/${name}`, import.meta.url);
const missing = ["arama.json", "iller.json", "ilceler.json"].some((name) => !existsSync(data(name)))
  && "no site data in public/data/";
const read = (name) => JSON.parse(readFileSync(data(name), "utf8"));

test("search folds every place name the way the pipeline did", { skip: missing }, () => {
  const { normalize } = loadLib("search");
  const places = read("arama.json");
  assert.ok(places.length > 1000);
  for (const place of places) {
    assert.equal(normalize(place.ad), place.ara, place.ad);
    // As people type it: in capitals, or without Turkish letters ("SANLIURFA").
    assert.equal(normalize(place.ad.toLocaleUpperCase("tr-TR")), place.ara, place.ad);
    assert.equal(normalize(place.ara.toUpperCase()), place.ara, place.ad);
  }
});

test("reliability labels match the pipeline's for every province and district", { skip: missing }, () => {
  const { reliabilityLabel } = loadLib("metrics");
  const labels = { dusuk: "Düşük", orta: "Orta", yuksek: "Yüksek" };
  const areas = [...Object.values(read("iller.json").iller), ...Object.values(read("ilceler.json"))];
  let checked = 0;
  for (const area of areas) {
    for (const [period, values] of Object.entries(area.hiz)) {
      assert.equal(reliabilityLabel(values.test), labels[values.guvenilirlik], `${area.ad} ${period}: ${values.test} tests`);
      checked++;
    }
  }
  assert.ok(checked > 7000);
});
