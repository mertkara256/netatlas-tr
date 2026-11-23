import assert from "node:assert/strict";
import test from "node:test";
import { loadLib } from "./load.mjs";

const { syncMaps } = loadLib("syncMaps");

/** A map with only what syncMaps uses: a view, move listeners, and jumpTo firing move at once as
 *  MapLibre does. `jumps` counts the jumps it was asked for. */
function fakeMap(view) {
  const listeners = new Set();
  const map = {
    view: { ...view },
    jumps: 0,
    getCenter: () => map.view.center,
    getZoom: () => map.view.zoom,
    getBearing: () => map.view.bearing,
    getPitch: () => map.view.pitch,
    on: (event, fn) => event === "move" && listeners.add(fn),
    off: (event, fn) => event === "move" && listeners.delete(fn),
    move: (change) => {
      Object.assign(map.view, change);
      for (const fn of [...listeners]) fn();
    },
    jumpTo: (next) => {
      map.jumps++;
      map.move(next);
    },
    listeners,
  };
  return map;
}

const start = { center: [35, 39], zoom: 5, bearing: 0, pitch: 0 };

test("the follower starts at the leader's view and each map then follows the other", () => {
  const lead = fakeMap(start);
  const follower = fakeMap({ center: [0, 0], zoom: 2, bearing: 0, pitch: 0 });
  syncMaps(lead, follower);
  assert.deepEqual(follower.view, start);

  lead.move({ zoom: 7 });
  assert.equal(follower.view.zoom, 7);
  follower.move({ center: [29, 41] });
  assert.deepEqual(lead.view.center, [29, 41]);
});

test("a move is passed on once, not bounced back", () => {
  const lead = fakeMap(start);
  const follower = fakeMap(start);
  syncMaps(lead, follower);
  const [leadJumps, followerJumps] = [lead.jumps, follower.jumps];
  lead.move({ zoom: 6 });
  assert.equal(follower.jumps - followerJumps, 1);
  assert.equal(lead.jumps - leadJumps, 0);
});

test("stopping removes both listeners", () => {
  const lead = fakeMap(start);
  const follower = fakeMap(start);
  const stop = syncMaps(lead, follower);
  stop();
  assert.equal(lead.listeners.size, 0);
  assert.equal(follower.listeners.size, 0);
  lead.move({ zoom: 9 });
  assert.equal(follower.view.zoom, 5);
});
