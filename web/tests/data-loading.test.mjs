import assert from "node:assert/strict";
import test from "node:test";
import { loadLib } from "./load.mjs";

const area = { ad: "İstanbul", hiz: {} };
const places = [{ tur: "il", kod: "34", ad: "İstanbul", ara: "istanbul", bbox: [28, 40, 30, 42] }];
const fixtures = [
  { name: "province data", load: () => loadLib("data").loadAreas.bind(null, "iller"), body: { iller: { "34": area } }, value: { "34": area }, invalid: {}, invalidEntry: { iller: { "34": {} } } },
  { name: "district data", load: () => loadLib("data").loadAreas.bind(null, "ilceler"), body: { TR3401: area }, value: { TR3401: area }, invalid: [], invalidEntry: { TR3401: {} } },
  { name: "search data", load: () => loadLib("search").loadPlaces, body: places, value: places, invalid: {}, invalidEntry: [{}] },
];

function mockFetch(t, implementation) {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => { globalThis.fetch = original; });
}

for (const fixture of fixtures) {
  test(`${fixture.name} shares in-flight requests and caches successful data`, async (t) => {
    const load = fixture.load();
    let calls = 0;
    let respond;
    mockFetch(t, () => {
      calls++;
      return new Promise((resolve) => { respond = resolve; });
    });
    const first = load();
    const second = load();
    assert.equal(first, second);
    assert.equal(calls, 1);
    respond(Response.json(fixture.body));
    assert.deepEqual(await first, fixture.value);
    assert.deepEqual(await load(), fixture.value);
    assert.equal(calls, 1);
  });

  for (const failure of ["network", "http", "json", "shape", "entry"]) {
    test(`${fixture.name} can retry after a ${failure} failure`, async (t) => {
      const load = fixture.load();
      let calls = 0;
      mockFetch(t, async () => {
        calls++;
        if (calls > 1) return Response.json(fixture.body);
        if (failure === "network") throw new TypeError("Connection interrupted");
        if (failure === "http") return Response.json(fixture.body, { status: 503 });
        if (failure === "json") return new Response("{");
        if (failure === "entry") return Response.json(fixture.invalidEntry);
        return Response.json(fixture.invalid);
      });
      const rejected = load();
      assert.equal(load(), rejected);
      await assert.rejects(rejected);
      // Failure alone must not start an automatic retry.
      assert.equal(calls, 1);
      assert.deepEqual(await load(), fixture.value);
      assert.equal(calls, 2);
    });
  }
}

test("a failed district request does not evict successfully loaded provinces", async (t) => {
  const { loadAreas } = loadLib("data");
  const requests = [];
  mockFetch(t, async (url) => {
    requests.push(url);
    if (url.endsWith("ilceler.json")) throw new TypeError("Connection interrupted");
    return Response.json({ iller: { "34": area } });
  });
  await loadAreas("iller");
  await assert.rejects(loadAreas("ilceler"));
  assert.deepEqual(await loadAreas("iller"), { "34": area });
  assert.deepEqual(requests, ["/data/iller.json", "/data/ilceler.json"]);
});
