"""Checks of the settlement types (settlement.py) and of the values build.py works out for them.

The thresholds and neighbours are checked on the towns in fixture/yerlesim.csv, the values by hand on the
sample run with those towns (conftest.py), and the sums also on the full data (run `python -m pipeline.build`
first). fixture/README.md says what each square is for.
"""
import csv
from collections import defaultdict

import numpy as np
import pyarrow as pa
import pyarrow.compute as pc
import pytest

from pipeline.build import NATIONAL, PROVINCE_PATH, SETTLEMENT_PATH, assign
from pipeline.common import PROVINCES, quadkey_to_tile
from pipeline.settlement import CELL_ZOOM, TYPES, cell_area, cell_types, tile_types

DENSE, SEMI_DENSE, RURAL = TYPES


def read_csv(path):
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


@pytest.fixture(scope="module")
def towns(sample_with_towns):
    """Each labelled square's cell: its type, residents and density."""
    population = pa.table({"quadkey": list(sample_with_towns.population),
                           "nufus": list(sample_with_towns.population.values())})
    types = cell_types(population)
    residents = defaultdict(float)
    for quadkey, people in sample_with_towns.population.items():
        residents[quadkey[:CELL_ZOOM]] += people
    out = {}
    for label, quadkey in sample_with_towns.squares.items():
        cell = quadkey[:CELL_ZOOM]
        y = quadkey_to_tile(cell)[1]
        out[label] = {"type": types.get(cell, RURAL), "residents": residents[cell],
                      "density": residents[cell] / cell_area(np.array([y]))[0]}
    return out


@pytest.mark.parametrize("square, kind, density, why", [
    ("town_core", DENSE, (1500, None), "with town_core_east and town_edge_over, 56,360 residents through shared edges"),
    ("town_core_east", DENSE, (1500, None), "the same cluster"),
    ("town_edge_over", DENSE, (1500, 1520), "just over 1,500 per km², an edge on the cluster: joins it"),
    ("adapazari_a", SEMI_DENSE, (1480, 1500), "just under 1,500 beside the cluster: orta yoğun kent"),
    ("serdivan_junction", SEMI_DENSE, (300, 320), "just over 300, beside the cluster"),
    ("town_ring_under", RURAL, (280, 300), "just under 300, beside the cluster"),
    ("corner_pair_a", SEMI_DENSE, (1500, None), "52,000 with corner_pair_b, but only through a corner"),
    ("edge_pair_a", SEMI_DENSE, (1500, None), "49,800 with edge_pair_b: just under 50,000"),
    ("small_town_over", SEMI_DENSE, (1500, None), "5,100 alone: over 5,000"),
    ("small_town_under", RURAL, (1500, None), "4,900 alone: under 5,000"),
    ("corner_of_small_town", SEMI_DENSE, (300, 1500), "512 with only a corner on small_town_over"),
    ("izmit", RURAL, (0, 300), "Kocaeli's measured squares are in thinly peopled cells"),
    ("izmit_2026q1", RURAL, (0, 1), "a cell without residents"),
])
def test_cells_take_their_type_from_density_and_cluster(towns, square, kind, density, why):
    cell = towns[square]
    low, high = density
    assert low <= cell["density"] and (high is None or cell["density"] < high), why
    assert cell["type"] == kind, why


def test_clusters_add_up_their_cells(towns):
    assert towns["town_core"]["residents"] + towns["town_core_east"]["residents"] + towns["town_edge_over"]["residents"] == 56_360
    assert towns["corner_pair_a"]["residents"] + towns["corner_pair_b"]["residents"] == 52_000


def test_a_square_takes_its_cells_type():
    """A square without residents still lies in a cell, which may have them in another of its four squares."""
    types = cell_types(pa.table({"quadkey": ["0123012301230120"], "nufus": [2000.0]}))
    found = tile_types(pa.array(["0123012301230120", "0123012301230123", "0123012301230130"]), types)
    assert found.to_pylist() == [RURAL] * 3  # 2,000 alone is under 5,000
    types = cell_types(pa.table({"quadkey": ["0123012301230120"], "nufus": [60_000.0]}))
    found = tile_types(pa.array(["0123012301230120", "0123012301230123", "0123012301230130"]), types)
    assert found.to_pylist() == [DENSE, DENSE, RURAL]


def test_each_province_has_a_row_for_the_types_it_has_tests_in(sample_with_towns):
    found = defaultdict(set)
    for code, kind, period in sample_with_towns.types:
        found[code, period].add(kind)
    for period in sample_with_towns.periods:
        assert found["54", period] == {DENSE, SEMI_DENSE}  # adapazari_b; adapazari_a and serdivan_junction
        assert found["41", period] == found["34", period] == found["47", period] == {RURAL}
        assert found[NATIONAL, period] == set(TYPES)


