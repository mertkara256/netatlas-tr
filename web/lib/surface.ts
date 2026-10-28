// The heat map's smooth surface. Each speed cell is a sample at its centre, and every pixel takes
// a Gaussian-weighted mean of the cells around it, so neighbouring cells blend instead of meeting
// at hard square edges. Values are averaged as logarithms, as the colour classes are.

/** Spread of the colour blend, in cells. */
const VALUE_SIGMA = 0.8;
/** Spread of the coverage that decides where the surface ends: narrower, so the edge stays at the cells' own edge and gaps stay open. */
const EDGE_SIGMA = 0.5;
/** Cells beyond the tile on each side that can still reach its pixels. */
export const PAD = 3;
const TAPS = 2 * PAD;

/** The cells of one tile on an n x n grid, with i and j from -PAD to n + PAD - 1. A NaN value is a cell without data. */
export type Cells = { i: ArrayLike<number>; j: ArrayLike<number>; value: ArrayLike<number>; low: ArrayLike<number> };

/** Per pixel, row by row: the blended log value, the blended share of few-test cells, and the share of the nearby weight that has data (0-1). */
export type Surface = { value: Float32Array; low: Float32Array; coverage: Float32Array };

const gauss = (d: number, sigma: number) => Math.exp(-(d * d) / (2 * sigma * sigma));

export function smoothSurface(n: number, size: number, cells: Cells): Surface {
  const width = n + 2 * PAD;
  const has = new Float32Array(width * width);
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

  // Along each axis: the first of the TAPS cells around each pixel (cell centres sit on whole
  // numbers, so they never leave the padded grid) and their weights for both spreads.
  const first = new Int32Array(size);
  const blend = new Float32Array(size * TAPS);
  const edge = new Float32Array(size * TAPS);
  const edgeTotal = new Float32Array(size);
  for (let p = 0; p < size; p++) {
    const u = ((p + 0.5) * n) / size - 0.5;
    first[p] = Math.floor(u) + 1;
    for (let k = 0; k < TAPS; k++) {
      const d = first[p] - PAD + k - u;
      blend[p * TAPS + k] = gauss(d, VALUE_SIGMA);
      edge[p * TAPS + k] = gauss(d, EDGE_SIGMA);
      edgeTotal[p] += edge[p * TAPS + k];
    }
  }

  // The weights factor into x and y, so the sums go along the rows first, then down the columns.
  const rowWeight = new Float32Array(width * size);
  const rowValue = new Float32Array(width * size);
  const rowLow = new Float32Array(width * size);
  const rowEdge = new Float32Array(width * size);
  for (let r = 0; r < width; r++) {
    for (let px = 0; px < size; px++) {
      let w = 0, v = 0, l = 0, e = 0;
      for (let k = 0; k < TAPS; k++) {
        const g = r * width + first[px] + k;
        if (!has[g]) continue;
        const b = blend[px * TAPS + k];
        w += b;
        v += b * value[g];
        l += b * low[g];
        e += edge[px * TAPS + k];
      }
      const o = r * size + px;
      rowWeight[o] = w;
      rowValue[o] = v;
      rowLow[o] = l;
      rowEdge[o] = e;
    }
  }

  const out: Surface = { value: new Float32Array(size * size), low: new Float32Array(size * size), coverage: new Float32Array(size * size) };
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let w = 0, v = 0, l = 0, e = 0;
      for (let k = 0; k < TAPS; k++) {
        const o = (first[py] + k) * size + px;
        const b = blend[py * TAPS + k];
        w += b * rowWeight[o];
        v += b * rowValue[o];
        l += b * rowLow[o];
        e += edge[py * TAPS + k] * rowEdge[o];
      }
      const o = py * size + px;
      out.coverage[o] = e / (edgeTotal[px] * edgeTotal[py]);
      out.value[o] = w ? v / w : NaN;
      out.low[o] = w ? l / w : 0;
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
