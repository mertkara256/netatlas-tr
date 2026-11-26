"""Checks on data/processed/tuik_hane.csv (run `python -m pipeline.tuik` first) and on the households it gives BTK's
figures (pipeline/tiles.py)."""
import csv

import pytest

from pipeline.btk import OUT_PATH as BTK_PATH
from pipeline.common import PROVINCES
from pipeline.tiles import btk_values
from pipeline.tuik import OUT_PATH, XLS_PATH, read_workbook

YEARS = list(range(2008, 2026))


@pytest.fixture(scope="module")
def sizes():
    with OUT_PATH.open(encoding="utf-8") as f:
        return {(r["il_kodu"], int(r["yil"])): float(r["ortalama_hane_buyuklugu"]) for r in csv.DictReader(f)}


@pytest.fixture(scope="module")
def btk():
    with BTK_PATH.open(encoding="utf-8") as f:
        return {(r["il_kodu"], int(r["yil"])): r for r in csv.DictReader(f)}


def test_every_province_and_year_is_present(sizes):
    assert set(sizes) == {(code, year) for code in [*PROVINCES, "00"] for year in YEARS}


def test_every_province_name_in_the_workbook_is_matched():
    """All 81 provinces and Türkiye's total, by TÜİK's own names, and nothing else; the CSV is what the workbook says."""
    if not XLS_PATH.exists():
        pytest.skip(f"needs {XLS_PATH.name} in data/raw/tuik/ (downloaded by hand)")
    data = read_workbook(XLS_PATH)
    assert set(data) == {*PROVINCES, "00"}
    with OUT_PATH.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            assert data[r["il_kodu"]][int(r["yil"])] == pytest.approx(float(r["ortalama_hane_buyuklugu"]), abs=5e-5)


@pytest.mark.parametrize("code, expected", [
    ("00", 3.08), ("73", 4.84), ("63", 4.63), ("72", 4.43), ("62", 2.49), ("28", 2.50), ("17", 2.51),
])
def test_2025_sizes_match_the_bulletin(sizes, code, expected):
    # Türkiye, Şırnak, Şanlıurfa and Batman have TÜİK's largest households in 2025, Tunceli, Giresun and Çanakkale its smallest.
    assert round(sizes[(code, 2025)], 2) == expected


def test_province_households_add_up_to_turkiye(sizes, btk):
    years = sorted({year for _, year in btk})
    for year in years:
        provinces = sum(float(btk[(code, year)]["nufus"]) / sizes[(code, year)] for code in PROVINCES)
        national = float(btk[("00", year)]["nufus"]) / sizes[("00", year)]
        assert provinces == pytest.approx(national, rel=1e-3), year


def test_per_household_is_per_person_times_household_size(sizes, btk):
    for key, row in btk.items():
        values = btk_values(row, sizes[key])
        fiber_100 = float(row["fiber"]) / float(row["nufus"]) * 100
        assert values["abone_100_hane"] == pytest.approx(values["abone_100"] * sizes[key], abs=0.04), key
        assert values["fiber_100_hane"] == pytest.approx(fiber_100 * sizes[key], abs=0.01), key


def test_2025_per_household_values(sizes, btk):
    turkiye = btk_values(btk[("00", 2025)], sizes[("00", 2025)])
    assert (round(turkiye["abone_100"], 1), round(turkiye["abone_100_hane"], 1)) == (24.4, 75.2)
    assert round(turkiye["fiber_100_hane"], 1) == 35.2
    assert round(btk_values(btk[("34", 2025)], sizes[("34", 2025)])["abone_100_hane"], 1) == 97.9

    def lowest(key):
        values = {code: btk_values(btk[(code, 2025)], sizes[(code, 2025)])[key] for code in PROVINCES}
        return [PROVINCES[code] for code in sorted(values, key=values.get)[:5]]

    # Per person, the provinces with the largest households trail; per household, others do.
    assert lowest("fiber_100_hane") == ["Hatay", "Gümüşhane", "Sinop", "Giresun", "Zonguldak"]
    assert lowest("abone_100_hane") == ["Ağrı", "Muş", "Gümüşhane", "Adıyaman", "Van"]
