"""Map tiles, province and district JSON and the search index for the web app.

The speed layer is a heat map at every zoom: each cell is a Web Mercator tile at some level,
from Ookla's own 475 m squares (level 16) up close to ~30 km cells (level 10) when zoomed out,
pooled from the squares inside it weighted by devices, as provinces and districts are (build.py), so
a cell that holds a whole district shows the district's value. Each level is shown at the map zooms where
its cells are 8-16 px wide. A cell is drawn only where it holds measured squares (see footprint()),
so it is one feature per period: its shape changes as squares are measured or not. Each period's
cells go in their own archive, so a view downloads only the period on screen.

    uv run python -m pipeline.tiles      (needs tippecanoe)

Outputs (web/public/data/, not in git):
    sinirlar.pmtiles          layers "ilceler" and "iller": district and province shapes
    kareler-<period>.pmtiles  layer "hucreler": one period's speed cells (kareler-2019 ... kareler-guncel)
    iller.json       periods, Ookla's access date and quarters (for its attribution), then Türkiye
                     and the 81 provinces: speeds per period, the same per settlement type, BTK per year
                     (with subscriptions per 100 households from TÜİK's average household size)
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
from .build import DISTRICT_PATH, PROVINCE_PATH, SETTLEMENT_PATH, TILES_PATH, available_quarters, periods
from .common import ROOT, normalize_name, quadkey_to_tile
from .ookla import output_path
from .tuik import OUT_PATH as HOUSEHOLD_PATH

OUT_DIR = ROOT / "web" / "public" / "data"
BORDERS_PATH = OUT_DIR / "sinirlar.pmtiles"
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
    latency, tests) for that period, in the shape of the cell's measured parts (footprint()). Speeds
    average the squares weighted by their devices. Ookla's own squares (level 16) also carry c, their
    devices, so the nearby query (web/lib/nearby.ts) can pool them the same way."""
    devices = pc.cast(tiles["cihaz"], pa.float64())
    sums = pa.table({
        "donem": tiles["donem"],
        "quadkey": tiles["quadkey"],
        "t": tiles["test"],
        "c": devices,
        "d": pc.multiply(tiles["indirme_mbps"], devices),
        "u": pc.multiply(tiles["yukleme_mbps"], devices),
        "l": pc.multiply(tiles["gecikme_ms"], devices),
    })
    features = []
    for level in LEVELS:
        part_level = min(level + FOOTPRINT_DEPTH, SQUARE_LEVEL)
        grouped = (sums.append_column("hucre", pc.utf8_slice_codeunits(sums["quadkey"], 0, level))
                   .append_column("parca", pc.utf8_slice_codeunits(sums["quadkey"], 0, part_level))
                   .group_by(["hucre", "donem"]).aggregate([(c, "sum") for c in "tcdul"] + [("parca", "distinct")]))
        minzoom, maxzoom = tile_zooms(level)
        for period, t, c, d, u, lat, parts in zip(*(grouped[col].to_pylist() for col in
                                                   ["donem", "t_sum", "c_sum", "d_sum", "u_sum", "l_sum", "parca_distinct"]),
                                                 strict=True):
            properties = {"seviye": level, f"d{period}": round(d / c, 1), f"u{period}": round(u / c, 1),
                          f"l{period}": round(lat / c), f"t{period}": t}
            if level == SQUARE_LEVEL:
                properties[f"c{period}"] = int(c)
            features.append({
                "type": "Feature",
                "tippecanoe": {"minzoom": minzoom, "maxzoom": maxzoom},
                "properties": properties,
                "geometry": footprint(parts),
            })
        print(f"  level {level}: {grouped.num_rows:,} cells over all periods, drawn as level {part_level} parts, "
              f"tile zoom {minzoom}-{maxzoom}")
    return features


def cells_path(period: str) -> Path:
    """One period's cells. Holding all eight in every tile made a zoomed-out view download 2-3 times
    the data, as each period's cells have their own shapes."""
    return OUT_DIR / f"kareler-{period}.pmtiles"


