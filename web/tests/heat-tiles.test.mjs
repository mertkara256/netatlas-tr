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

/** heatTiles.ts with the real colour, metric and surface modules, and a stand-in for the archive. */
function loadHeatTiles(archives) {
  const opened = [];
  const invalidated = [];
  const stubs = {
    "./nearby": {
      siteArchive: () => {
        opened.push(archives[opened.length]);
        return opened.at(-1);
      },
      invalidateSiteArchive: (archive) => invalidated.push(archive),
    },
    // Not reached: no test tile has data to decode.
    "@mapbox/vector-tile": { VectorTile: class {} },
    pbf: { PbfReader: class {} },
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
  return { heatTile: load("heatTiles").heatTile, opened, invalidated };
}

const request = { url: "isi://guncel/indirme/light/6/37/24" };
const notByteServing = () => Promise.reject(new Error("Server returned no content-length header or content-length exceeding request."));

test("a tile read that fails once is tried again with a fresh archive", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const archives = [{ getZxy: notByteServing }, { getZxy: async () => undefined }];
  const { heatTile, opened, invalidated } = loadHeatTiles(archives);
  const response = heatTile(request, new AbortController());
  await setImmediate();
  assert.equal(opened.length, 1, "no second try before the pause");
  t.mock.timers.tick(1000);
  // No tile at that place: a transparent answer, not an error.
  assert.equal((await response).data.byteLength, 0);
  assert.deepEqual(opened, archives);
  assert.deepEqual(invalidated, [archives[0]]);
});

test("a tile read that fails twice counts as failed", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const second = new Error("still failing");
  const archives = [{ getZxy: notByteServing }, { getZxy: () => Promise.reject(second) }];
  const { heatTile, opened, invalidated } = loadHeatTiles(archives);
  const response = heatTile(request, new AbortController());
  await setImmediate();
  t.mock.timers.tick(1000);
  await assert.rejects(response, second);
  assert.equal(opened.length, 2);
  assert.deepEqual(invalidated, archives);
});
