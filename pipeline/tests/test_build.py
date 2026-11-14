"""Checks on the province, district and tile values (run `python -m pipeline.build` first)."""
import csv
from collections import defaultdict

import pyarrow.compute as pc
import pyarrow.parquet as pq
import pytest

from pipeline.boundaries import DISTRICT_LIST_PATH
from pipeline.btk import OUT_PATH as BTK_PATH
from pipeline.build import DISTRICT_PATH, NATIONAL, PROVINCE_PATH, RELIABILITY, TILES_PATH, available_quarters, periods
from pipeline.common import PROVINCES, lonlat_to_tile, tile_to_quadkey
from pipeline.ookla import output_path
from pipeline.population import OUT_PATH as POPULATION_PATH

PERIODS = [str(y) for y in range(2019, 2026)] + ["guncel"]


def read_csv(path):
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


@pytest.fixture(scope="module")
def provinces():
    return {(r["il_kodu"], r["donem"]): r for r in read_csv(PROVINCE_PATH)}


@pytest.fixture(scope="module")
def districts():
    return {(r["ilce_kodu"], r["donem"]): r for r in read_csv(DISTRICT_PATH)}


@pytest.fixture(scope="module")
def district_list():
    return {r["ilce_kodu"]: r for r in read_csv(DISTRICT_LIST_PATH)}


@pytest.fixture(scope="module")
def tiles():
    if not TILES_PATH.exists():
        pytest.skip("run `python -m pipeline.build` to make the tile table")
    return pq.read_table(TILES_PATH)


@pytest.fixture(scope="module")
def population():
    if not POPULATION_PATH.exists():
        pytest.skip("run `python -m pipeline.population` to make the residents table")
    table = pq.read_table(POPULATION_PATH)
    return dict(zip(table["quadkey"].to_pylist(), table["nufus"].to_pylist(), strict=True))


def measured(row):
    """Residents of the area's measured tiles, as far as the rounded share tells."""
    return int(row["nufus"]) * float(row["olculen_nufus_payi"])


def add_up(rows):
    """Tile count, tests, devices and device-weighted mean download of several areas.

    Each value is rounded to 0.1, so the mean of rounded parts can differ by up to 0.1.
    """
    devices = sum(int(r["cihaz"]) for r in rows)
    download = sum(float(r["indirme_mbps"]) * int(r["cihaz"]) for r in rows) / devices
    return sum(int(r["kare"]) for r in rows), sum(int(r["test"]) for r in rows), devices, download


def test_periods_are_calendar_years_plus_the_latest_four_quarters():
    quarters = [(y, q) for y in range(2019, 2027) for q in range(1, 5)][:-1]  # up to 2026 Q3
    result = periods(quarters)
    assert list(result) == PERIODS
    assert result["2019"] == [(2019, 1), (2019, 2), (2019, 3), (2019, 4)]
    assert result["guncel"] == [(2025, 4), (2026, 1), (2026, 2), (2026, 3)]
    # 2026 Q4 makes the year complete, but it would repeat the current period: only "guncel" has it
    # until 2027 Q1, when the year appears and "guncel" moves on.
    with_q4 = periods(quarters + [(2026, 4)])
    assert list(with_q4) == PERIODS
    assert with_q4["guncel"] == [(2026, 1), (2026, 2), (2026, 3), (2026, 4)]
    with_next = periods(quarters + [(2026, 4), (2027, 1)])
    assert list(with_next) == [*PERIODS[:-1], "2026", "guncel"]
    assert with_next["guncel"] == [(2026, 2), (2026, 3), (2026, 4), (2027, 1)]


def test_every_province_has_every_period(provinces):
    assert set(provinces) == {(code, p) for code in [*PROVINCES, NATIONAL] for p in PERIODS}


def test_districts_add_up_to_their_province(provinces, districts, district_list):
    groups = defaultdict(list)
    for (code, period), row in districts.items():
        assert row["il_kodu"] == district_list[code]["il_kodu"], code
        groups[row["il_kodu"], period].append(row)
    assert set(groups) == {k for k in provinces if k[0] != NATIONAL}
    for key, rows in groups.items():
        tiles, tests, devices, download = add_up(rows)
        assert (tiles, tests, devices) == tuple(int(provinces[key][c]) for c in ("kare", "test", "cihaz")), key
        assert download == pytest.approx(float(provinces[key]["indirme_mbps"]), abs=0.1), key


def test_provinces_add_up_to_the_country(provinces):
    for period in PERIODS:
        tiles, tests, devices, download = add_up([provinces[code, period] for code in PROVINCES])
        national = provinces[NATIONAL, period]
        assert (tiles, tests, devices) == tuple(int(national[c]) for c in ("kare", "test", "cihaz")), period
        assert download == pytest.approx(float(national["indirme_mbps"]), abs=0.1), period


def test_residents_add_up(provinces, districts, district_list):
    """A district without measurements in a period has no row, so its residents are missing from the sum."""
    in_province = defaultdict(set)
    for code, d in district_list.items():
        in_province[d["il_kodu"]].add(code)
    for period in PERIODS:
        for province in PROVINCES:
            rows = [districts[code, period] for code in in_province[province] if (code, period) in districts]
            row = provinces[province, period]
            total = sum(int(r["nufus"]) for r in rows)
            if len(rows) == len(in_province[province]):
                assert total == pytest.approx(int(row["nufus"]), abs=len(rows)), (province, period)
            else:
                assert total < int(row["nufus"]), (province, period)
            # Each share is rounded to 0.001.
            assert sum(map(measured, rows)) == pytest.approx(measured(row), abs=0.001 * int(row["nufus"])), (province, period)
        national = provinces[NATIONAL, period]
        rows = [provinces[code, period] for code in PROVINCES]
        assert sum(int(r["nufus"]) for r in rows) == pytest.approx(int(national["nufus"]), abs=len(rows)), period
        assert sum(map(measured, rows)) == pytest.approx(measured(national), abs=0.001 * int(national["nufus"])), period


