import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { PMTiles } from "pmtiles";
import { loadLib } from "./load.mjs";

const { RETRY_DELAY } = loadLib("retry");

function loadRequest(nearby) {
  const stubs = {
    "./nearby": { nearby },
    "./data": { cellsArchive: (period) => `kareler-${period}` },
  };
  return loadLib("nearby-request", { stubs }).startNearbyRequest;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const value = { squares: 3, tests: 20, download: 100, upload: 20, latency: 10 };

// The real query, tile cache and archives, with the real PMTiles reader and its default
// SharedPromiseCache over an in-memory range source.
function loadRealRequest(createSource) {
  class TestArchive extends PMTiles {
    constructor() { super(createSource()); }
  }
  return loadLib("nearby-request", {
    stubs: {
      pmtiles: { PMTiles: TestArchive },
      "./data": { archivePath: (name) => `/data/${name}.pmtiles`, cellsArchive: (period) => `kareler-${period}` },
    },
    globals: { window: { location: { origin: "https://example.test" } } },
  }).startNearbyRequest;
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
    assert.deepEqual([archive, lon, lat, period], ["kareler-guncel", 29, 41, "guncel"]);
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

test("the query reads the cells of the period it was asked for", async () => {
  const opened = [];
  const start = loadRequest(async (archive) => { opened.push(archive); return value; });
  start(29, 41, "2019", () => {});
  start(29, 41, "guncel", () => {});
  await setImmediate();
  assert.deepEqual(opened, ["kareler-2019", "kareler-guncel"]);
});

test("an empty measurement result stays distinct from a failed request", async () => {
  const results = [];
  const start = loadRequest(async () => null);
  start(29, 41, "2019", (result) => results.push(result));
  await setImmediate();
  assert.deepEqual(results, [{ status: "ready", value: null }]);
});

test("a synchronous query failure becomes a request error", async () => {
  const results = [];
  const start = loadRequest(() => { throw new Error("Unable to initialize query"); });
  assert.doesNotThrow(() => start(29, 41, "guncel", (result) => results.push(result)));
  await setImmediate();
  assert.deepEqual(results, [{ status: "error" }]);
});

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

test("a header the CDN rejected once is read again from a fresh archive, without a failed panel", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let reads = 0;
  const start = loadRealRequest(() => ({
    getKey: () => "nearby-test",
    async getBytes() {
      if (++reads === 1) throw new TypeError("Header range request failed");
      return { data: emptyArchive() };
    },
  }));
  const results = [];
  start(29, 41, "guncel", (result) => results.push(result));
  for (let i = 0; i < 5; i++) await setImmediate();
  assert.deepEqual(results, []);
  t.mock.timers.tick(RETRY_DELAY);
  for (let i = 0; i < 5; i++) await setImmediate();
  assert.equal(reads, 2);
  assert.deepEqual(results, [{ status: "ready", value: null }]);
});

test("after two failures the panel's retry reads the tiles again", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let reads = 0;
  const start = loadRealRequest(() => ({
    getKey: () => "nearby-test",
    async getBytes() {
      if (++reads <= 2) throw new TypeError("Header range request failed");
      return { data: emptyArchive() };
    },
  }));
  const results = [];
  start(29, 41, "guncel", (result) => results.push(result));
  for (let i = 0; i < 5; i++) await setImmediate();
  t.mock.timers.tick(RETRY_DELAY);
  for (let i = 0; i < 5; i++) await setImmediate();
  assert.deepEqual(results, [{ status: "error" }]);
  start(29, 41, "guncel", (result) => results.push(result));
  for (let i = 0; i < 5; i++) await setImmediate();
  assert.equal(reads, 3);
  assert.deepEqual(results, [{ status: "error" }, { status: "ready", value: null }]);
});
