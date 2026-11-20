import assert from "node:assert/strict";
import test from "node:test";
import { loadLib } from "./load.mjs";

const { normalize, searchPlaces } = loadLib("search");

const bbox = [0, 0, 1, 1];
const province = (ad) => ({ tur: "il", kod: ad, ad, ara: normalize(ad), bbox });
const district = (ad, il) => ({ tur: "ilce", kod: `${ad}-${il}`, ad, il, ara: normalize(ad), bbox });
const places = [
  province("Konya"),
  province("Zonguldak"),
  province("Karaman"),
  province("Kars"),
  province("İstanbul"),
  district("Ereğli", "Konya"),
  district("Ereğli", "Zonguldak"),
  district("Karapınar", "Konya"),
  district("Kadıköy", "İstanbul"),
  district("Pınarbaşı", "Kastamonu"),
  district("Pınarbaşı", "Kayseri"),
  district("Kars", "Kars"),
];
const found = (query, limit) => searchPlaces(places, query, limit).map((p) => (p.il ? `${p.ad}, ${p.il}` : p.ad));

test("names are folded: Turkish letters, case, spaces and punctuation do not matter", () => {
  for (const query of ["Kadıköy", "KADIKÖY", "kadikoy", "Kadı köy", "kadı-köy"]) {
    assert.deepEqual(found(query), ["Kadıköy, İstanbul"], query);
  }
});

test("a query needs two letters", () => {
  assert.deepEqual(found(""), []);
  assert.deepEqual(found("k"), []);
  assert.deepEqual(found(" ı "), []);
  assert.deepEqual(found("ka"), ["Kars", "Karaman", "Kars, Kars", "Kadıköy, İstanbul", "Karapınar, Konya"]);
});

test("names starting with the query come first, then provinces, then shorter names, then the alphabet", () => {
  // "Kars" the province before "Kars" the district; "Karaman" before the districts though longer;
  // "Pınarbaşı" and "Karapınar" hold "pınar", but only the first starts with it.
  assert.deepEqual(found("kar"), ["Kars", "Karaman", "Kars, Kars", "Karapınar, Konya"]);
  assert.deepEqual(found("pınar"), ["Pınarbaşı, Kastamonu", "Pınarbaşı, Kayseri", "Karapınar, Konya"]);
  assert.deepEqual(found("ereğli"), ["Ereğli, Konya", "Ereğli, Zonguldak"]);
});

test("a district can be named with its province, either way round", () => {
  for (const query of ["Ereğli Konya", "Konya Ereğli", "ereğli, konya", "eregli kon", "Konya eregli"]) {
    assert.deepEqual(found(query), ["Ereğli, Konya"], query);
  }
  assert.deepEqual(found("Zonguldak Ereğli"), ["Ereğli, Zonguldak"]);
  assert.deepEqual(found("Pınarbaşı Kayseri"), ["Pınarbaşı, Kayseri"]);
  // The province's start narrows to the provinces it fits; the district part may still be typed.
  assert.deepEqual(found("Pınarbaşı Ka"), ["Pınarbaşı, Kastamonu", "Pınarbaşı, Kayseri"]);
  assert.deepEqual(found("Konya ka"), ["Karapınar, Konya"]);
});

test("words that name no district in that province find nothing", () => {
  assert.deepEqual(found("Ereğli İstanbul"), []);
  assert.deepEqual(found("Kadıköy Konya"), []);
  assert.deepEqual(found("xyz"), []);
});

test("at most `limit` results", () => {
  assert.equal(found("a", 2).length, 0);
  assert.deepEqual(found("ka", 2), ["Kars", "Karaman"]);
});