def test_measured_residents_are_a_share_of_the_residents(provinces, districts):
    for key, row in [*provinces.items(), *districts.items()]:
        assert int(row["nufus"]) > 0, key
        assert 0 <= float(row["olculen_nufus_payi"]) <= 1, key


def test_province_residents_are_close_to_the_official_2021_population(provinces):
    """The grid spreads TÜİK's 2021 figures; tiles under the land share on coasts and borders drop a little."""
    official = {r["il_kodu"]: int(r["nufus"]) for r in read_csv(BTK_PATH) if r["yil"] == "2021"}
    for code in PROVINCES:
        assert int(provinces[code, "guncel"]["nufus"]) == pytest.approx(official[code], rel=0.02), code
    assert int(provinces[NATIONAL, "guncel"]["nufus"]) == pytest.approx(official[NATIONAL], rel=0.002)


def test_almost_every_district_has_measurements(districts, district_list):
    for period in PERIODS:
        assert sum((code, period) in districts for code in district_list) >= 960, period


def test_reliability_follows_the_test_count(provinces, districts):
    for row in [*provinces.values(), *districts.values()]:
        expected = next(label for floor, label in RELIABILITY if int(row["test"]) >= floor)
        assert row["guvenilirlik"] == expected


def test_each_tile_belongs_to_one_district(tiles, district_list):
    owners = defaultdict(set)
    for quadkey, province, district in zip(*(tiles[c].to_pylist() for c in ("quadkey", "il_kodu", "ilce_kodu")), strict=True):
        owners[quadkey].add((province, district))
    for quadkey, owner in owners.items():
        assert len(owner) == 1, quadkey
        province, district = next(iter(owner))
        assert district_list[district]["il_kodu"] == province, quadkey


def test_tiles_add_up_to_their_district(tiles, districts):
    totals = defaultdict(lambda: [0, 0])
    for period, district, tests in zip(*(tiles[c].to_pylist() for c in ("donem", "ilce_kodu", "test")), strict=True):
        totals[district, period][0] += 1
        totals[district, period][1] += tests
    assert set(totals) == set(districts)
    for key, (count, tests) in totals.items():
        assert (count, tests) == (int(districts[key]["kare"]), int(districts[key]["test"])), key


@pytest.mark.parametrize("place, lonlat, province, district", [
    ("Kadıköy", (29.03, 40.99), "İstanbul", "Kadıköy"),
    ("Kızılay", (32.854, 39.920), "Ankara", "Çankaya"),
    ("Gökçeada", (25.9085, 40.202), "Çanakkale", "Gökçeada"),
    ("Hakkari", (43.74, 37.575), "Hakkari", "Hakkari Merkez"),
])
def test_known_places_land_in_the_right_district(tiles, district_list, place, lonlat, province, district):
    quadkey = tile_to_quadkey(*lonlat_to_tile(*lonlat, 16), 16)
    found = tiles.filter(pc.equal(tiles["quadkey"], quadkey))
    assert found.num_rows, place
    code = found["ilce_kodu"][0].as_py()
    assert (district_list[code]["il"], district_list[code]["ilce"]) == (province, district)


@pytest.mark.parametrize("place, lonlat", [
    ("Qamishli, Syria", (41.23, 37.04)),
    ("Marmara Sea", (28.0, 40.75)),
    ("Lesbos, Greece", (26.55, 39.10)),
])
def test_places_outside_turkiye_are_left_out(tiles, place, lonlat):
    quadkey = tile_to_quadkey(*lonlat_to_tile(*lonlat, 16), 16)
    assert not pc.any(pc.equal(tiles["quadkey"], quadkey)).as_py(), place


@pytest.mark.parametrize("code", ["69", "79", NATIONAL])  # Bayburt, Kilis, Türkiye
@pytest.mark.parametrize("period", ["2020", "guncel"])
def test_values_match_a_hand_calculation_from_the_quarters(tiles, provinces, population, code, period):
    """Recompute from the downloaded quarters: every tile-quarter weighted by its devices."""
    members = tiles.filter(pc.equal(tiles["donem"], period))
    if code != NATIONAL:
        members = members.filter(pc.equal(members["il_kodu"], code))
    keep = set(members["quadkey"].to_pylist())
    tests = devices = d_sum = u_sum = lat_sum = 0
    per_tile = defaultdict(int)
    for quarter in periods(available_quarters())[period]:
        for row in pq.read_table(output_path(*quarter)).to_pylist():
            if row["quadkey"] in keep:
                tests += row["tests"]
                devices += row["devices"]
                per_tile[row["quadkey"]] += row["devices"]
                d_sum += row["avg_d_kbps"] * row["devices"]
                u_sum += row["avg_u_kbps"] * row["devices"]
                lat_sum += row["avg_lat_ms"] * row["devices"]
    row = provinces[code, period]
    assert (int(row["test"]), int(row["cihaz"])) == (tests, devices)
    assert float(row["indirme_mbps"]) == round(d_sum / devices / 1000, 1)
    assert float(row["yukleme_mbps"]) == round(u_sum / devices / 1000, 1)
    assert float(row["gecikme_ms"]) == round(lat_sum / devices, 1)
    assert float(row["tek_kare_payi"]) == round(max(per_tile.values()) / devices, 3)
    residents = sum(population.get(quadkey, 0) for quadkey in keep)
    assert float(row["olculen_nufus_payi"]) == pytest.approx(residents / int(row["nufus"]), abs=0.001)