@pytest.mark.parametrize("code", ["34", "41", "47", "54", NATIONAL])  # the sample's provinces and Türkiye
@pytest.mark.parametrize("period", ["2025", "guncel"])
def test_type_values_match_a_hand_calculation(sample_with_towns, monkeypatch, code, period):
    """Recompute from the quarters, as for a whole province: each tile-quarter of the type weighted by its
    devices, and the type's residents, measured when a test of any type was run in their tile or next to it."""
    sample = sample_with_towns
    monkeypatch.setattr("pipeline.build.DISTRICTS_PATH", sample.districts_path)
    types = cell_types(pa.table({"quadkey": list(sample.population), "nufus": list(sample.population.values())}))
    kind_of = dict(zip(sample.population, tile_types(pa.array(list(sample.population)), types).to_pylist(), strict=True))
    owners = assign(list(sample.population))
    mine = [q for q, owner in zip(owners["quadkey"].to_pylist(), owners["il_kodu"].to_pylist(), strict=True)
            if code in (owner, NATIONAL)]
    in_period = sample.tiles.filter(pc.equal(sample.tiles["donem"], period))
    measured = {quadkey_to_tile(q)[:2] for q in in_period["quadkey"].to_pylist()}

    def near(quadkey):
        x, y, _ = quadkey_to_tile(quadkey)
        return any((x + dx, y + dy) in measured for dx in (-1, 0, 1) for dy in (-1, 0, 1))

    for kind in TYPES:
        members = in_period if code == NATIONAL else in_period.filter(pc.equal(in_period["il_kodu"], code))
        keep = {q for q, k in zip(members["quadkey"].to_pylist(), tile_types(members["quadkey"], types).to_pylist(), strict=True)
                if k == kind}
        if not keep:
            assert (code, kind, period) not in sample.types
            continue
        tests = devices = d_sum = lat_sum = 0
        for quarter in sample.periods[period]:
            for row in sample.quarters[quarter].to_pylist():
                if row["quadkey"] in keep:
                    tests += row["tests"]
                    devices += row["devices"]
                    d_sum += row["avg_d_kbps"] * row["devices"]
                    lat_sum += row["avg_lat_ms"] * row["devices"]
        residents = sum(sample.population[q] for q in mine if kind_of[q] == kind)
        near_tests = sum(sample.population[q] for q in mine if kind_of[q] == kind and near(q))
        row = sample.types[code, kind, period]
        assert (int(row["kare"]), int(row["test"]), int(row["cihaz"])) == (len(keep), tests, devices), kind
        assert float(row["indirme_mbps"]) == round(d_sum / devices / 1000, 1), kind
        assert float(row["gecikme_ms"]) == round(lat_sum / devices, 1), kind
        assert int(row["nufus"]) == pytest.approx(residents, abs=1), kind
        assert float(row["olculen_nufus_payi"]) == pytest.approx(near_tests / residents, abs=0.001), kind


def add_up_types(provinces, types):
    """For each province and period, its types' tiles, tests and devices, their device-weighted download and
    residents beside the province's own row. Each value is rounded to 0.1, so the mean of rounded parts can
    differ by up to 0.1."""
    groups = defaultdict(list)
    for (code, _, period), row in types.items():
        groups[code, period].append(row)
    assert set(groups) == set(provinces)
    for key, rows in groups.items():
        devices = sum(int(r["cihaz"]) for r in rows)
        yield key, provinces[key], {
            "counts": tuple(sum(int(r[c]) for r in rows) for c in ("kare", "test", "cihaz")),
            "download": sum(float(r["indirme_mbps"]) * int(r["cihaz"]) for r in rows) / devices,
            "residents": sum(int(r["nufus"]) for r in rows),
        }


def test_types_add_up_to_the_province_in_the_sample(sample_with_towns):
    """Sakarya has kır residents (serdivan_west, serdivan_south) but no kır tests, so no kır row: its types'
    residents fall short of the province's."""
    for key, province, parts in add_up_types(sample_with_towns.provinces, sample_with_towns.types):
        assert parts["counts"] == tuple(int(province[c]) for c in ("kare", "test", "cihaz")), key
        assert parts["download"] == pytest.approx(float(province["indirme_mbps"]), abs=0.1), key
        assert parts["residents"] <= int(province["nufus"]), key


def test_types_add_up_to_the_province():
    """On the full data every province has tests in each type it has residents in, so residents add up too."""
    if not SETTLEMENT_PATH.exists():
        pytest.skip("run `python -m pipeline.build` to make the settlement type table")
    provinces = {(r["il_kodu"], r["donem"]): r for r in read_csv(PROVINCE_PATH)}
    types = {(r["il_kodu"], r["yerlesim"], r["donem"]): r for r in read_csv(SETTLEMENT_PATH)}
    assert {code for code, _, _ in types} == {*PROVINCES, NATIONAL}
    for key, province, parts in add_up_types(provinces, types):
        assert parts["counts"] == tuple(int(province[c]) for c in ("kare", "test", "cihaz")), key
        assert parts["download"] == pytest.approx(float(province["indirme_mbps"]), abs=0.1), key
        assert parts["residents"] == pytest.approx(int(province["nufus"]), abs=3), key
