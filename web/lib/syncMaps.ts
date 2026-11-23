import type { Map as MapLibreMap } from "maplibre-gl";

/** Moves each map with the other, starting from `lead`'s view, until the returned function is called.
 *  Used for the two maps of a comparison, which lie one over the other. */
export function syncMaps(lead: MapLibreMap, follower: MapLibreMap): () => void {
  // jumpTo fires the follower's own move synchronously; this keeps it from moving the leader back.
  let moving = false;
  const follow = (from: MapLibreMap, to: MapLibreMap) => () => {
    if (moving) return;
    moving = true;
    to.jumpTo({ center: from.getCenter(), zoom: from.getZoom(), bearing: from.getBearing(), pitch: from.getPitch() });
    moving = false;
  };
  const toFollower = follow(lead, follower);
  const toLead = follow(follower, lead);
  toFollower();
  lead.on("move", toFollower);
  follower.on("move", toLead);
  return () => {
    lead.off("move", toFollower);
    follower.off("move", toLead);
  };
}
