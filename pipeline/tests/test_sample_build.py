"""Checks of build.py on the sample in fixture/, against numbers worked out by hand.

They need no downloaded data, so they run on every pull request. fixture/README.md says what each
square is for; conftest.py runs the build.
"""
import json

import pyarrow.compute as pc
import pytest
import shapely

from pipeline.build import NATIONAL
from pipeline.common import quadkey_to_tile, tile_bounds

KADIKOY, USKUDAR, NUSAYBIN = "TUR034023", "TUR034038", "TUR047007"
IZMIT, ADAPAZARI, SERDIVAN = "TUR041008", "TUR054001", "TUR054014"


@pytest.fixture(scope="module")
def shapes(sample):
    features = json.loads(sample.districts_path.read_text(encoding="utf-8"))["features"]
    return {f["properties"]["ilce_kodu"]: shapely.geometry.shape(f["geometry"]) for f in features}


def outline(sample, square):
    return shapely.box(*tile_bounds(*quadkey_to_tile(sample.squares[square])))


def land(shapes, box):
    """Share of the box in each district, to 0.1%."""
    shares = {code: round(shape.intersection(box).area / box.area, 3) for code, shape in shapes.items()}
    return {code: share for code, share in shares.items() if share}


def rows(sample, square):
    """(period, province, district) of each row the square has in the tile table."""
    tiles = sample.tiles.filter(pc.equal(sample.tiles["quadkey"], sample.squares[square])).to_pylist()
    return {(r["donem"], r["il_kodu"], r["ilce_kodu"]) for r in tiles}


@pytest.mark.parametrize("square, province, district, share, inside", [
    ("moda_coast_19", "34", KADIKOY, 0.186, False),       # the rest is sea
    ("nusaybin_border_10", "47", NUSAYBIN, 0.097, False),  # the rest is Syria
    ("nusaybin_border_23", "47", NUSAYBIN, 0.233, True),
])
def test_a_tile_counts_when_a_fifth_of_it_is_turkish_land(sample, shapes, square, province, district, share, inside):
    assert land(shapes, outline(sample, square)) == {district: share}
    assert rows(sample, square) == ({(period, province, district) for period in sample.periods} if inside else set())


@pytest.mark.parametrize("square, shares", [
    ("moda_coast_49", {KADIKOY: 0.483, USKUDAR: 0.003}),
    ("moda_coast_65", {KADIKOY: 0.655}),
])
def test_a_coastal_tile_stays_in_when_its_centre_is_at_sea(sample, shapes, square, shares):
    box = outline(sample, square)
    assert land(shapes, box) == shares
    assert not any(shape.contains(box.centroid) for shape in shapes.values())
    assert rows(sample, square) == {(period, "34", KADIKOY) for period in sample.periods}


@pytest.mark.parametrize("square, shares", [("qamishli", {}), ("qamishli_edge", {}), ("border_sliver_3", {NUSAYBIN: 0.03})])
def test_tiles_across_the_land_border_are_left_out(sample, shapes, square, shares):
    """Their 50 tests and Qamishli's 500 residents are missing from Nusaybin's and Mardin's totals below."""
    assert land(shapes, outline(sample, square)) == shares
    assert rows(sample, square) == set()


def test_a_tile_goes_to_the_province_with_most_land_then_to_its_largest_district(sample, shapes):
    """İzmit is the largest single district in the square, but Sakarya's two districts hold more of it."""
    assert land(shapes, outline(sample, "serdivan_junction")) == {IZMIT: 0.403, SERDIVAN: 0.344, ADAPAZARI: 0.253}
    assert rows(sample, "serdivan_junction") == {(period, "54", SERDIVAN) for period in sample.periods}


def test_the_current_period_is_the_latest_four_quarters(sample, sample_ending_in_q4):
    for run, periods in [(sample, {"2025", "guncel"}), (sample_ending_in_q4, {"guncel"})]:
        assert set(run.periods) == periods
        assert {p for _, p in run.provinces} == {p for _, p in run.districts} == set(run.tiles["donem"].to_pylist()) == periods
    assert sample.periods["guncel"] == [(2025, 2), (2025, 3), (2025, 4), (2026, 1)]
    assert sample_ending_in_q4.periods["guncel"] == [(2025, 1), (2025, 2), (2025, 3), (2025, 4)]
    # Squares measured in a single quarter.
    assert {p for p, _, _ in rows(sample, "izmit_2025q1")} == {"2025"}
    assert {p for p, _, _ in rows(sample, "izmit_2026q1")} == {"guncel"}
    assert {p for p, _, _ in rows(sample_ending_in_q4, "izmit_2025q1")} == {"guncel"}


