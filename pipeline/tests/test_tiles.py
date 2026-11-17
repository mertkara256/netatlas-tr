"""Checks on the map tiles, JSON files and search index (run `python -m pipeline.tiles` first)."""
import csv
import gzip
import json
import shutil
import struct
import subprocess
import tempfile
from collections import defaultdict
from datetime import date

import pyarrow.compute as pc
import pyarrow.parquet as pq
import pytest
import shapely

from pipeline.build import DISTRICT_PATH, NATIONAL, PROVINCE_PATH, TILES_PATH
from pipeline.common import PROVINCES, ROOT, lonlat_to_tile, normalize_name, quadkey_to_tile, tile_bounds, tile_to_quadkey
from pipeline.tiles import BORDERS_PATH, FOOTPRINT_DEPTH, LEVELS, MAX_ZOOM, OUT_DIR, cell_features, cells_path, tile_zooms

PERIODS = [str(y) for y in range(2019, 2026)] + ["guncel"]


def read_json(name):
    path = OUT_DIR / name
    if not path.exists():
        pytest.skip("run `python -m pipeline.tiles` to build the web data")
    return json.loads(path.read_text(encoding="utf-8"))


def read_csv(path):
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def decode(path, z, x, y):
    if not path.exists() or not shutil.which("tippecanoe-decode"):
        pytest.skip(f"needs {path.name} and tippecanoe-decode")
    out = subprocess.run(["tippecanoe-decode", str(path), str(z), str(x), str(y)],
                         capture_output=True, text=True, check=True).stdout
    return {layer["properties"]["layer"]: layer["features"] for layer in json.loads(out)["features"]}


def archives():
    found = sorted(OUT_DIR.glob("*.pmtiles"))
    if not found:
        pytest.skip("run `python -m pipeline.tiles` to build the map tiles")
    return found


def test_there_is_one_cell_archive_per_period_and_one_for_borders():
    assert {path.name for path in archives()} == {BORDERS_PATH.name, *(cells_path(p).name for p in PERIODS)}


@pytest.fixture(scope="module")
def bayburt():
    """Bayburt's tiles and the cells made from them: small enough to check cell by cell."""
    if not TILES_PATH.exists():
        pytest.skip("run `python -m pipeline.build` to make the tile table")
    tiles = pq.read_table(TILES_PATH)
    tiles = tiles.filter(pc.equal(tiles["il_kodu"], "69"))
    return tiles, cell_features(tiles)


def test_every_tile_zoom_shows_exactly_one_level():
    shown = [z for level in LEVELS for z in range(tile_zooms(level)[0], tile_zooms(level)[1] + 1)]
    assert sorted(shown) == list(range(MAX_ZOOM + 1))


def quadkey_of(feature):
    """The cell a feature belongs to, found from a point inside its shape (a cell is drawn only where
    its measured parts are, so its shape need not be centred)."""
    point = shapely.geometry.shape(feature["geometry"]).representative_point()
    level = feature["properties"]["seviye"]
    return tile_to_quadkey(*lonlat_to_tile(point.x, point.y, level), level)


def period_of(feature):
    """Each feature carries one period's values."""
    (key,) = [k for k in feature["properties"] if k.startswith("t")]
    return key[1:]


def test_level_16_cells_are_the_tiles(bayburt):
    tiles, features = bayburt
    squares = {(quadkey_of(f), period_of(f)): f["properties"] for f in features if f["properties"]["seviye"] == 16}
    for row in tiles.to_pylist():
        cell = squares[row["quadkey"], row["donem"]]
        assert (cell[f"t{row['donem']}"], cell[f"d{row['donem']}"]) == (row["test"], row["indirme_mbps"])
    assert len(squares) == tiles.num_rows


def test_each_cell_is_drawn_where_its_squares_were_measured(bayburt):
    """A cell's shape is the tiles FOOTPRINT_DEPTH levels down that hold a square measured in that
    period (built here from tile_bounds, independently of the pipeline's grid maths), inside the cell."""
    tiles, features = bayburt
    rows = tiles.to_pylist()
    for f in features:
        level, period, cell = f["properties"]["seviye"], period_of(f), quadkey_of(f)
        part_level = min(level + FOOTPRINT_DEPTH, 16)
        parts = {r["quadkey"][:part_level] for r in rows if r["donem"] == period and r["quadkey"].startswith(cell)}
        expected = shapely.union_all([shapely.box(*tile_bounds(*quadkey_to_tile(q))) for q in parts])
        shape = shapely.geometry.shape(f["geometry"])
        assert shape.symmetric_difference(expected).area < 1e-9 * expected.area, (cell, period)
        assert shapely.box(*tile_bounds(*quadkey_to_tile(cell))).buffer(1e-9).contains(shape), (cell, period)


def test_every_level_holds_all_tests_and_the_same_average(bayburt):
    tiles, features = bayburt
    for period in PERIODS:
        rows = tiles.filter(pc.equal(tiles["donem"], period)).to_pylist()
        tests = sum(r["test"] for r in rows)
        download = sum(r["indirme_mbps"] * r["test"] for r in rows) / tests
        for level in LEVELS:
            cells = [f["properties"] for f in features
                     if f["properties"]["seviye"] == level and f"t{period}" in f["properties"]]
            assert sum(c[f"t{period}"] for c in cells) == tests, (period, level)
            # Each cell average is rounded to 0.1, so their weighted mean can be 0.05 off.
            mean = sum(c[f"d{period}"] * c[f"t{period}"] for c in cells) / tests
            assert mean == pytest.approx(download, abs=0.05), (period, level)


