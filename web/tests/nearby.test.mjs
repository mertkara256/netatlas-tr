import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { PbfWriter } from "pbf";
import { loadLib } from "./load.mjs";

// The query runs on real vector tiles, written here with Ookla's squares at level 16 as tippecanoe
// stores them in a zoom 12 tile: 16 x 16 squares of 256 units in a 4096-unit extent.
const TILE_ZOOM = 12;
const SQUARE_LEVEL = 16;
const PER_TILE = 2 ** (SQUARE_LEVEL - TILE_ZOOM);
const UNITS = 4096 / PER_TILE;

const zigzag = (n) => (n << 1) ^ (n >> 31);

/** A Mapbox vector tile with one "hucreler" layer of squares: [{ x, y, properties }], x and y in units. */
function encodeTile(squares) {
  const keys = [], values = [];
  const index = (list, value) => {
    if (!list.includes(value)) list.push(value);
    return list.indexOf(value);
  };
  const pbf = new PbfWriter();
  pbf.writeMessage(3, (_, layer) => {
    layer.writeVarintField(15, 2);
    layer.writeStringField(1, "hucreler");
    for (const { x, y, properties } of squares) {
      layer.writeMessage(2, (_, feature) => {
        feature.writePackedVarint(2, Object.entries(properties).flatMap(([k, v]) => [index(keys, k), index(values, v)]));
        feature.writeVarintField(3, 3); // polygon
        feature.writePackedVarint(4, [9, zigzag(x), zigzag(y), 26, zigzag(UNITS), 0, 0, zigzag(UNITS), zigzag(-UNITS), 0, 15]);
      });
    }
    for (const key of keys) layer.writeStringField(3, key);
    for (const value of values) layer.writeMessage(4, (_, v) => v.writeDoubleField(3, value));
    layer.writeVarintField(5, 4096);
  });
  const bytes = pbf.finish();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/** The level-16 square holding a point, as global column and row. */
function squareAt(lon, lat) {
  const n = 2 ** SQUARE_LEVEL;
  const r = (lat * Math.PI) / 180;
  return [Math.floor(((lon + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)];
}

/** The centre of a level-16 square in degrees. */
function centreOf([column, row]) {
  const n = 2 ** SQUARE_LEVEL;
  return [((column + 0.5) / n) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * (row + 0.5)) / n))) * 180) / Math.PI];
}

/** Zoom 12 tiles keyed "x/y", holding the given squares. A square listed with `buffer` is also repeated
 *  just outside the edge of the tile to its east, as tippecanoe's buffer does. */
function tilesWith(squares) {
  const tiles = new Map();
  const put = (tx, ty, x, y, properties) => {
    const key = `${tx}/${ty}`;
    if (!tiles.has(key)) tiles.set(key, []);
    tiles.get(key).push({ x, y, properties });
  };
  for (const { square: [column, row], properties, buffer } of squares) {
    const [tx, ty] = [Math.floor(column / PER_TILE), Math.floor(row / PER_TILE)];
    const [x, y] = [(column % PER_TILE) * UNITS, (row % PER_TILE) * UNITS];
    put(tx, ty, x, y, properties);
    if (buffer) put(tx + 1, ty, x - 4096, y, properties);
  }
  return new Map([...tiles].map(([key, squares]) => [key, encodeTile(squares)]));
}

/** nearby.ts with siteTile() reading from `tiles`; `reads` lists what was asked for. */
function loadNearby(tiles, { read = async (key) => tiles.get(key) } = {}) {
  const reads = [];
  const siteTile = (name, z, x, y) => {
    reads.push(`${name}/${z}/${x}/${y}`);
    return read(`${x}/${y}`);
  };
  return { ...loadLib("nearby", { stubs: { "./siteTiles": { siteTile } } }), reads };
}

const square = (t, c, d, extra = {}) => ({ seviye: SQUARE_LEVEL, tguncel: t, cguncel: c, dguncel: d, uguncel: d / 5, lguncel: 10, ...extra });

// Kadıköy. A level-16 square here is ~360 m wide east to west.
const LON = 29.03, LAT = 40.99;
const HERE = squareAt(LON, LAT);
const [CLON, CLAT] = centreOf(HERE);
const east = (columns) => [HERE[0] + columns, HERE[1]];

