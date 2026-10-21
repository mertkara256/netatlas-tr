"use client";

import { useState } from "react";
import {
  addProtocol,
  setWorkerUrl,
  type ExpressionSpecification,
  type Map as MapLibreMap,
  type MapLibreEvent,
} from "maplibre-gl";
import { Protocol } from "pmtiles";
import Map, { Layer, NavigationControl, Source } from "react-map-gl/maplibre";
import { PMTILES_PATH, type Period } from "@/lib/data";

// Copied into public/ by scripts/copy-maplibre-worker.mjs before dev and build.
setWorkerUrl("/maplibre-gl-worker.mjs");
// Lets MapLibre read vector tiles straight out of the single PMTiles file with range requests.
addProtocol("pmtiles", new Protocol().tile);

// OpenFreeMap: free vector basemap, no API key.
const BASEMAP = "https://tiles.openfreemap.org/styles/positron";
const TURKEY_BOUNDS: [number, number, number, number] = [25.6, 35.8, 44.9, 42.2];
const BREAKS = [15, 30, 60, 120]; // Mbps

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function downloadColor(period: Period): ExpressionSpecification {
  const ramp = [1, 2, 3, 4, 5].map((i) => cssVar(`--seq-${i}`));
  const steps = BREAKS.flatMap((b, i) => [b, ramp[i + 1]]);
  return ["step", ["get", `d${period}`], ramp[0], ...steps];
}

// Our layers go above the basemap's fills and roads but below its final run of labels.
function firstLabelLayer(map: MapLibreMap): string | undefined {
  const layers = map.getStyle().layers;
  let first = layers.length;
  while (first > 0 && layers[first - 1].type === "symbol") first--;
  return layers[first]?.id;
}

export default function MapView({ period }: { period: Period }) {
  const [beforeId, setBeforeId] = useState<string | null>(null);

  return (
    <Map
      initialViewState={{ bounds: TURKEY_BOUNDS, fitBoundsOptions: { padding: 12 } }}
      mapStyle={BASEMAP}
      minZoom={3}
      maxZoom={15}
      dragRotate={false}
      touchPitch={false}
      attributionControl={{ compact: true, customAttribution: "Speedtest® by Ookla® Open Data · OCHA COD-AB" }}
      onLoad={(e: MapLibreEvent) => setBeforeId(firstLabelLayer(e.target) ?? "")}
      style={{ position: "absolute", inset: 0 }}
    >
      <NavigationControl showCompass={false} />
      {beforeId !== null && (
        <Source id="harita" type="vector" url={`pmtiles://${window.location.origin}${PMTILES_PATH}`}>
          <Layer
            id="cells"
            type="fill"
            source-layer="hucreler"
            filter={["has", `t${period}`]}
            paint={{ "fill-color": downloadColor(period), "fill-opacity": 0.9 }}
            beforeId={beforeId || undefined}
          />
          <Layer
            id="province-line"
            type="line"
            source-layer="iller"
            paint={{
              "line-color": cssVar("--province"),
              "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 10, 1.6],
            }}
            beforeId={beforeId || undefined}
          />
        </Source>
      )}
    </Map>
  );
}
