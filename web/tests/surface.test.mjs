import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const { outputText } = ts.transpileModule(readFileSync(new URL("../lib/surface.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const surfaceModule = { exports: {} };
new Function("module", "exports", outputText)(surfaceModule, surfaceModule.exports);
const { PAD, classPosition, smoothSurface } = surfaceModule.exports;

/** Cells of a whole grid (a function of i, j; null for no data), as one tile of n x n sees them. */
function tileCells(grid, n, offsetI = 0, offsetJ = 0) {
  const cells = { i: [], j: [], value: [], low: [] };
  for (let j = -PAD; j < n + PAD; j++) {
    for (let i = -PAD; i < n + PAD; i++) {
      const cell = grid(i + offsetI, j + offsetJ);
      if (!cell) continue;
      cells.i.push(i);
      cells.j.push(j);
      cells.value.push(cell.value);
      cells.low.push(cell.low);
    }
  }
  return cells;
}

const close = (a, b) => Math.abs(a - b) < 1e-4 || (Number.isNaN(a) && Number.isNaN(b));

test("classes span equal stretches of the legend, log-scaled between their breaks", () => {
  const breaks = [10, 25, 50, 100, 200, 400].map(Math.log);
  assert.ok(close(classPosition(Math.log(10), breaks), 1));
  assert.ok(close(classPosition(Math.log(400), breaks), 6));
  assert.ok(close(classPosition(Math.log(Math.sqrt(100 * 200)), breaks), 4.5));
  assert.equal(classPosition(Math.log(0.01), breaks), 0);
  assert.equal(classPosition(Math.log(1e6), breaks), 7);
});

test("an even field stays even and fully covered", () => {
  const n = 8;
  const surface = smoothSurface(n, 32, tileCells(() => ({ value: 4.2, low: 0 }), n));
  for (let o = 0; o < 32 * 32; o++) {
    assert.ok(close(surface.value[o], 4.2), `pixel ${o}`);
    assert.ok(close(surface.coverage[o], 1), `pixel ${o}`);
  }
});

test("neighbouring tiles meet without a seam", () => {
  // A noisy field with gaps and few-test cells, drawn once across two tiles' width and once per tile.
  const n = 8, size = 32;
  const grid = (i, j) => {
    const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
    const r = h - Math.floor(h);
    return r < 0.2 ? null : { value: Math.log(5 + 400 * r), low: r < 0.35 ? 1 : 0 };
  };
  const wide = smoothSurface(2 * n, 2 * size, tileCells(grid, 2 * n));
  const left = smoothSurface(n, size, tileCells(grid, n));
  const right = smoothSurface(n, size, tileCells(grid, n, n, 0));
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < 2 * size; px++) {
      const tile = px < size ? left : right;
      const o = py * size + (px % size);
      const w = py * 2 * size + px;
      for (const key of ["value", "low", "coverage"]) {
        assert.ok(close(tile[key][o], wide[key][w]), `${key} at ${px},${py}: ${tile[key][o]} vs ${wide[key][w]}`);
      }
    }
  }
});

test("a lone cell shows and a missing cell among others stays open", () => {
  const n = 8, size = 64, px = size / n; // pixels per cell
  const centre = (i, j) => Math.floor((j + 0.5) * px) * size + Math.floor((i + 0.5) * px);
  const lone = smoothSurface(n, size, tileCells((i, j) => (i === 3 && j === 3 ? { value: 3, low: 0 } : null), n));
  assert.ok(lone.coverage[centre(3, 3)] > 0.55, `lone cell centre ${lone.coverage[centre(3, 3)]}`);
  assert.ok(lone.coverage[centre(5, 3)] < 0.3, `two cells away ${lone.coverage[centre(5, 3)]}`);

  const holed = smoothSurface(n, size, tileCells((i, j) => (i === 3 && j === 3 ? null : { value: 3, low: 0 }), n));
  assert.ok(holed.coverage[centre(3, 3)] < 0.45, `hole centre ${holed.coverage[centre(3, 3)]}`);
  // The edge between data and no data sits on the cells' own edge, between pixels 4px - 1 and 4px.
  const half = smoothSurface(n, size, tileCells((i) => (i < 4 ? { value: 3, low: 0 } : null), n));
  const [inside, outside] = [half.coverage[3 * size + 4 * px - 1], half.coverage[3 * size + 4 * px]];
  assert.ok(inside > 0.5 && outside < 0.5 && Math.abs((inside + outside) / 2 - 0.5) < 0.01, `${inside}, ${outside}`);
});
