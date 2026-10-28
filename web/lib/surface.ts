// The heat map's smooth surface. Each speed cell is a sample at its centre, and a pixel blends the
// four cells whose centres surround it, each by how near it is (bilinear): at a cell's centre the
// colour is that cell's own value, and on the way to a neighbour's centre it turns evenly into the
// neighbour's. The squares lose their hard edges without any cell borrowing its neighbours'
// values. Values are blended as logarithms, as the colour classes are.

/** Cells beyond the tile on each side that a pixel near its edge blends with. */
export const PAD = 1;

/** The cells of one tile on an n x n grid, with i and j from -PAD to n + PAD - 1. A NaN value is a cell without data. */
export type Cells = { i: ArrayLike<number>; j: ArrayLike<number>; value: ArrayLike<number>; low: ArrayLike<number> };

/** Per pixel, row by row: the blended log value, the blended share of few-test cells, and the share of the weight that has data (0-1). */
export type Surface = { value: Float32Array; low: Float32Array; coverage: Float32Array };

export function smoothSurface(n: number, size: number, cells: Cells): Surface {
  const width = n + 2 * PAD;
  const has = new Uint8Array(width * width);
  const value = new Float32Array(width * width);
  const low = new Float32Array(width * width);
  for (let c = 0; c < cells.value.length; c++) {
    const i = cells.i[c] + PAD;
    const j = cells.j[c] + PAD;
    if (Number.isNaN(cells.value[c]) || i < 0 || j < 0 || i >= width || j >= width) continue;
    const k = j * width + i;
    has[k] = 1;
    value[k] = cells.value[c];
    low[k] = cells.low[c];
  }

  // Along each axis: the cell just before each pixel and the weight of the one after it. Cell
  // centres sit on whole numbers, so the pair never leaves the padded grid.
  const first = new Int32Array(size);
  const next = new Float32Array(size);
  for (let p = 0; p < size; p++) {
    const u = ((p + 0.5) * n) / size - 0.5;
    first[p] = Math.floor(u) + PAD;
    next[p] = u - Math.floor(u);
  }

  const out: Surface = { value: new Float32Array(size * size), low: new Float32Array(size * size), coverage: new Float32Array(size * size) };
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let present = 0, sum = 0, lows = 0;
      for (let ky = 0; ky < 2; ky++) {
        const wy = ky ? next[py] : 1 - next[py];
        const row = (first[py] + ky) * width + first[px];
        for (let kx = 0; kx < 2; kx++) {
          const k = row + kx;
          if (!has[k]) continue;
          const w = wy * (kx ? next[px] : 1 - next[px]);
          present += w;
          sum += w * value[k];
          lows += w * low[k];
        }
      }
      const o = py * size + px;
      out.coverage[o] = present;
      out.value[o] = present ? sum / present : NaN;
      out.low[o] = present ? lows / present : 0;
    }
  }
  return out;
}

/**
 * Where a log value sits along the legend, from 0 to breaks + 1: class i spans [i, i + 1], with the
 * value placed log-linearly between its breaks. The open-ended classes take their neighbour's width.
 */
export function classPosition(logValue: number, logBreaks: number[]): number {
  const k = logBreaks.length;
  const edges = [2 * logBreaks[0] - logBreaks[1], ...logBreaks, 2 * logBreaks[k - 1] - logBreaks[k - 2]];
  if (!(logValue > edges[0])) return 0;
  if (logValue >= edges[k + 1]) return k + 1;
  let i = 0;
  while (logValue >= edges[i + 1]) i++;
  return i + (logValue - edges[i]) / (edges[i + 1] - edges[i]);
}
