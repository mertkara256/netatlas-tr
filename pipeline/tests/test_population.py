"""Checks on the residents-per-tile table (run `python -m pipeline.population` first)."""
import csv

import numpy as np
import pyarrow.compute as pc
import pyarrow.parquet as pq
import pytest

from pipeline.btk import OUT_PATH as BTK_PATH
from pipeline.common import lonlat_to_tile, tile_to_quadkey
from pipeline.ookla import TR_BBOX
from pipeline.population import OUT_PATH, tile_ids, tile_population


@pytest.fixture(scope="module")
def tiles():
    if not OUT_PATH.exists():
        pytest.skip("run `python -m pipeline.population` to make the residents table")
    return pq.read_table(OUT_PATH)


def quadkey(lon, lat):
    return tile_to_quadkey(*lonlat_to_tile(lon, lat, 16), 16)


def test_tile_ids_match_the_scalar_tile_helper():
    rng = np.random.default_rng(0)
    lon = rng.uniform(TR_BBOX[0], TR_BBOX[2], 1000)
    lat = rng.uniform(TR_BBOX[1], TR_BBOX[3], 1000)
    expected = [y * 2 ** 16 + x for x, y in (lonlat_to_tile(a, b, 16) for a, b in zip(lon, lat, strict=True))]
    assert tile_ids(lon, lat).tolist() == expected


def test_cells_are_added_up_per_tile():
    kizilay, ulus = (32.854, 39.920), (32.855, 39.941)
    # Two cells 20 m apart share a tile; the third is in another tile.
    table = tile_population(np.array([kizilay[0], kizilay[0] + 0.0002, ulus[0]]),
                            np.array([kizilay[1], kizilay[1], ulus[1]]), np.array([10.0, 2.5, 4.0]))
    assert dict(zip(table["quadkey"].to_pylist(), table["nufus"].to_pylist(), strict=True)) == {
        quadkey(*kizilay): 12.5, quadkey(*ulus): 4.0}


def test_each_tile_is_listed_once_with_residents(tiles):
    assert pc.count_distinct(tiles["quadkey"]).as_py() == tiles.num_rows
    assert pc.min(tiles["nufus"]).as_py() > 0


def test_the_total_is_the_official_2021_population(tiles):
    with BTK_PATH.open(encoding="utf-8") as f:
        official = next(int(r["nufus"]) for r in csv.DictReader(f) if (r["il_kodu"], r["yil"]) == ("00", "2021"))
    assert pc.sum(tiles["nufus"]).as_py() == pytest.approx(official, rel=1e-4)


@pytest.mark.parametrize("place, lonlat, inhabited", [
    ("Kızılay, Ankara", (32.854, 39.920), True),
    ("Kadıköy, İstanbul", (29.03, 40.99), True),
    ("Marmara Sea", (28.0, 40.75), False),
    ("Qamishli, Syria", (41.23, 37.04), False),
    ("Lesbos, Greece", (26.55, 39.10), False),
])
def test_known_places(tiles, place, lonlat, inhabited):
    assert pc.any(pc.equal(tiles["quadkey"], quadkey(*lonlat))).as_py() == inhabited, place
