import assert from "node:assert/strict";
import test from "node:test";
import { loadLib } from "./load.mjs";

const { enoughTests, ratioText, ruralRatio, SETTLEMENT_TYPES } = loadLib("settlement");
const { percentOf } = loadLib("format");

// Türkiye in the current period (2025 Ç4 – 2026 Ç3).
const TURKIYE = {
  yogun_kent: { test: 4203395, indirme_mbps: 218.5, yukleme_mbps: 65.8, gecikme_ms: 10.5, olculen_nufus_payi: 1 },
  orta_yogun_kent: { test: 913729, indirme_mbps: 133.3, yukleme_mbps: 29.7, gecikme_ms: 18.8, olculen_nufus_payi: 0.978 },
  kir: { test: 476371, indirme_mbps: 87.9, yukleme_mbps: 22, gecikme_ms: 29, olculen_nufus_payi: 0.593 },
};
const withTests = (type, test) => ({ ...TURKIYE, [type]: { ...TURKIYE[type], test } });

test("the types are listed from yoğun kent to kır", () => {
  assert.deepEqual(SETTLEMENT_TYPES.map((t) => t.label), ["Yoğun kent", "Orta yoğun kent", "Kır"]);
});

test("a type's value is shown from 200 tests on", () => {
  assert.equal(enoughTests({ ...TURKIYE.kir, test: 200 }), true);
  assert.equal(enoughTests({ ...TURKIYE.kir, test: 199 }), false);
  assert.equal(enoughTests(undefined), false);
});

test("kır is compared with yoğun kent, orta yoğun kent left aside", () => {
  assert.equal(ruralRatio(TURKIYE, "indirme_mbps"), 87.9 / 218.5);
  assert.equal(ruralRatio(TURKIYE, "gecikme_ms"), 29 / 10.5);
  assert.equal(ruralRatio(withTests("orta_yogun_kent", 5), "indirme_mbps"), 87.9 / 218.5);
});

test("no comparison unless both kır and yoğun kent have 200 tests", () => {
  assert.equal(ruralRatio(withTests("kir", 180), "indirme_mbps"), null);  // Bitlis's kır in the current period
  assert.equal(ruralRatio(withTests("yogun_kent", 199), "indirme_mbps"), null);
  // Artvin, Bayburt and four more provinces have no yoğun kent.
  assert.equal(ruralRatio({ orta_yogun_kent: TURKIYE.orta_yogun_kent, kir: TURKIYE.kir }, "indirme_mbps"), null);
  assert.equal(ruralRatio(undefined, "indirme_mbps"), null);
});

test("a ratio reads as a share under 1.5 and as a multiple from it", () => {
  assert.equal(ratioText(87.9 / 218.5), "%40'ı");
  assert.equal(ratioText(202.6 / 232.2), "%87'si");  // Ankara
  assert.equal(ratioText(1.06), "%106'sı");
  assert.equal(ratioText(1.496), "%150'si");
  assert.equal(ratioText(1.5), "1,5 katı");
  assert.equal(ratioText(29 / 10.5), "2,8 katı");
});

test("a percentage takes the possessive suffix it is read aloud with", () => {
  const expected = {
    0: "%0'ı", 1: "%1'i", 2: "%2'si", 3: "%3'ü", 4: "%4'ü", 5: "%5'i", 6: "%6'sı", 7: "%7'si", 8: "%8'i", 9: "%9'u",
    10: "%10'u", 20: "%20'si", 30: "%30'u", 40: "%40'ı", 50: "%50'si", 60: "%60'ı", 70: "%70'i", 80: "%80'i", 90: "%90'ı",
    48: "%48'i", 56: "%56'sı", 100: "%100'ü", 101: "%101'i", 110: "%110'u", 200: "%200'ü", 1000: "%1.000'i",
  };
  for (const [value, text] of Object.entries(expected)) assert.equal(percentOf(Number(value)), text, value);
});
