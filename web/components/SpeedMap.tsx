"use client";

import dynamic from "next/dynamic";

// MapLibre needs the browser, so the map is left out of the prerendered HTML.
const SpeedMap = dynamic(() => import("./MapView"), { ssr: false });

export default SpeedMap;