def test_a_current_period_ending_in_q4_has_the_years_values(sample, sample_ending_in_q4):
    """Until 2026 Q1 arrives, "guncel" holds what 2025 holds once it does."""
    for table in ("provinces", "districts"):
        year = {code: {**row, "donem": "guncel"} for (code, period), row in getattr(sample, table).items() if period == "2025"}
        current = {code: row for (code, _), row in getattr(sample_ending_in_q4, table).items()}
        assert current == year, table


def test_area_values_are_weighted_by_devices(sample):
    """Adapazarı: 100 tests from 1 device at 10 Mbps, and 10 tests from 9 devices at 100 Mbps. Weighted by
    tests, download would be 18.2 Mbps, upload 6.8 and latency 37.3 ms."""
    row = sample.districts[ADAPAZARI, "guncel"]
    assert (int(row["kare"]), int(row["test"]), int(row["cihaz"])) == (2, 110, 10)
    assert (float(row["indirme_mbps"]), float(row["yukleme_mbps"]), float(row["gecikme_ms"])) == (91.0, 23.0, 13.0)


def test_a_tile_pools_its_quarters_weighted_by_devices(sample):
    """30 tests from 1 device at 20 Mbps, then 10 tests from 3 devices at 60 Mbps: 50.0 Mbps, as an area would
    pool them. Weighted by tests, download would be 30.0 Mbps, upload 6.0 and latency 17.0 ms."""
    tiles = sample.tiles.filter(pc.equal(sample.tiles["quadkey"], sample.squares["kadikoy_two_quarters"])).to_pylist()
    assert len(tiles) == len(sample.periods)
    for tile in tiles:
        assert (tile["test"], tile["cihaz"]) == (40, 4)
        assert (tile["indirme_mbps"], tile["yukleme_mbps"], tile["gecikme_ms"]) == (50.0, 10.0, 11.0)


@pytest.mark.parametrize("province, district, period, tests, label", [
    ("47", NUSAYBIN, "2025", 9, "dusuk"),
    ("47", NUSAYBIN, "guncel", 10, "orta"),
    ("41", IZMIT, "2025", 199, "orta"),
    ("41", IZMIT, "guncel", 200, "yuksek"),
])
def test_reliability_follows_the_test_thresholds(sample, province, district, period, tests, label):
    """In the sample Nusaybin is all of Mardin and İzmit all of Kocaeli, so each pair has the same tests."""
    for row in (sample.provinces[province, period], sample.districts[district, period]):
        assert (int(row["test"]), row["guvenilirlik"]) == (tests, label)


def test_the_single_tile_share_is_the_largest_tile_over_the_period(sample):
    """Kadıköy has 20 devices: kadikoy_largest 2 in each of three quarters, kadikoy_burst 5 in one. The share
    is 6/20, not 5/20. Türkiye's largest tile is İzmit's, with 60 of its 99 devices."""
    for row in (sample.districts[KADIKOY, "guncel"], sample.provinces["34", "guncel"]):
        assert (int(row["cihaz"]), float(row["tek_kare_payi"])) == (20, 0.3)
    national = sample.provinces[NATIONAL, "guncel"]
    assert (int(national["cihaz"]), float(national["tek_kare_payi"])) == (99, round(60 / 99, 3))


@pytest.mark.parametrize("table, code, residents, share", [
    # 100 in a measured square, 50 next to it, 50 two squares away (next only to moda_coast_19, left out).
    ("districts", KADIKOY, 200, 0.75),
    # 20 next only to measured squares that are left out, in or along Syria.
    ("districts", NUSAYBIN, 100, 0.8),
    # 40 next only to a measured square in Kocaeli, 10 next to none.
    ("districts", SERDIVAN, 100, 0.9),
    # The 540 residents of the squares left out (Qamishli, the coastal and the border slivers) are not counted.
    ("provinces", NATIONAL, 560, round(480 / 560, 3)),
])
def test_residents_count_as_measured_in_or_next_to_a_measured_tile(sample, table, code, residents, share):
    row = getattr(sample, table)[code, "guncel"]
    assert (int(row["nufus"]), float(row["olculen_nufus_payi"])) == (residents, share)


def test_a_province_with_no_measured_residents_gets_a_share_of_zero(sample_without_measured_residents_in_mardin):
    """Mardin's tests stay, but its only residents (20, nusaybin_by_syria) live away from them. Districts
    already got a share of 0 this way; a province used to stop the whole build."""
    run = sample_without_measured_residents_in_mardin
    for period in run.periods:
        for row in (run.provinces["47", period], run.districts[NUSAYBIN, period]):
            assert (int(row["test"]) > 0, int(row["nufus"]), float(row["olculen_nufus_payi"])) == (True, 20, 0.0)
        national = run.provinces[NATIONAL, period]
        assert (int(national["nufus"]), float(national["olculen_nufus_payi"])) == (480, round(400 / 480, 3))