test("distance is the great-circle distance in metres", () => {
  const { distance } = loadNearby(new Map());
  assert.equal(distance(LON, LAT, LON, LAT), 0);
  // One degree of latitude on a sphere of the mean Earth radius.
  assert.ok(Math.abs(distance(29, 40, 29, 41) - 111195) < 1);
  assert.equal(distance(29, 40, 30, 41), distance(30, 41, 29, 40));
  // A degree of longitude shrinks with the cosine of the latitude.
  assert.ok(Math.abs(distance(0, 60, 1, 60) / distance(0, 0, 1, 0) - 0.5) < 0.001);
});

test("only squares whose centres lie within the radius count", async () => {
  const { nearby, distance } = loadNearby(tilesWith([
    { square: HERE, properties: square(10, 2, 100) },
    { square: east(2), properties: square(10, 2, 50) },
    { square: east(3), properties: square(500, 50, 1) },
  ]));
  // Two squares east is inside 1 km of this square's centre, three is outside.
  assert.ok(distance(CLON, CLAT, ...centreOf(east(2))) < 1000);
  assert.ok(distance(CLON, CLAT, ...centreOf(east(3))) > 1000);
  assert.deepEqual(await nearby("kareler-guncel", CLON, CLAT, "guncel"),
    { squares: 2, tests: 20, download: 75, upload: 15, latency: 10 });
});

test("squares average weighted by devices, as the map's cells and the areas are", async () => {
  // 100 tests from 1 device at 10 Mbps and 10 tests from 9 devices at 100 Mbps: 91 Mbps (18.2 by tests).
  const { nearby } = loadNearby(tilesWith([
    { square: HERE, properties: square(100, 1, 10, { lguncel: 40 }) },
    { square: east(1), properties: square(10, 9, 100, { lguncel: 10 }) },
  ]));
  const result = await nearby("kareler-guncel", CLON, CLAT, "guncel");
  assert.equal(result.squares, 2);
  assert.equal(result.tests, 110);
  assert.equal(result.download, 91);
  assert.equal(result.upload, 18.2);
  assert.equal(result.latency, 13);
});

test("a square repeated in the next tile's buffer counts once", async () => {
  // A square in the easternmost column of its tile, with the point on the tile's eastern edge, so the
  // query reads both tiles and finds the square in each.
  const edge = [Math.floor(HERE[0] / PER_TILE) * PER_TILE + PER_TILE - 1, HERE[1]];
  const tiles = tilesWith([{ square: edge, properties: square(30, 3, 60), buffer: true }]);
  const [edgeLon, edgeLat] = centreOf([edge[0] + 0.5, edge[1]]);
  const { nearby, reads } = loadNearby(tiles);
  assert.deepEqual(await nearby("kareler-guncel", edgeLon, edgeLat, "guncel"),
    { squares: 1, tests: 30, download: 60, upload: 12, latency: 10 });
  const tx = Math.floor(edge[0] / PER_TILE);
  assert.ok(reads.some((r) => r.endsWith(`/${tx}/${Math.floor(edge[1] / PER_TILE)}`)));
  assert.ok(reads.some((r) => r.endsWith(`/${tx + 1}/${Math.floor(edge[1] / PER_TILE)}`)));
});

test("other levels and other periods are left out; no squares gives null", async () => {
  const { nearby } = loadNearby(tilesWith([
    { square: HERE, properties: { seviye: 15, tguncel: 10, cguncel: 1, dguncel: 1, uguncel: 1, lguncel: 1 } },
    { square: east(1), properties: { seviye: SQUARE_LEVEL, t2019: 10, c2019: 1, d2019: 1, u2019: 1, l2019: 1 } },
  ]));
  assert.equal(await nearby("kareler-guncel", CLON, CLAT, "guncel"), null);
  assert.equal((await nearby("kareler-2019", CLON, CLAT, "2019")).squares, 1);
});

test("the tiles around the point are asked for together, from the archive named", async () => {
  const pending = [];
  const { nearby, reads } = loadNearby(new Map(), {
    read: () => new Promise((resolve) => pending.push(resolve)),
  });
  // A point on the corner of four tiles.
  const corner = centreOf([Math.floor(HERE[0] / PER_TILE) * PER_TILE - 0.5, Math.floor(HERE[1] / PER_TILE) * PER_TILE - 0.5]);
  const result = nearby("kareler-2024", ...corner, "2024");
  await setImmediate();
  assert.equal(reads.length, 4);
  assert.equal(pending.length, 4, "every tile is requested before any has arrived");
  assert.ok(reads.every((r) => r.startsWith(`kareler-2024/${TILE_ZOOM}/`)));
  for (const resolve of pending) resolve(undefined);
  assert.equal(await result, null);
});
