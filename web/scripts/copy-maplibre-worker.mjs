// MapLibre loads its web worker from a separate file that the bundler does not emit,
// so a copy is served from public/ and the map points at it with setWorkerUrl.
import { copyFileSync } from "node:fs";

copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre-gl-worker.mjs");
