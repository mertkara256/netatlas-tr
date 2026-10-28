import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const lib = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "lib");

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
  const modules = new Map();
  const load = (name) => {
    if (modules.has(name)) return modules.get(name).exports;
    const compiled = { exports: {} };
    modules.set(name, compiled);
    const { outputText } = ts.transpileModule(readFileSync(path.join(lib, `${name}.ts`), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const localRequire = (specifier) => stubs[specifier] ?? (specifier.startsWith("./") ? load(specifier.slice(2)) : require(specifier));
    new Function("require", "module", "exports", outputText)(localRequire, compiled, compiled.exports);
    return compiled.exports;
  };
  for (const archive of archives) {
    const getZxy = archive.getZxy;
    archive.getZxy = (...zxy) => {
      reads.push(zxy.join("/"));
      return getZxy(...zxy);
    };
  }
  return { ...load("siteTiles"), reads };
}

const tileBytes = () => new Uint8Array([26, 4, 1, 2, 3, 4]).buffer;

test("the vector source and the heat map read a tile once between them", async () => {
  const { siteTile, vectorTile, reads } = loadSiteTiles([{ getZxy: async () => ({ data: tileBytes() }) }]);
  const [vector, heat] = await Promise.all([
    vectorTile({ url: "harita://6/37/24" }, new AbortController()),
    siteTile(6, 37, 24),
  ]);
  assert.deepEqual(reads, ["6/37/24"]);
  assert.deepEqual(new Uint8Array(vector.data), new Uint8Array(heat));
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