def test_pmtiles_stays_under_github_file_limit():
    for path in archives():
        assert path.stat().st_size < 100 * 1024 * 1024, path.name


def test_pmtiles_metadata_names_no_local_folders():
    """tippecanoe stores its command line in the archive, which is published."""
    for path in archives():
        with path.open("rb") as f:
            header = f.read(127)
            offset, length = struct.unpack_from("<QQ", header, 24)  # PMTiles v3: where the JSON metadata is
            f.seek(offset)
            metadata = f.read(length)
        if header[97] == 2:  # gzip-compressed
            metadata = gzip.decompress(metadata)
        text = json.dumps(json.loads(metadata), ensure_ascii=False)
        # As folders (trailing slash), so a relative "data/tmpab12/" does not match Linux's /tmp.
        assert f"{ROOT}/" not in text and f"{tempfile.gettempdir()}/" not in text, path.name


@pytest.mark.parametrize("zoom", range(MAX_ZOOM + 1))
def test_each_zoom_carries_its_level_and_the_borders(zoom):
    tile = lonlat_to_tile(32.85, 39.92, zoom)  # Ankara, Kızılay
    cells = decode(cells_path("guncel"), zoom, *tile)
    assert set(cells) == {"hucreler"}
    assert {f["properties"]["seviye"] for f in cells["hucreler"]} == {
        next(level for level in LEVELS if tile_zooms(level)[0] <= zoom <= tile_zooms(level)[1])}
    # Only the archive's own period, so a view downloads no other.
    assert {k for f in cells["hucreler"] for k in f["properties"]} == {"seviye", "dguncel", "uguncel", "lguncel", "tguncel"}
    borders = decode(BORDERS_PATH, zoom, *tile)
    assert set(borders) == {"iller", "ilceler"} and borders["iller"] and borders["ilceler"]


def test_a_square_keeps_its_values_in_the_tiles():
    if not TILES_PATH.exists():
        pytest.skip("run `python -m pipeline.build` to make the tile table")
    quadkey = tile_to_quadkey(*lonlat_to_tile(29.03, 40.99, 16), 16)  # Kadıköy
    tiles = pq.read_table(TILES_PATH)
    rows = tiles.filter(pc.equal(tiles["quadkey"], quadkey)).to_pylist()
    expected = {k: v for r in rows for k, v in [(f"t{r['donem']}", r["test"]), (f"d{r['donem']}", r["indirme_mbps"])]}
    assert len(rows) == len(PERIODS)
    found = [f["properties"] for period in PERIODS
             for f in decode(cells_path(period), MAX_ZOOM, *lonlat_to_tile(29.03, 40.99, MAX_ZOOM))["hucreler"]
             if quadkey_of(f) == quadkey]
    assert len(found) == len(PERIODS)  # once in each period's archive
    assert {k: v for props in found for k, v in props.items() if k in expected} == expected


def test_province_json_matches_the_tables():
    data = read_json("iller.json")
    assert [p["id"] for p in data["donemler"]] == PERIODS
    assert data["donemler"][-1] == {"id": "guncel", "ad": "Güncel", "aralik": "2025 Ç4 – 2026 Ç3"}
    assert data["btk_yillari"] == list(range(2020, 2026))
    # Ookla's attribution names the access date and the quarters used.
    assert data["ookla"]["ilk"] == [2019, 1] and tuple(data["ookla"]["son"]) >= (2026, 3)
    assert date.fromisoformat(data["ookla"]["erisim"]) >= date(2026, 10, 1)
    assert set(data["iller"]) == {*PROVINCES, NATIONAL}
    for row in read_csv(PROVINCE_PATH):
        values = data["iller"][row["il_kodu"]]["hiz"][row["donem"]]
        assert values["test"] == int(row["test"]) and values["indirme_mbps"] == float(row["indirme_mbps"])
        assert values["olculen_nufus_payi"] == float(row["olculen_nufus_payi"])
    for code, province in data["iller"].items():
        assert set(province["btk"]) == {str(y) for y in data["btk_yillari"]}, code
        for btk in province["btk"].values():
            assert btk["abone_100"] == pytest.approx(btk["sabit_genisbant"] / btk["nufus"] * 100, abs=0.01)
            assert 0 < btk["fiber_payi"] < 1


def test_district_json_lists_every_district():
    data = read_json("ilceler.json")
    assert len(data) == 973
    counts = defaultdict(int)
    for row in read_csv(DISTRICT_PATH):
        assert data[row["ilce_kodu"]]["hiz"][row["donem"]]["test"] == int(row["test"])
        counts[row["ilce_kodu"]] += 1
    assert sum(len(d["hiz"]) for d in data.values()) == sum(counts.values())


def test_search_finds_places_typed_without_turkish_letters():
    entries = read_json("arama.json")
    assert len(entries) == 81 + 973
    assert len({e["kod"] for e in entries}) == len(entries)
    for query, kind, name in [("kadikoy", "ilce", "Kadıköy"), ("ISTANBUL", "il", "İstanbul"),
                              ("sanliurfa", "il", "Şanlıurfa"), ("igdir", "il", "Iğdır")]:
        hits = [e for e in entries if e["tur"] == kind and normalize_name(query) in e["ara"]]
        assert name in [e["ad"] for e in hits], query
    for e in entries:
        w, s, e_, n = e["bbox"]
        assert 25 < w < e_ < 45 and 35 < s < n < 43, e["kod"]
