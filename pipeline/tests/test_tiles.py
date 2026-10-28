"""Checks on the map tiles, JSON files and search index (run `python -m pipeline.tiles` first)."""
import csv
import gzip
import json
from datetime import date
import shutil
import struct
import subprocess
import tempfile
from collections import defaultdict

import pyarrow.compute as pc
import pyarrow.parquet as pq
import pytest

from pipeline.build import DISTRICT_PATH, NATIONAL, PROVINCE_PATH, TILES_PATH
from pipeline.common import PROVINCES, ROOT, lonlat_to_tile, normalize_name, tile_to_quadkey
from pipeline.tiles import LEVELS, MAX_ZOOM, OUT_DIR, PMTILES_PATH, cell_features, tile_zooms

PERIODS = [str(y) for y in range(2019, 2026)] + ["guncel"]


def read_json(name):
    path = OUT_DIR / name
    if not path.exists():
        pytest.skip("run `python -m pipeline.tiles` to build the web data")
    return json.loads(path.read_text(encoding="utf-8"))


def read_csv(path):
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def decode(z, x, y):
    if not PMTILES_PATH.exists() or not shutil.which("tippecanoe-decode"):
        pytest.skip("needs harita.pmtiles and tippecanoe-decode")
    out = subprocess.run(["tippecanoe-decode", str(PMTILES_PATH), str(z), str(x), str(y)],
                         capture_output=True, text=True, check=True).stdout
    return {layer["properties"]["layer"]: layer["features"] for layer in json.loads(out)["features"]}


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
    """The cell a feature draws, found from its centre (tippecanoe may move ring starts)."""
    ring = feature["geometry"]["coordinates"][0]
    lon = (min(c[0] for c in ring) + max(c[0] for c in ring)) / 2
    lat = (min(c[1] for c in ring) + max(c[1] for c in ring)) / 2
    level = feature["properties"]["seviye"]
    return tile_to_quadkey(*lonlat_to_tile(lon, lat, level), level)


def test_level_16_cells_are_the_tiles(bayburt):
    tiles, features = bayburt
    squares = {quadkey_of(f): f["properties"] for f in features if f["properties"]["seviye"] == 16}
    for row in tiles.to_pylist():
        cell = squares[row["quadkey"]]
        assert (cell[f"t{row['donem']}"], cell[f"d{row['donem']}"]) == (row["test"], row["indirme_mbps"])
    assert len(squares) == len(set(tiles["quadkey"].to_pylist()))


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
    if not PMTILES_PATH.exists():
        pytest.skip("run `python -m pipeline.tiles` to build the map tiles")
    assert PMTILES_PATH.stat().st_size < 100 * 1024 * 1024


def test_pmtiles_metadata_names_no_local_folders():
    """tippecanoe stores its command line in the archive, which is published."""
    if not PMTILES_PATH.exists():
        pytest.skip("run `python -m pipeline.tiles` to build the map tiles")
    with PMTILES_PATH.open("rb") as f:
        header = f.read(127)
        offset, length = struct.unpack_from("<QQ", header, 24)  # PMTiles v3: where the JSON metadata is
        f.seek(offset)
        metadata = f.read(length)
    if header[97] == 2:  # gzip-compressed
        metadata = gzip.decompress(metadata)
    text = json.dumps(json.loads(metadata), ensure_ascii=False)
    # As folders (trailing slash), so a relative "data/tmpab12/" does not match Linux's /tmp.
    assert f"{ROOT}/" not in text and f"{tempfile.gettempdir()}/" not in text


@pytest.mark.parametrize("zoom", range(MAX_ZOOM + 1))
def test_each_zoom_carries_its_level_and_the_borders(zoom):
    layers = decode(zoom, *lonlat_to_tile(32.85, 39.92, zoom))  # Ankara, Kızılay
    levels = {f["properties"]["seviye"] for f in layers["hucreler"]}
    assert levels == {next(level for level in LEVELS if tile_zooms(level)[0] <= zoom <= tile_zooms(level)[1])}
    assert layers["iller"] and layers["ilceler"]


def test_a_square_keeps_its_values_in_the_tiles():
    if not TILES_PATH.exists():
        pytest.skip("run `python -m pipeline.build` to make the tile table")
    quadkey = tile_to_quadkey(*lonlat_to_tile(29.03, 40.99, 16), 16)  # Kadıköy
    tiles = pq.read_table(TILES_PATH)
    rows = tiles.filter(pc.equal(tiles["quadkey"], quadkey)).to_pylist()
    expected = {k: v for r in rows for k, v in [(f"t{r['donem']}", r["test"]), (f"d{r['donem']}", r["indirme_mbps"])]}
    assert len(rows) == len(PERIODS)
    found = [f["properties"] for f in decode(MAX_ZOOM, *lonlat_to_tile(29.03, 40.99, MAX_ZOOM))["hucreler"]
             if quadkey_of(f) == quadkey]
    assert len(found) == 1
    assert {k: found[0][k] for k in expected} == expected


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
