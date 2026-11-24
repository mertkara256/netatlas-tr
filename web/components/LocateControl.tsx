"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useControl } from "react-map-gl/maplibre";

/** The "Konumum" button, under the zoom buttons: a control of the map's own, drawn by React into the
 *  box MapLibre gives it, with a short note beside it when the reader's position cannot be shown. */
export default function LocateControl({ busy, note, onLocate }: { busy: boolean; note: string | null; onLocate: () => void }) {
  // Created once; the map is only drawn in the browser.
  const [box] = useState(() => {
    const div = document.createElement("div");
    div.className = "maplibregl-ctrl locate";
    return div;
  });
  useControl(() => ({ onAdd: () => box, onRemove: () => box.remove() }), { position: "top-right" });
  return createPortal(
    <>
      <div className="maplibregl-ctrl-group">
        <button
          type="button"
          className="locate-button"
          aria-label="Konumuma git"
          title="Konumuma git"
          aria-busy={busy}
          disabled={busy}
          onClick={onLocate}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="7" />
            <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        </button>
      </div>
      {/* Always there, so screen readers hear a note when it appears; drawn only with one. */}
      <p className="locate-note" role="status">{note}</p>
    </>,
    box,
  );
}
