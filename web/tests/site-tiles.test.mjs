import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { loadLib } from "./load.mjs";

/** siteTiles.ts with the real retry module and a stand-in for the archive, which counts its reads
 *  and records which archive was opened. */
function loadSiteTiles(archives) {
  const reads = [];
  const names = [];
  let opened = 0;
  const stubs = {
    "./siteArchive": {
      siteArchive: (name) => {
        names.push(name);
        return archives[Math.min(opened++, archives.length - 1)];
      },
      invalidateSiteArchive: () => {},
    },
  };
  for (const archive of archives) {
    const getZxy = archive.getZxy;
    archive.getZxy = (...zxy) => {
      reads.push(zxy.join("/"));
      return getZxy(...zxy);
    };
  }
  return { ...loadLib("siteTiles", { stubs }), reads, names };
}

const tileBytes = () => new Uint8Array([26, 4, 1, 2, 3, 4]).buffer;

test("a tile asked for twice is read once", async () => {
  const { siteTile, vectorTile, reads } = loadSiteTiles([{ getZxy: async () => ({ data: tileBytes() }) }]);
  const [vector, kept] = await Promise.all([
    vectorTile({ url: "harita://kareler-guncel/6/37/24" }, new AbortController()),
    siteTile("kareler-guncel", 6, 37, 24),
  ]);
  assert.deepEqual(reads, ["6/37/24"]);
  assert.deepEqual(new Uint8Array(vector.data), new Uint8Array(kept));
});

test("MapLibre gets a copy, so moving it to its worker leaves the kept tile whole", async () => {
  const { siteTile, vectorTile } = loadSiteTiles([{ getZxy: async () => ({ data: tileBytes() }) }]);
  const { data } = await vectorTile({ url: "harita://kareler-guncel/6/37/24" }, new AbortController());
  structuredClone(data, { transfer: [data] }); // what postMessage does with it
  assert.equal(data.byteLength, 0);
  assert.equal((await siteTile("kareler-guncel", 6, 37, 24)).byteLength, 6);
});

test("a place without a tile gives the vector source an empty one", async () => {
  const { vectorTile } = loadSiteTiles([{ getZxy: async () => undefined }]);
  assert.equal((await vectorTile({ url: "harita://sinirlar/3/0/0" }, new AbortController())).data.byteLength, 0);
});

test("each archive's tiles are read from that archive and kept apart", async () => {
  const { siteTile, vectorTile, reads, names } = loadSiteTiles([{ getZxy: async () => ({ data: tileBytes() }) }]);
  await vectorTile({ url: "harita://sinirlar/6/37/24" }, new AbortController());
  await vectorTile({ url: "harita://kareler-2019/6/37/24" }, new AbortController());
  await siteTile("kareler-2019", 6, 37, 24);
  assert.deepEqual(names, ["sinirlar", "kareler-2019"]);
  assert.deepEqual(reads, ["6/37/24", "6/37/24"]);
});

test("a failed read is not kept: the next reader fetches again", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const failing = () => ({ getZxy: () => Promise.reject(new Error("Failed to fetch")) });
  const { siteTile, reads } = loadSiteTiles([failing(), failing(), { getZxy: async () => ({ data: tileBytes() }) }]);
  const first = siteTile("kareler-guncel", 7, 75, 48);
  await setImmediate();
  t.mock.timers.tick(1000);
  await assert.rejects(first, /Failed to fetch/);
  assert.equal((await siteTile("kareler-guncel", 7, 75, 48)).byteLength, 6);
  assert.deepEqual(reads, ["7/75/48", "7/75/48", "7/75/48"]);
});

/** siteArchive.ts with a stand-in PMTiles class that reads nothing. */
function loadArchives() {
  class TestArchive {}
  return loadLib("siteArchive", {
    stubs: { pmtiles: { PMTiles: TestArchive }, "./data": { archivePath: (name) => `/data/${name}.pmtiles` } },
    globals: { window: { location: { origin: "https://example.test" } } },
  });
}

test("an obsolete failure cannot invalidate the replacement archive", () => {
  const archiveModule = loadArchives();
  const old = archiveModule.siteArchive("kareler-guncel");
  archiveModule.invalidateSiteArchive(old);
  const replacement = archiveModule.siteArchive("kareler-guncel");
  archiveModule.invalidateSiteArchive(old);
  assert.equal(archiveModule.siteArchive("kareler-guncel"), replacement);
});

test("archives are opened once per name, and a failure replaces only its own", () => {
  const archiveModule = loadArchives();
  const borders = archiveModule.siteArchive("sinirlar");
  const cells = archiveModule.siteArchive("kareler-guncel");
  assert.notEqual(borders, cells);
  assert.equal(archiveModule.siteArchive("sinirlar"), borders);
  archiveModule.invalidateSiteArchive(cells);
  assert.equal(archiveModule.siteArchive("sinirlar"), borders);
  assert.notEqual(archiveModule.siteArchive("kareler-guncel"), cells);
});
