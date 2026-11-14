import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { loadLib } from "./load.mjs";

/** siteTiles.ts with the real retry module and a stand-in for the archive, which counts its reads. */
function loadSiteTiles(archives) {
  const reads = [];
  let opened = 0;
  const stubs = {
    "./nearby": {
      siteArchive: () => archives[Math.min(opened++, archives.length - 1)],
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
  return { ...loadLib("siteTiles", { stubs }), reads };
}

const tileBytes = () => new Uint8Array([26, 4, 1, 2, 3, 4]).buffer;

test("a tile asked for twice is read once", async () => {
  const { siteTile, vectorTile, reads } = loadSiteTiles([{ getZxy: async () => ({ data: tileBytes() }) }]);
  const [vector, kept] = await Promise.all([
    vectorTile({ url: "harita://6/37/24" }, new AbortController()),
    siteTile(6, 37, 24),
  ]);
  assert.deepEqual(reads, ["6/37/24"]);
  assert.deepEqual(new Uint8Array(vector.data), new Uint8Array(kept));
});

test("MapLibre gets a copy, so moving it to its worker leaves the kept tile whole", async () => {
  const { siteTile, vectorTile } = loadSiteTiles([{ getZxy: async () => ({ data: tileBytes() }) }]);
  const { data } = await vectorTile({ url: "harita://6/37/24" }, new AbortController());
  structuredClone(data, { transfer: [data] }); // what postMessage does with it
  assert.equal(data.byteLength, 0);
  assert.equal((await siteTile(6, 37, 24)).byteLength, 6);
});

test("a place without a tile gives the vector source an empty one", async () => {
  const { vectorTile } = loadSiteTiles([{ getZxy: async () => undefined }]);
  assert.equal((await vectorTile({ url: "harita://3/0/0" }, new AbortController())).data.byteLength, 0);
});

test("a failed read is not kept: the next reader fetches again", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const failing = () => ({ getZxy: () => Promise.reject(new Error("Failed to fetch")) });
  const { siteTile, reads } = loadSiteTiles([failing(), failing(), { getZxy: async () => ({ data: tileBytes() }) }]);
  const first = siteTile(7, 75, 48);
  await setImmediate();
  t.mock.timers.tick(1000);
  await assert.rejects(first, /Failed to fetch/);
  assert.equal((await siteTile(7, 75, 48)).byteLength, 6);
  assert.deepEqual(reads, ["7/75/48", "7/75/48", "7/75/48"]);
});
