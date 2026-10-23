"""Current-period validation does not require downloaded data or generated map tiles."""
from unittest.mock import Mock

import pytest

from pipeline import build, tiles


@pytest.mark.parametrize("current", [
    [(2025, 4), (2026, 1), (2026, 2), (2026, 3)],
    [(2026, 1), (2026, 2), (2026, 3), (2026, 4)],
])
def test_current_period_contains_the_latest_four_calendar_quarters(current):
    # Input order must not change which calendar quarter is latest.
    result = build.periods(list(reversed(current)))

    assert result["guncel"] == current


@pytest.mark.parametrize("quarters, missing", [
    ([], []),
    ([(2026, 1), (2026, 2), (2026, 3)], ["2025 Q4"]),
    ([(2025, 3), (2026, 1), (2026, 2), (2026, 3)], ["2025 Q4"]),
    ([(2025, 2), (2025, 3), (2026, 1), (2026, 3)], ["2025 Q4", "2026 Q2"]),
])
def test_missing_current_quarters_are_reported_instead_of_using_older_ones(quarters, missing):
    with pytest.raises(ValueError, match="four consecutive quarters") as error:
        build.periods(quarters)

    for quarter in missing:
        assert quarter in str(error.value)
    if not quarters:
        assert "No Ookla quarters found" in str(error.value)


def test_historical_gap_does_not_invalidate_a_complete_current_window():
    current = [(2025, 4), (2026, 1), (2026, 2), (2026, 3)]
    historical = [(2023, q) for q in range(1, 5)] + [(2024, 1), (2024, 3), (2024, 4)]

    result = build.periods(historical + current)

    assert list(result) == ["2023", "guncel"]
    assert result["2023"] == [(2023, q) for q in range(1, 5)]
    assert result["guncel"] == current


@pytest.mark.parametrize("module", [build, tiles], ids=["build", "tiles"])
@pytest.mark.parametrize("quarters", [
    [],
    [(2026, 1), (2026, 2), (2026, 3)],
    [(2025, 3), (2026, 1), (2026, 2), (2026, 3)],
], ids=["empty", "three_quarters", "missing_year_end"])
def test_invalid_current_period_preserves_outputs_before_any_heavy_work(
        module, quarters, tmp_path, monkeypatch):
    monkeypatch.setattr(module, "available_quarters", lambda: quarters)
    read = Mock(side_effect=AssertionError("must validate before reading data"))
    process = Mock(side_effect=AssertionError("must validate before processing data"))
    if module is build:
        monkeypatch.setattr(build, "read_quarter", read)
        monkeypatch.setattr(build, "assign", process)
        outputs = []
        for name, filename in [("TILES_PATH", "kareler.parquet"),
                               ("PROVINCE_PATH", "iller_hiz.csv"),
                               ("DISTRICT_PATH", "ilceler_hiz.csv")]:
            path = tmp_path / filename
            monkeypatch.setattr(build, name, path)
            outputs.append(path)
    else:
        monkeypatch.setattr(tiles.pq, "read_table", read)
        monkeypatch.setattr(tiles, "build_pmtiles", process)
        monkeypatch.setattr(tiles, "OUT_DIR", tmp_path)
        monkeypatch.setattr(tiles, "PMTILES_PATH", tmp_path / "harita.pmtiles")
        outputs = [tmp_path / name for name in ["harita.pmtiles", "iller.json", "ilceler.json", "arama.json"]]
    for path in outputs:
        path.write_bytes(f"existing {path.name}".encode())
    before = {path: path.read_bytes() for path in outputs}

    with pytest.raises(ValueError, match="four consecutive quarters"):
        module.main()

    read.assert_not_called()
    process.assert_not_called()
    assert {path: path.read_bytes() for path in outputs} == before
    assert set(tmp_path.iterdir()) == set(outputs)
