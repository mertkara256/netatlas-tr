"""Consistency checks on data/processed/btk_iller.csv (run `python -m pipeline.btk` first)."""
import csv

import pytest

from pipeline.btk import FIELDS, OUT_PATH
from pipeline.common import PROVINCES

YEARS = list(range(2020, 2026))
# Some BTK values are fractional estimates (e.g. every province's 2022 fixed and xDSL counts); the CSV
# rounds them to whole subscriptions, so a sum over 81 provinces may drift by up to ~40.
ROUNDING = len(PROVINCES) / 2
# In BTK's own 2020 figures the technology breakdown of these provinces misses its total by the same
# amount in opposite directions (Kilis -2150 / Konya +2150, Diyarbakır -1553 / İstanbul +1553).
KNOWN_BREAKDOWN_GAPS = {("79", 2020): -2150, ("42", 2020): 2150, ("21", 2020): -1553, ("34", 2020): 1553}


@pytest.fixture(scope="module")
def rows():
    with OUT_PATH.open(encoding="utf-8") as f:
        data = {}
        for r in csv.DictReader(f):
            data[(r["il_kodu"], int(r["yil"]))] = {k: float(r[k]) if r[k] else 0.0 for k in FIELDS}
    return data


def test_every_province_and_year_is_present(rows):
    assert set(rows) == {(code, year) for code in [*PROVINCES, "00"] for year in YEARS}


def test_technologies_add_up_to_fixed_total(rows):
    for (code, year), r in rows.items():
        gap = r["fiber"] + r["xdsl"] + r["kablo"] + r["diger"] - r["sabit_genisbant"]
        expected = KNOWN_BREAKDOWN_GAPS.get((code, year), 0)
        assert gap == pytest.approx(expected, abs=2), (code, year)


@pytest.mark.parametrize("field", ["nufus", "fiber", "xdsl", "kablo", "mobil_genisbant"])
def test_provinces_add_up_to_national_total(rows, field):
    for year in YEARS:
        provinces = sum(rows[(code, year)][field] for code in PROVINCES)
        assert provinces == pytest.approx(rows[("00", year)][field], abs=ROUNDING), (field, year)


def test_fiber_length_adds_up(rows):
    for year in YEARS:
        provinces = sum(rows[(code, year)]["fiber_km"] for code in PROVINCES)
        assert provinces == pytest.approx(rows[("00", year)]["fiber_km"], abs=10), year


def test_fixed_gap_is_the_undistributed_other_subscriptions(rows):
    # BTK adds ISDN and satellite subscriptions to the national "other" figure only, so the
    # national fixed total exceeds the provincial sum by that amount.
    for year in YEARS:
        def gap(field):
            return rows[("00", year)][field] - sum(rows[(code, year)][field] for code in PROVINCES)
        assert gap("sabit_genisbant") == pytest.approx(gap("diger"), abs=ROUNDING), year
        assert gap("diger") > 0, year


def test_values_match_the_published_bulletin(rows):
    # Spot checks against the 2026 PDF bulletin, to catch shifted rows or columns.
    assert rows[("01", 2025)]["sabit_genisbant"] == 514113
    assert rows[("04", 2025)]["fiber"] == 19161
    assert rows[("34", 2020)]["nufus"] == 15462452
    assert rows[("00", 2025)]["kapsama_45g"] == 99.81
