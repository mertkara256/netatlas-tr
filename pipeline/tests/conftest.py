"""The sample in fixture/, run through build.py once per test session.

Its quarters and residents are written in the pipeline's own formats, build.py's paths are pointed at
them and at the clipped district shapes, and build.main() runs as it does on the full data.
fixture/README.md says what each square is for.
"""
from __future__ import annotations

import csv
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from pipeline import build, ookla
from pipeline.common import PROVINCES, tile_to_quadkey

FIXTURE_DIR = Path(__file__).with_name("fixture")
QUARTER_COLUMNS = ["avg_d_kbps", "avg_u_kbps", "avg_lat_ms", "tests", "devices"]
# İstanbul, Kocaeli, Mardin and Sakarya. build.main() needs residents, some of them measured, in every
# province it lists, so it lists only these.
SAMPLE_PROVINCES = ["34", "41", "47", "54"]


@dataclass
class Sample:
    squares: dict[str, str]                    # label in the fixture CSVs -> quadkey
    quarters: dict[tuple[int, int], pa.Table]  # the quarter files build.py read
    periods: dict[str, list[tuple[int, int]]]
    population: dict[str, float]               # quadkey -> residents
    districts_path: Path                       # the clipped district shapes
    tiles: pa.Table                            # kareler.parquet
    provinces: dict[tuple[str, str], dict]     # (il_kodu, donem) -> row of iller_hiz.csv
    districts: dict[tuple[str, str], dict]     # (ilce_kodu, donem) -> row of ilceler_hiz.csv


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def run_build(directory: Path, latest: tuple[int, int]) -> Sample:
    """Write the sample's quarters up to `latest` and its residents, then run build.main() on them."""
    squares: dict[str, str] = {}

    def quadkey(row: dict) -> str:
        key = tile_to_quadkey(int(row["x"]), int(row["y"]), 16)
        assert squares.setdefault(row["square"], key) == key, f"{row['square']} is placed twice"
        return key

    quarter_dir = directory / "ookla"
    quarter_dir.mkdir()
    by_quarter = defaultdict(list)
    for row in read_csv(FIXTURE_DIR / "ookla.csv"):
        if (int(row["year"]), int(row["quarter"])) <= latest:
            by_quarter[int(row["year"]), int(row["quarter"])].append(row)
    quarters = {}
    for (year, quarter), rows in sorted(by_quarter.items()):
        quarters[year, quarter] = pa.table({"quadkey": [quadkey(r) for r in rows],
                                            **{c: [int(r[c]) for r in rows] for c in QUARTER_COLUMNS}})
        pq.write_table(quarters[year, quarter], quarter_dir / f"fixed_{year}q{quarter}.parquet")
    residents = read_csv(FIXTURE_DIR / "nufus.csv")
    population = pa.table({"quadkey": [quadkey(r) for r in residents], "nufus": [float(r["nufus"]) for r in residents]})
    pq.write_table(population, directory / "nufus_kareler.parquet")

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(build, "OUT_DIR", quarter_dir)
        patch.setattr(ookla, "OUT_DIR", quarter_dir)  # build.read_quarter() finds the files through ookla.output_path()
        patch.setattr(build, "DISTRICTS_PATH", FIXTURE_DIR / "ilceler.geojson")
        patch.setattr(build, "POPULATION_PATH", directory / "nufus_kareler.parquet")
        patch.setattr(build, "TILES_PATH", directory / "kareler.parquet")
        patch.setattr(build, "PROVINCE_PATH", directory / "iller_hiz.csv")
        patch.setattr(build, "DISTRICT_PATH", directory / "ilceler_hiz.csv")
        patch.setattr(build, "PROVINCES", {code: PROVINCES[code] for code in SAMPLE_PROVINCES})
        build.main()

    return Sample(
        squares=squares,
        quarters=quarters,
        periods=build.periods(list(quarters)),
        population=dict(zip(population["quadkey"].to_pylist(), population["nufus"].to_pylist(), strict=True)),
        districts_path=FIXTURE_DIR / "ilceler.geojson",
        tiles=pq.read_table(directory / "kareler.parquet"),
        provinces={(r["il_kodu"], r["donem"]): r for r in read_csv(directory / "iller_hiz.csv")},
        districts={(r["ilce_kodu"], r["donem"]): r for r in read_csv(directory / "ilceler_hiz.csv")},
    )


@pytest.fixture(scope="session")
def sample(tmp_path_factory) -> Sample:
    """All five quarters, up to 2026 Q1: periods "2025" and "guncel" (2025 Q2 - 2026 Q1)."""
    return run_build(tmp_path_factory.mktemp("sample"), (2026, 1))


@pytest.fixture(scope="session")
def sample_ending_in_q4(tmp_path_factory) -> Sample:
    """Without 2026 Q1: "guncel" is 2025 Q1-Q4, and 2025 is not listed on its own."""
    return run_build(tmp_path_factory.mktemp("sample_ending_in_q4"), (2025, 4))
