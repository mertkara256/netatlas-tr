import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { PMTiles } from "pmtiles";
import { loadLib } from "./load.mjs";

function loadRequest(nearby, siteArchive = () => "archive", invalidateSiteArchive = () => {}) {
  const stubs = { "./nearby": { nearby, siteArchive, invalidateSiteArchive } };
  return loadLib("nearby-request", { stubs }).startNearbyRequest;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const value = { squares: 3, tests: 20, download: 100, upload: 20, latency: 10 };

// Use the real decoder and its default SharedPromiseCache with an in-memory range source.
function loadArchive(createSource) {
  class TestArchive extends PMTiles {
    constructor() { super(createSource()); }
  }
  return loadLib("nearby", {
    stubs: { pmtiles: { PMTiles: TestArchive }, "./data": { PMTILES_PATH: "/data/harita.pmtiles" } },
    globals: { window: { location: { origin: "https://example.test" } } },
  });
}

function emptyArchive() {
  const bytes = new Uint8Array(128);
  bytes.set(new TextEncoder().encode("PMTiles"));
  bytes[7] = 3;
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 127, true); // root directory offset
  view.setUint32(16, 1, true); // one byte encoding zero directory entries
  bytes[97] = 1; // internal compression: none
  bytes[98] = 1; // tile compression: none
  bytes[99] = 1; // vector tile
  bytes[101] = 12; // max zoom
  return bytes.buffer;
}

test("a failed nearby query waits for an explicit retry, which can succeed", async () => {
  const first = deferred();
  const second = deferred();
  const results = [];
  let calls = 0;
  const start = loadRequest((archive, lon, lat, period) => {
    assert.deepEqual([archive, lon, lat, period], ["archive", 29, 41, "guncel"]);
    return ++calls === 1 ? first.promise : second.promise;
  });
  const cancel = start(29, 41, "guncel", (result) => results.push(result));
  await setImmediate();
  first.reject(new TypeError("Range request failed"));
  await setImmediate();
  assert.deepEqual(results, [{ status: "error" }]);
  assert.equal(calls, 1);
  cancel();
  start(29, 41, "guncel", (result) => results.push(result));
  await setImmediate();
  assert.equal(calls, 2);
  second.resolve(value);
  await setImmediate();
  assert.deepEqual(results, [{ status: "error" }, { status: "ready", value }]);
});

test("an empty measurement result stays distinct from a failed request", async () => {
  const results = [];
  const start = loadRequest(async () => null);
  start(29, 41, "2019", (result) => results.push(result));
  await setImmediate();
  assert.deepEqual(results, [{ status: "ready", value: null }]);
});

for (const failure of ["archive", "query"]) {
  test(`a synchronous ${failure} failure becomes a request error`, async () => {
    const results = [];
    const fail = () => { throw new Error("Unable to initialize query"); };
    const start = loadRequest(failure === "query" ? fail : async () => value, failure === "archive" ? fail : undefined);
    assert.doesNotThrow(() => start(29, 41, "guncel", (result) => results.push(result)));
    await setImmediate();
    assert.deepEqual(results, [{ status: "error" }]);
  });
}

for (const settles of ["success", "failure"]) {
  test(`cleanup ignores a late ${settles} after unmount`, async () => {
    const pending = deferred();
    const results = [];
    const start = loadRequest(() => pending.promise);
    const cancel = start(29, 41, "guncel", (result) => results.push(result));
    await setImmediate();
    cancel();
    if (settles === "success") pending.resolve(value);
    else pending.reject(new TypeError("Request failed after unmount"));
    await setImmediate();
    assert.deepEqual(results, []);
  });

  test(`a stale ${settles} cannot replace the newer point and period`, async () => {
    const old = deferred();
    const current = deferred();
    const results = [];
    const start = loadRequest((archive, lon, lat, period) => period === "2019" ? old.promise : current.promise);
    const cancel = start(29, 41, "2019", (result) => results.push(result));
    await setImmediate();
    cancel();
    start(30, 40, "guncel", (result) => results.push(result));
    await setImmediate();
    current.resolve(value);
    await setImmediate();
    if (settles === "success") old.resolve(null);
    else old.reject(new TypeError("Obsolete request failed"));
    await setImmediate();
    assert.deepEqual(results, [{ status: "ready", value }]);
  });
}

test("retry recovers from a rejected header cached by the real PMTiles reader", async () => {
  let reads = 0;
  const archiveModule = loadArchive(() => ({
    getKey: () => "nearby-test",
    async getBytes() {
      if (++reads === 1) throw new TypeError("Header range request failed");
      return { data: emptyArchive() };
    },
  }));
  const firstArchive = archiveModule.siteArchive();
  await assert.rejects(firstArchive.getHeader());
  await assert.rejects(firstArchive.getHeader());
  assert.equal(reads, 1, "the failed header is still cached by this reader");
  const start = loadRequest(archiveModule.nearby, archiveModule.siteArchive, archiveModule.invalidateSiteArchive);
  const results = [];
  start(29, 41, "guncel", (result) => results.push(result));
  await setImmediate();
  assert.deepEqual(results, [{ status: "error" }]);
  assert.notEqual(archiveModule.siteArchive(), firstArchive);
  start(29, 41, "guncel", (result) => results.push(result));
  await setImmediate();
  assert.equal(reads, 2);
  assert.deepEqual(results, [{ status: "error" }, { status: "ready", value: null }]);
});

test("an obsolete failure cannot invalidate the replacement archive", () => {
  const archiveModule = loadArchive(() => ({ getKey: () => "test", getBytes: async () => ({ data: emptyArchive() }) }));
  const old = archiveModule.siteArchive();
  archiveModule.invalidateSiteArchive(old);
  const replacement = archiveModule.siteArchive();
  archiveModule.invalidateSiteArchive(old);
  assert.equal(archiveModule.siteArchive(), replacement);
});
