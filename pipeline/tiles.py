"""Map tiles, province and district JSON and the search index for the web app.

The speed layer is a heat map at every zoom: each cell is a Web Mercator tile at some level,
from Ookla's own 475 m squares (level 16) up close to ~30 km cells (level 10) when zoomed out,
pooled from the squares inside it with test weights. Each level is shown at the map zooms where
its cells are 8-16 px wide. A cell is drawn only where it holds measured squares (see footprint()),
so it is one feature per period: its shape changes as squares are measured or not.

    uv run python -m pipeline.tiles      (needs tippecanoe)

Outputs (web/public/data/, not in git):
    harita.pmtiles   layers "hucreler" (speed cells, one feature per period), "ilceler" and "iller" (shapes)
    iller.json       periods, Ookla's access date and quarters (for its attribution), then Türkiye
                     and the 81 provinces: speeds per period, BTK per year
    ilceler.json     the 973 districts: speeds per period
    arama.json       province and district names for search, with bounding boxes
"""
from __future__ import annotations

import csv
import json
import subprocess
import tempfile
from datetime import date
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq
import shapely

from .boundaries import DISTRICTS_PATH, PROVINCES_PATH
from .btk import OUT_PATH as BTK_PATH
from .build import DISTRICT_PATH, PROVINCE_PATH, TILES_PATH, available_quarters, periods
from .common import ROOT, normalize_name, quadkey_to_tile
from .ookla import output_path

OUT_DIR = ROOT / "web" / "public" / "data"
PMTILES_PATH = OUT_DIR / "harita.pmtiles"
LEVELS = range(10, 17)
MAX_ZOOM = 12  # level-16 squares are 256 units wide in a 4096-unit tile here; the map overzooms beyond
# A cell is drawn as the tiles this many levels below it that hold a measured square: shown at its
# zoom, those parts are 1-2 px, the finest a screen draws. Filling the whole cell painted 37 times
# the measured area at level 10 and 21 times at level 12, because most of Türkiye's land has no
# measured square (docs/YOL-HARITASI.md, "Hücrelerin çizimi").
FOOTPRINT_DEPTH = 3
SQUARE_LEVEL = 16
SPEED_COLUMNS = ["kare", "test", "indirme_mbps", "yukleme_mbps", "gecikme_ms", "guvenilirlik"]


def tile_zooms(level: int) -> tuple[int, int]:
    """Tile zooms that show a level: a level-L cell is 8-16 px wide at map zoom L-6 (512 px tiles)."""
    zoom = level - 6
    return (0 if level == LEVELS[0] else zoom), (MAX_ZOOM if level == LEVELS[-1] else zoom)


def period_label(period: str, quarters: list[tuple[int, int]]) -> str:
    (y0, q0), (y1, q1) = quarters[0], quarters[-1]
    return f"{y0} Ç{q0} – Ç{q1}" if y0 == y1 else f"{y0} Ç{q0} – {y1} Ç{q1}"


def footprint(parts: list[str]) -> dict:
    """The tiles named by quadkeys of one level, merged into one GeoJSON shape in degrees."""
    level = len(parts[0])
    xy = np.array([quadkey_to_tile(q)[:2] for q in parts], dtype=float)
    boxes = shapely.box(xy[:, 0], xy[:, 1], xy[:, 0] + 1, xy[:, 1] + 1)
    shape = boxes[0] if len(boxes) == 1 else shapely.coverage_union_all(boxes)
    n = 2 ** level

    def to_degrees(points: np.ndarray) -> np.ndarray:
        lon = points[:, 0] / n * 360.0 - 180.0
        lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * points[:, 1] / n))))
        return np.column_stack([lon, lat])

    return shapely.geometry.mapping(shapely.transform(shape, to_degrees))


def cell_features(tiles: pa.Table) -> list[dict]:
    """One GeoJSON feature per cell and period at every level, carrying d/u/l/t (download, upload,
    latency, tests) for that period, in the shape of the cell's measured parts (footprint())."""
    tests = pc.cast(tiles["test"], pa.float64())
    sums = pa.table({
        "donem": tiles["donem"],
        "quadkey": tiles["quadkey"],
        "t": tests,
        "d": pc.multiply(tiles["indirme_mbps"], tests),
        "u": pc.multiply(tiles["yukleme_mbps"], tests),
        "l": pc.multiply(tiles["gecikme_ms"], tests),
    })
    features = []
    for level in LEVELS:
        part_level = min(level + FOOTPRINT_DEPTH, SQUARE_LEVEL)
        grouped = (sums.append_column("hucre", pc.utf8_slice_codeunits(sums["quadkey"], 0, level))
                   .append_column("parca", pc.utf8_slice_codeunits(sums["quadkey"], 0, part_level))
                   .group_by(["hucre", "donem"]).aggregate([(c, "sum") for c in "tdul"] + [("parca", "distinct")]))
        minzoom, maxzoom = tile_zooms(level)
        for period, t, d, u, lat, parts in zip(*(grouped[c].to_pylist() for c in
                                                ["donem", "t_sum", "d_sum", "u_sum", "l_sum", "parca_distinct"]), strict=True):
            features.append({
                "type": "Feature",
                "tippecanoe": {"minzoom": minzoom, "maxzoom": maxzoom},
                "properties": {"seviye": level, f"d{period}": round(d / t, 1), f"u{period}": round(u / t, 1),
                               f"l{period}": round(lat / t), f"t{period}": int(t)},
                "geometry": footprint(parts),
            })
        print(f"  level {level}: {grouped.num_rows:,} cells over all periods, drawn as level {part_level} parts, "
              f"tile zoom {minzoom}-{maxzoom}")
    return features


