"""Checks on the province and district boundaries (run `python -m pipeline.boundaries` first)."""
import csv
import json
import unicodedata
from collections import Counter, defaultdict

import pytest
import shapely

from pipeline.boundaries import DISTRICT_LIST_PATH, DISTRICTS_PATH, PROVINCES_PATH
from pipeline.common import PROVINCES


@pytest.fixture(scope="module")
def districts():
    with DISTRICT_LIST_PATH.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


@pytest.fixture(scope="module")
def shapes():
    if not (PROVINCES_PATH.exists() and DISTRICTS_PATH.exists()):
        pytest.skip("run `python -m pipeline.boundaries` to download the shapes")

    def load(path, key):
        features = json.loads(path.read_text(encoding="utf-8"))["features"]
        return {f["properties"][key]: (f["properties"], shapely.geometry.shape(f["geometry"])) for f in features}

    return load(PROVINCES_PATH, "il_kodu"), load(DISTRICTS_PATH, "ilce_kodu")


def test_there_are_973_districts_in_81_provinces(districts):
    assert len(districts) == 973
    assert len({d["ilce_kodu"] for d in districts}) == 973
    assert {d["il_kodu"] for d in districts} == set(PROVINCES)


def test_district_counts_match_known_values(districts):
    per_province = Counter(d["il"] for d in districts)
    assert per_province["İstanbul"] == 39
    assert per_province["Ankara"] == 25
    assert per_province["İzmir"] == 30
    assert per_province["Bayburt"] == 3


def test_names_are_unique_within_a_province(districts):
    pairs = [(d["il_kodu"], d["ilce"]) for d in districts]
    assert len(set(pairs)) == len(pairs)


def test_names_are_clean_turkish(districts):
    for d in districts:
        name = d["ilce"]
        assert name == name.strip() and "  " not in name, name
        assert not any(unicodedata.combining(c) for c in name), name
    names = {(d["il"], d["ilce"]) for d in districts}
    for expected in [("Adana", "Karaisalı"), ("Erzincan", "Çayırlı"), ("Erzincan", "İliç"),
                     ("Kırıkkale", "Bahşılı"), ("Çanakkale", "Gökçeada"), ("Samsun", "Ayvacık"),
                     ("Adıyaman", "Adıyaman Merkez"), ("Bursa", "Yenişehir"), ("Mersin", "Yenişehir")]:
        assert expected in names, expected


def test_shapes_are_valid(shapes):
    provinces, districts = shapes
    assert len(provinces) == 81 and len(districts) == 973
    invalid = [code for code, (_, geom) in {**provinces, **districts}.items() if not geom.is_valid]
    assert not invalid


def test_districts_lie_inside_their_province(shapes):
    provinces, districts = shapes
    for _, geom in provinces.values():
        shapely.prepare(geom)
    for code, (props, geom) in districts.items():
        assert provinces[props["il_kodu"]][1].contains(geom.representative_point()), code


def test_districts_cover_their_province(shapes):
    provinces, districts = shapes
    area = defaultdict(float)
    for props, geom in districts.values():
        area[props["il_kodu"]] += geom.area
    for code, (_, geom) in provinces.items():
        assert area[code] == pytest.approx(geom.area, rel=0.005), code
