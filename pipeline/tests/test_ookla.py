"""Checks on the Ookla quarters (run `python -m pipeline.ookla` first)."""
import re

import pyarrow.compute as pc
import pyarrow.parquet as pq
import pytest

from pipeline.common import lonlat_to_tile, quadkey_to_tile, tile_to_quadkey
from pipeline.ookla import OUT_DIR, TILE_ZOOM, tile_range

# One city centre per geographical region; each ~7 km square around it must have measurements.
REGION_CITIES = {
    "Marmara": (29.03, 40.99),          # İstanbul, Kadıköy
    "Ege": (27.14, 38.42),              # İzmir, Konak
    "Akdeniz": (30.71, 36.89),          # Antalya
    "İç Anadolu": (32.85, 39.92),       # Ankara, Kızılay
    "Karadeniz": (39.72, 41.00),        # Trabzon
    "Doğu Anadolu": (43.38, 38.50),     # Van
    "Güneydoğu Anadolu": (40.21, 37.91),  # Diyarbakır
}
CITY_ZOOM = 12


@pytest.fixture(scope="module")
def quarters():
    files = list(OUT_DIR.glob("fixed_*.parquet"))
    if not files:
        pytest.skip("run `python -m pipeline.ookla` to download the quarters")
    tables = {}
    for path in files:
        year, quarter = re.fullmatch(r"fixed_(\d{4})q(\d)", path.stem).groups()
        tables[int(year), int(quarter)] = pq.read_table(path)
    return dict(sorted(tables.items()))


def test_quadkeys_follow_the_bing_tile_system():
    # The worked example in Microsoft's "Bing Maps Tile System" article.
    assert tile_to_quadkey(3, 5, 3) == "213"
    assert quadkey_to_tile("213") == (3, 5, 3)
    x, y = lonlat_to_tile(29.03, 40.99, TILE_ZOOM)
    assert quadkey_to_tile(tile_to_quadkey(x, y, TILE_ZOOM)) == (x, y, TILE_ZOOM)


def test_every_quarter_since_2019_is_present(quarters):
    latest = max(quarters)
    assert latest >= (2026, 3)
    expected = [(y, q) for y in range(2019, latest[0] + 1) for q in range(1, 5) if (y, q) <= latest]
    assert list(quarters) == expected


def test_tiles_are_well_formed(quarters):
    x0, x1, y0, y1 = tile_range(TILE_ZOOM)
    for key, t in quarters.items():
        quadkeys = t["quadkey"].to_pylist()
        assert len(set(quadkeys)) == len(quadkeys), key
        for quadkey in quadkeys:
            x, y, zoom = quadkey_to_tile(quadkey)
            assert zoom == TILE_ZOOM and x0 <= x <= x1 and y0 <= y <= y1, (key, quadkey)
        assert not any(column.null_count for column in t.columns), key
        assert pc.min(t["tests"]).as_py() >= 1, key
        assert pc.all(pc.less_equal(t["devices"], t["tests"])).as_py(), key
        assert pc.min(t["devices"]).as_py() >= 1, key
        assert pc.min(t["avg_d_kbps"]).as_py() > 0 and pc.min(t["avg_u_kbps"]).as_py() > 0, key


def test_every_region_has_measurements_every_quarter(quarters):
    squares = {region: tile_to_quadkey(*lonlat_to_tile(lon, lat, CITY_ZOOM), CITY_ZOOM)
               for region, (lon, lat) in REGION_CITIES.items()}
    for key, t in quarters.items():
        head = pc.utf8_slice_codeunits(t["quadkey"], 0, CITY_ZOOM)
        for region, square in squares.items():
            tests = pc.sum(t["tests"].filter(pc.equal(head, square))).as_py() or 0
            assert tests >= 100, (key, region, tests)


def test_quarter_sizes_are_plausible(quarters):
    # Ookla's 2020-2021 files hold fewer tiles worldwide (about 45-56k here, against 75-92k
    # from 2022 on); anything far below that means a broken read.
    for key, t in quarters.items():
        assert t.num_rows >= 40_000, key
        assert pc.sum(t["tests"]).as_py() >= 500_000, key