def build_pmtiles(path: Path, description: str, layers: dict[str, Path]) -> None:
    # tippecanoe writes its command line into the archive, which is published, so it runs from
    # the repo root with relative paths and no local folder name ends up in the file.
    subprocess.run([
        "tippecanoe", "--output", str(path.relative_to(ROOT)), "--force", "--quiet",
        "--name", "NetAtlas TR", "--description", description,
        "--minimum-zoom=0", f"--maximum-zoom={MAX_ZOOM}",
        # Every cell and shape must survive at every zoom it is meant for.
        "--no-feature-limit", "--no-tile-size-limit", "--no-tiny-polygon-reduction",
        "--detect-shared-borders",
        *(arg for name, source in layers.items() for arg in ["--named-layer", f"{name}:{source.relative_to(ROOT)}"]),
    ], check=True, cwd=ROOT)


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def speed_values(row: dict) -> dict:
    return {"kare": int(row["kare"]), "test": int(row["test"]), "indirme_mbps": float(row["indirme_mbps"]),
            "yukleme_mbps": float(row["yukleme_mbps"]), "gecikme_ms": float(row["gecikme_ms"]),
            "guvenilirlik": row["guvenilirlik"], "tek_kare_payi": float(row["tek_kare_payi"]),
            "olculen_nufus_payi": float(row["olculen_nufus_payi"])}


def settlement_values(row: dict) -> dict:
    """A settlement type's speeds, tests and share of residents measured: what the region panel shows of it."""
    return {"test": int(row["test"]), "indirme_mbps": float(row["indirme_mbps"]), "yukleme_mbps": float(row["yukleme_mbps"]),
            "gecikme_ms": float(row["gecikme_ms"]), "olculen_nufus_payi": float(row["olculen_nufus_payi"])}


CONNECTION_TYPES = ["fiber", "xdsl", "kablo", "diger"]


def btk_values(row: dict, household_size: float) -> dict:
    population, fixed, fiber = float(row["nufus"]), float(row["sabit_genisbant"]), float(row["fiber"])
    # Fixed subscriptions by connection type. BTK leaves a type blank where a province has none
    # (cable in 57 provinces): the other types then add up to the total.
    types = {key: round(float(row[key] or 0)) for key in CONNECTION_TYPES}
    # BTK's population is TÜİK's (ADNKS), so dividing it by TÜİK's average household size that year gives households.
    households = population / household_size
    return {"nufus": int(population), "sabit_genisbant": round(fixed), **types,
            "abone_100": round(fixed / population * 100, 2), "fiber_payi": round(fiber / fixed, 3),
            "abone_100_hane": round(fixed / households * 100, 2), "fiber_100_hane": round(fiber / households * 100, 2)}


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
    # Archives of an earlier layout or of periods that have moved on would be published with the rest.
    for old in OUT_DIR.glob("*.pmtiles"):
        old.unlink()
    tiles = pq.read_table(TILES_PATH)
    with tempfile.TemporaryDirectory(dir=OUT_DIR) as tmp:
        for period in period_quarters:
            print(f"speed cells, {period}")
            source = Path(tmp) / f"hucreler-{period}.geojsonl"
            with source.open("w", encoding="utf-8") as f:
                for feature in cell_features(tiles.filter(pc.equal(tiles["donem"], period))):
                    f.write(json.dumps(feature, separators=(",", ":")) + "\n")
            build_pmtiles(cells_path(period), f"Ookla fixed-broadband speed cells, {period}", {"hucreler": source})
    build_pmtiles(BORDERS_PATH, "Districts and provinces of Türkiye", {"ilceler": DISTRICTS_PATH, "iller": PROVINCES_PATH})

    provinces: dict[str, dict] = {}
    for row in read_csv(PROVINCE_PATH):
        province = provinces.setdefault(row["il_kodu"], {"ad": row["il"], "hiz": {}, "yerlesim": {}, "btk": {}})
        province["hiz"][row["donem"]] = speed_values(row)
    # Per period, the settlement types with tests in it (build.py), in yoğun kent, orta yoğun kent, kır order.
    for row in read_csv(SETTLEMENT_PATH):
        provinces[row["il_kodu"]]["yerlesim"].setdefault(row["donem"], {})[row["yerlesim"]] = settlement_values(row)
    household_size = {(row["il_kodu"], row["yil"]): float(row["ortalama_hane_buyuklugu"]) for row in read_csv(HOUSEHOLD_PATH)}
    btk_years = set()
    for row in read_csv(BTK_PATH):
        key = (row["il_kodu"], row["yil"])
        if key not in household_size:
            raise SystemExit(f"no household size for {key} in {HOUSEHOLD_PATH.name}: rerun `python -m pipeline.tuik`")
        provinces[row["il_kodu"]]["btk"][row["yil"]] = btk_values(row, household_size[key])
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

    for path in [*sorted(OUT_DIR.glob("*.pmtiles")), *(OUT_DIR / name for name in ["iller.json", "ilceler.json", "arama.json"])]:
        print(f"  web/public/data/{path.name}: {path.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
