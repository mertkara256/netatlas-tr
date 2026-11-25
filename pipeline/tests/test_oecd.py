"""Checks of pipeline/oecd.py on a small sample in the service's CSV layout, without the network."""
import csv

import pytest

from pipeline.oecd import FIELDS, MEMBERS, OUT_PATH, latest_complete, rank, read_values, table

HEADER = ("STRUCTURE,STRUCTURE_ID,STRUCTURE_NAME,ACTION,REF_AREA,Reference area,FREQ,Frequency of observation,"
          "NETWORK_TYPE,Network type,MEASURE,Measure,NETWORK_ACCESS_MODE,Network access mode,NETWORK_SPEED,Network speed,"
          "UNIT_MEASURE,Unit of measure,TIME_PERIOD,Time period,OBS_VALUE,Observation value,OBS_STATUS,Observation status,"
          "UNIT_MULT,Unit multiplier,DECIMALS,Decimals")
MODES = {"_T": "Total", "FIB": "Fibre/LAN", "DSL": "DSL"}
UNITS = {"100HB": "Per 100 inhabitants", "PT_SB_FBB": "Percentage of fixed broadband subscriptions", "SB": "Subscriptions"}
SAMPLE = {"TUR": "Türkiye", "DEU": "Almanya", "ESP": "İspanya", "KOR": "Güney Kore"}


def row(area, mode, unit, period, value, measure="SUB"):
    label = "Subscriptions" if measure == "SUB" else "Advertised speeds"
    return (f"DATAFLOW,OECD.STI.DEP:DSD_BB_DATABASE@DF_BB_TEL_DATABASE(2.0),Broadband and telecom databases,I,{area},{area},"
            f"Q,Quarterly,FBB,Fixed broadband,{measure},{label},{mode},{MODES[mode]},_Z,Not applicable,{unit},{UNITS[unit]},"
            f"{period},,{value},,A,Normal value,0,Units,,")


def both(area, period, per_100, fibre):
    return [row(area, "_T", "100HB", period, per_100), row(area, "FIB", "PT_SB_FBB", period, fibre)]


@pytest.fixture
def text():
    lines = [HEADER]
    for period in ["2024-Q4", "2025-Q4"]:
        lines += both("TUR", period, 23.74, 46.88) + both("DEU", period, 46.45, 16.54) + both("ESP", period, 39.78, 91.06)
        lines += both("KOR", period, 48.83, 46.88)  # the same fibre share as Türkiye
    lines += [
        *both("BRA", "2025-Q4", 99.0, 99.0),  # not a member
        *both("OECD", "2025-Q4", 99.0, 99.0),  # the members' total
        *both("TUR", "2025-Q3", 1.0, 1.0),  # not a last quarter
        row("TUR", "DSL", "PT_SB_FBB", "2025-Q4", 41.3),  # another access mode
        row("TUR", "_T", "SB", "2025-Q4", 20999895),  # another unit
        row("TUR", "_T", "PT_SB_FBB", "2025-Q4", 7.0, measure="ADV_PLN"),  # another measure
    ]
    return "\n".join(lines) + "\n"


def test_keeps_members_last_quarters_and_the_two_measures(text):
    values = read_values(text, SAMPLE)
    assert set(values) == {"2024-Q4", "2025-Q4"}
    assert set(values["2025-Q4"]) == set(SAMPLE)
    assert values["2025-Q4"]["TUR"] == {"abone_100": 23.74, "fiber_payi": 46.88}


def test_takes_the_latest_last_quarter_every_member_has(text):
    assert latest_complete(read_values(text, SAMPLE), SAMPLE) == "2025-Q4"
    # Germany's fibre share is not out yet for 2025.
    missing = text.replace(row("DEU", "FIB", "PT_SB_FBB", "2025-Q4", 16.54), row("DEU", "FIB", "PT_SB_FBB", "2025-Q4", ""))
    assert latest_complete(read_values(missing, SAMPLE), SAMPLE) == "2024-Q4"
    with pytest.raises(SystemExit):
        latest_complete(read_values(text, {**SAMPLE, "FRA": "Fransa"}), {**SAMPLE, "FRA": "Fransa"})


def test_ranks_from_the_highest_with_ties_sharing():
    assert rank({"a": 3.0, "b": 5.0, "c": 3.0, "d": 1.0}) == {"b": 1, "a": 2, "c": 2, "d": 4}


def test_table_ranks_both_measures_and_orders_by_fibre(text):
    rows = table(read_values(text, SAMPLE), "2025-Q4", "2026-11-25", SAMPLE)
    assert [r["ulke_kodu"] for r in rows] == ["ESP", "KOR", "TUR", "DEU"]
    tur = next(r for r in rows if r["ulke_kodu"] == "TUR")
    assert tur == {"ulke_kodu": "TUR", "ulke": "Türkiye", "donem": "2025-Q4", "abone_100": 23.74, "abone_100_sira": 4,
                   "fiber_payi": 0.4688, "fiber_payi_sira": 2, "erisim": "2026-11-25"}
    assert next(r for r in rows if r["ulke_kodu"] == "KOR")["fiber_payi_sira"] == 2


def test_written_table_has_every_member_once():
    with OUT_PATH.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        assert reader.fieldnames == FIELDS
        rows = list(reader)
    assert sorted(r["ulke_kodu"] for r in rows) == sorted(MEMBERS)
    assert len({r["donem"] for r in rows}) == 1
    for measure in ["abone_100", "fiber_payi"]:
        ranks = {r["ulke_kodu"]: int(r[f"{measure}_sira"]) for r in rows}
        assert ranks == rank({r["ulke_kodu"]: float(r[measure]) for r in rows}), measure