def build_pmtiles(features: list[dict]) -> None:
    # tippecanoe writes its command line into the archive, which is published, so it runs from
    # the repo root with relative paths and no local folder name ends up in the file.
    with tempfile.TemporaryDirectory(dir=OUT_DIR) as tmp:
        cells_path = Path(tmp) / "hucreler.geojsonl"
        with cells_path.open("w", encoding="utf-8") as f:
            for feature in features:
                f.write(json.dumps(feature, separators=(",", ":")) + "\n")
        subprocess.run([
            "tippecanoe", "--output", str(PMTILES_PATH.relative_to(ROOT)), "--force", "--quiet",
            "--name", "NetAtlas TR", "--description", "Ookla fixed-broadband speed cells, districts and provinces",
            "--minimum-zoom=0", f"--maximum-zoom={MAX_ZOOM}",
            # Every cell and shape must survive at every zoom it is meant for.
            "--no-feature-limit", "--no-tile-size-limit", "--no-tiny-polygon-reduction",
            "--detect-shared-borders",
            "--named-layer", f"hucreler:{cells_path.relative_to(ROOT)}",
            "--named-layer", f"ilceler:{DISTRICTS_PATH.relative_to(ROOT)}",
            "--named-layer", f"iller:{PROVINCES_PATH.relative_to(ROOT)}",
        ], check=True, cwd=ROOT)


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def speed_values(row: dict) -> dict:
    return {"kare": int(row["kare"]), "test": int(row["test"]), "indirme_mbps": float(row["indirme_mbps"]),
            "yukleme_mbps": float(row["yukleme_mbps"]), "gecikme_ms": float(row["gecikme_ms"]),
            "guvenilirlik": row["guvenilirlik"], "tek_kare_payi": float(row["tek_kare_payi"]),
            "olculen_nufus_payi": float(row["olculen_nufus_payi"])}


def btk_values(row: dict) -> dict:
    population, fixed = float(row["nufus"]), float(row["sabit_genisbant"])
    return {"nufus": int(population), "sabit_genisbant": round(fixed),
            "abone_100": round(fixed / population * 100, 2), "fiber_payi": round(float(row["fiber"]) / fixed, 3)}


def ookla_source(quarters: list[tuple[int, int]]) -> dict:
    """What Ookla's suggested attribution asks for: when the data was accessed (the latest
    download) and which quarters it covers."""
    accessed = max(output_path(*q).stat().st_mtime for q in quarters)
    return {"erisim": date.fromtimestamp(accessed).isoformat(), "ilk": list(quarters[0]), "son": list(quarters[-1])}


def write_json(name: str, data) -> None:
    (OUT_DIR / name).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def search_index() -> list[dict]:
    entries = []
    for path, kind in [(PROVINCES_PATH, "il"), (DISTRICTS_PATH, "ilce")]:
        for f in json.loads(path.read_text(encoding="utf-8"))["features"]:
            p = f["properties"]
            name = p["il"] if kind == "il" else p["ilce"]
            entry = {"tur": kind, "kod": p["il_kodu"] if kind == "il" else p["ilce_kodu"], "ad": name}
            if kind == "ilce":
                entry["il"] = p["il"]
            entry["ara"] = normalize_name(name)
            entry["bbox"] = [round(v, 4) for v in shapely.geometry.shape(f["geometry"]).bounds]
            entries.append(entry)
    return entries


def main() -> None:
    quarters = available_quarters()
    period_quarters = periods(quarters)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("speed cells")
    build_pmtiles(cell_features(pq.read_table(TILES_PATH)))

    provinces: dict[str, dict] = {}
    for row in read_csv(PROVINCE_PATH):
        provinces.setdefault(row["il_kodu"], {"ad": row["il"], "hiz": {}, "btk": {}})["hiz"][row["donem"]] = speed_values(row)
    btk_years = set()
    for row in read_csv(BTK_PATH):
        provinces[row["il_kodu"]]["btk"][row["yil"]] = btk_values(row)
        btk_years.add(int(row["yil"]))
    write_json("iller.json", {
        "donemler": [{"id": p, "ad": "Güncel" if p == "guncel" else p, "aralik": period_label(p, q)}
                     for p, q in period_quarters.items()],
        "btk_yillari": sorted(btk_years),
        "ookla": ookla_source(quarters),
        "iller": provinces,
    })

    districts: dict[str, dict] = {}
    for row in read_csv(DISTRICT_PATH):
        district = districts.setdefault(row["ilce_kodu"], {"ad": row["ilce"], "il_kodu": row["il_kodu"], "hiz": {}})
        district["hiz"][row["donem"]] = speed_values(row)
    # Districts without a single measurement still need an entry for the panel and search.
    for f in json.loads(DISTRICTS_PATH.read_text(encoding="utf-8"))["features"]:
        p = f["properties"]
        districts.setdefault(p["ilce_kodu"], {"ad": p["ilce"], "il_kodu": p["il_kodu"], "hiz": {}})
    write_json("ilceler.json", dict(sorted(districts.items())))
    write_json("arama.json", search_index())

    for name in ["harita.pmtiles", "iller.json", "ilceler.json", "arama.json"]:
        print(f"  web/public/data/{name}: {(OUT_DIR / name).stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
