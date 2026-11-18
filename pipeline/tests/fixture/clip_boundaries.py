"""Cut the sample's district shapes out of the full boundaries (run `python -m pipeline.boundaries` first).

    uv run python -m pipeline.tests.fixture.clip_boundaries

Each window is a block of whole zoom-16 tiles, so every tile inside it has the same land share as
in the full data. Only the codes are kept: build.py reads the names from data/processed/ilceler.csv.
"""
from __future__ import annotations

import json
from pathlib import Path

import shapely

from pipeline.boundaries import DISTRICTS_PATH
from pipeline.common import tile_bounds

OUT_PATH = Path(__file__).with_name("ilceler.geojson")
# (x_min, x_max, y_min, y_max) of zoom-16 tiles.
WINDOWS = {
    "Moda, Kadıköy: coast": (38050, 38053, 24572, 24576),
    "Nusaybin and Qamishli: the Syrian border": (40268, 40273, 25492, 25499),
    "Serdivan, Adapazarı and İzmit: a province border": (38271, 38275, 24604, 24608),
}


def main() -> None:
    features = json.loads(DISTRICTS_PATH.read_text(encoding="utf-8"))["features"]
    shapes = [shapely.geometry.shape(f["geometry"]) for f in features]
    tree = shapely.STRtree(shapes)
    pieces = []
    for x0, x1, y0, y1 in WINDOWS.values():
        west, _, _, north = tile_bounds(x0, y0, 16)
        _, south, east, _ = tile_bounds(x1, y1, 16)
        window = shapely.box(west, south, east, north)
        for i in sorted(tree.query(window, predicate="intersects")):
            piece = shapes[i].intersection(window)
            if piece.area > 0:
                p = features[i]["properties"]
                pieces.append({"type": "Feature", "properties": {"ilce_kodu": p["ilce_kodu"], "il_kodu": p["il_kodu"]},
                               "geometry": shapely.geometry.mapping(piece)})
    # One feature per line, so a change shows up as a readable diff.
    lines = [json.dumps(f, ensure_ascii=False, separators=(",", ":")) for f in pieces]
    OUT_PATH.write_text('{"type":"FeatureCollection","features":[\n' + ",\n".join(lines) + "\n]}\n", encoding="utf-8")
    print(f"{len(pieces)} district pieces -> {OUT_PATH.name} ({OUT_PATH.stat().st_size / 1000:.0f} KB)")


if __name__ == "__main__":
    main()
