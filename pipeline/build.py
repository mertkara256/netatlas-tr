"""Assign Ookla tiles to provinces and districts and pool them into yearly values.

Periods are the calendar years with all four quarters published (2019-2025 today) and
"guncel", the latest four published quarters. When the latest quarter is a Q4, that year and
"guncel" are the same four quarters, and the year is left out until the next quarter arrives.
Within a period a tile's tests are summed and its speeds averaged weighted by tests. Province,
district and national values average every tile-quarter in them weighted by its devices instead:
a phone that runs dozens of tests in one place then counts once, not dozens of times. Split-half
checks (2024 and the current period) found area values more repeatable this way: districts with
1,000-4,999 tests moved a median 9-11% between half-years instead of 13-16%, provinces under
5,000 tests 6-20% instead of 14-25%. Within a tile, weighting by devices changes nothing.

Each area also gets its residents (WorldPop, see population.py) and the share of them living in
tiles with at least one test in the period: how much of the area's population the measurements
stand for. Residents are assigned tile by tile, the same way as the tests.

A tile counts for Türkiye when at least 20% of its area is Turkish land. Coastal tiles whose
centre is offshore stay in; tiles across a land border (e.g. Qamishli) stay out. It goes to the
province holding most of that land, then to that province's district holding most of it.

    uv run python -m pipeline.build

Outputs:
    data/processed/kareler.parquet    one row per tile and period (large, not in git)
    data/processed/iller_hiz.csv      one row per province and period; il_kodu 00 is Türkiye
    data/processed/ilceler_hiz.csv    one row per district and period
"""
from __future__ import annotations

import csv
import json
import re
from collections import defaultdict

import numpy as np
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq
import shapely

from .boundaries import DISTRICT_LIST_PATH, DISTRICTS_PATH
from .common import PROCESSED_DIR, PROVINCES, quadkey_to_tile, tile_bounds
from .ookla import OUT_DIR, output_path
from .population import OUT_PATH as POPULATION_PATH

TILES_PATH = PROCESSED_DIR / "kareler.parquet"
PROVINCE_PATH = PROCESSED_DIR / "iller_hiz.csv"
DISTRICT_PATH = PROCESSED_DIR / "ilceler_hiz.csv"
NATIONAL = "00"
MIN_LAND_SHARE = 0.2
# Split-half check (2024 and the current period; median gap between the Q1+Q3 and Q2+Q4 means):
# a tile's download moves about 50% between half-years below 10 tests, 22-31% at 50-199 tests and
# 16-17% at 200-499. Areas, device-weighted, are about the same at the same test counts.
RELIABILITY = [(200, "yuksek"), (10, "orta"), (0, "dusuk")]
# Per tile-quarter: tests and devices, and each average times tests (for tiles) and times devices (for areas).
SUMS = ["tests", "d_sum", "u_sum", "lat_sum", "devices", "d_dev", "u_dev", "lat_dev"]
VALUE_COLUMNS = ["kare", "test", "cihaz", "indirme_mbps", "yukleme_mbps", "gecikme_ms", "guvenilirlik", "tek_kare_payi",
                 "nufus", "olculen_nufus_payi"]


def available_quarters() -> list[tuple[int, int]]:
    found = (re.fullmatch(r"fixed_(\d{4})q(\d)", p.stem) for p in OUT_DIR.glob("fixed_*.parquet"))
    return sorted((int(m[1]), int(m[2])) for m in found if m)


def periods(quarters: list[tuple[int, int]]) -> dict[str, list[tuple[int, int]]]:
    """Complete calendar years and the four consecutive quarters ending at the latest one.

    A year that ends at the latest quarter would repeat the current period, so it is listed
    only as "guncel" until the following quarter is published.
    """
    if not quarters:
        raise ValueError("No Ookla quarters found; the current period requires four consecutive quarters.")
    latest_year, latest_quarter = max(quarters)
    last = latest_year * 4 + latest_quarter - 1
    current = [(i // 4, i % 4 + 1) for i in range(last - 3, last + 1)]
    missing = [q for q in current if q not in quarters]
    if missing:
        labels = ", ".join(f"{year} Q{quarter}" for year, quarter in missing)
        raise ValueError(f"The current period requires four consecutive quarters ending at "
                         f"{latest_year} Q{latest_quarter}; missing: {labels}. "
                         "Download the missing Ookla quarters before building.")
    years = sorted({y for y, _ in quarters if all((y, q) in quarters for q in range(1, 5))} - {
        latest_year if latest_quarter == 4 else None})
    out = {str(y): [(y, q) for q in range(1, 5)] for y in years}
    out["guncel"] = current
    return out


def read_quarter(year: int, quarter: int) -> pa.Table:
    """Tests, devices and the speed totals weighted by each, per tile, so quarters can be added up."""
    t = pq.read_table(output_path(year, quarter))
    tests = pc.cast(t["tests"], pa.float64())
    devices = pc.cast(t["devices"], pa.float64())
    speeds = {"d": t["avg_d_kbps"], "u": t["avg_u_kbps"], "lat": t["avg_lat_ms"]}
    return pa.table({
        "quadkey": t["quadkey"],
        "tests": tests,
        **{f"{k}_sum": pc.multiply(pc.cast(v, pa.float64()), tests) for k, v in speeds.items()},
        "devices": devices,
        **{f"{k}_dev": pc.multiply(pc.cast(v, pa.float64()), devices) for k, v in speeds.items()},
    })


def assign(quadkeys: list[str]) -> pa.Table:
    """Province and district of every tile that is mostly Turkish land."""
    features = json.loads(DISTRICTS_PATH.read_text(encoding="utf-8"))["features"]
    districts = np.array([shapely.geometry.shape(f["geometry"]) for f in features])
    district_codes = [f["properties"]["ilce_kodu"] for f in features]
    province_codes = [f["properties"]["il_kodu"] for f in features]
    shapely.prepare(districts)
    tree = shapely.STRtree(districts)

    bounds = np.array([tile_bounds(*quadkey_to_tile(qk)) for qk in quadkeys])
    boxes = shapely.box(bounds[:, 0], bounds[:, 1], bounds[:, 2], bounds[:, 3])

    # Most tiles lie inside one district; only the rest need area maths.
    shares: dict[int, dict[int, float]] = defaultdict(dict)
    for tile, district in zip(*tree.query(boxes, predicate="within"), strict=True):
        shares[tile][district] = 1.0
    edge = np.array([i for i in range(len(boxes)) if i not in shares])
    tile_i, district_i = tree.query(boxes[edge], predicate="intersects")
    land = shapely.area(shapely.intersection(boxes[edge][tile_i], districts[district_i]))
    for tile, district, area in zip(edge[tile_i], district_i, land / shapely.area(boxes[edge][tile_i]), strict=True):
        shares[tile][district] = area

    rows = {"quadkey": [], "il_kodu": [], "ilce_kodu": []}
    for tile, by_district in shares.items():
        if sum(by_district.values()) < MIN_LAND_SHARE:
            continue
        by_province: dict[str, float] = defaultdict(float)
        for district, share in by_district.items():
            by_province[province_codes[district]] += share
        province = max(by_province, key=by_province.get)
        district = max((d for d in by_district if province_codes[d] == province), key=by_district.get)
        rows["quadkey"].append(quadkeys[tile])
        rows["il_kodu"].append(province)
        rows["ilce_kodu"].append(district_codes[district])
    print(f"{len(quadkeys):,} tiles in the box, {len(rows['quadkey']):,} in Türkiye "
          f"({len(edge):,} checked on a coast or border)")
    return pa.table(rows)


def reliability(tests: float) -> str:
    return next(label for floor, label in RELIABILITY if tests >= floor)


def values(tiles: int, tests: float, devices: float, d_dev: float, u_dev: float, lat_dev: float, top: float,
           residents: float, measured: float) -> list:
    """An area's row: device-weighted speeds, the share of the weight its largest tile holds, its
    residents and the share of them living in the measured tiles."""
    return [tiles, int(tests), int(devices), round(d_dev / devices / 1000, 1), round(u_dev / devices / 1000, 1),
            round(lat_dev / devices, 1), reliability(tests), round(top / devices, 3),
            round(residents), round(measured / residents, 3)]


def tile_table(period: str, pooled: pa.Table) -> pa.Table:
    tests = pooled["tests"]
    return pa.table({
        "donem": pa.array([period] * pooled.num_rows),
        "quadkey": pooled["quadkey"],
        "il_kodu": pooled["il_kodu"],
        "ilce_kodu": pooled["ilce_kodu"],
        "test": pc.cast(tests, pa.int64()),
        "indirme_mbps": pc.round(pc.divide(pooled["d_sum"], pc.multiply(tests, 1000)), 1),
        "yukleme_mbps": pc.round(pc.divide(pooled["u_sum"], pc.multiply(tests, 1000)), 1),
        "gecikme_ms": pc.round(pc.divide(pooled["lat_sum"], tests), 1),
        "guvenilirlik": pa.array([reliability(t) for t in tests.to_pylist()]),
    })


AREA_SUMS = ["tests", "devices", "d_dev", "u_dev", "lat_dev"]


def area_totals(pooled: pa.Table, key: str) -> dict[str, list[float]]:
    """Per area code: tile count, the totals values() needs, and the largest single tile's devices."""
    grouped = pooled.group_by(key).aggregate(
        [("quadkey", "count")] + [(c, "sum") for c in AREA_SUMS] + [("devices", "max")])
    columns = ([grouped["quadkey_count"].to_pylist()] + [grouped[f"{c}_sum"].to_pylist() for c in AREA_SUMS]
               + [grouped["devices_max"].to_pylist()])
    return {code: list(row) for code, *row in zip(grouped[key].to_pylist(), *columns, strict=True)}


def residents_by(tiles: pa.Table, key: str) -> dict[str, float]:
    grouped = tiles.group_by(key).aggregate([("nufus", "sum")])
    return dict(zip(grouped[key].to_pylist(), grouped["nufus_sum"].to_pylist(), strict=True))


def main() -> None:
    quarters = available_quarters()
    period_quarters = periods(quarters)
    data = {q: read_quarter(*q) for q in quarters}
    population = pq.read_table(POPULATION_PATH)
    quadkeys = pc.unique(pa.concat_arrays([t["quadkey"].combine_chunks() for t in [*data.values(), population]]))
    assignment = assign(quadkeys.to_pylist())
    population = population.join(assignment, "quadkey", join_type="inner")
    residents = {key: residents_by(population, key) for key in ("il_kodu", "ilce_kodu")}

    with DISTRICT_LIST_PATH.open(encoding="utf-8") as f:
        district_names = {d["ilce_kodu"]: d for d in csv.DictReader(f)}

    tiles, province_rows, district_rows = [], [], []
    for period, members in period_quarters.items():
        pooled = (pa.concat_tables([data[q] for q in members])
                  .group_by("quadkey").aggregate([(c, "sum") for c in SUMS])
                  .rename_columns(["quadkey"] + SUMS)
                  .join(assignment, "quadkey", join_type="inner")
                  .sort_by("quadkey"))
        tiles.append(tile_table(period, pooled))

        measured_tiles = population.join(pooled.select(["quadkey"]), "quadkey", join_type="inner")
        measured = {key: residents_by(measured_tiles, key) for key in ("il_kodu", "ilce_kodu")}

        provinces = area_totals(pooled, "il_kodu")
        # Türkiye adds up its provinces; its largest tile is the largest of theirs.
        columns = list(zip(*provinces.values(), strict=True))
        provinces[NATIONAL] = [sum(col) for col in columns[:-1]] + [max(columns[-1])]
        people = {code: (residents["il_kodu"][code], measured["il_kodu"][code]) for code in PROVINCES}
        people[NATIONAL] = tuple(map(sum, zip(*people.values(), strict=True)))
        for code, totals in sorted(provinces.items()):
            name = "Türkiye" if code == NATIONAL else PROVINCES[code]
            province_rows.append([code, name, period] + values(*totals, *people[code]))
        for code, totals in sorted(area_totals(pooled, "ilce_kodu").items()):
            d = district_names[code]
            district_rows.append([code, d["il_kodu"], d["il"], d["ilce"], period]
                                 + values(*totals, residents["ilce_kodu"][code], measured["ilce_kodu"].get(code, 0.0)))

        n = provinces[NATIONAL]
        print(f"{period:>6} ({members[0][0]} Q{members[0][1]}-{members[-1][0]} Q{members[-1][1]}): "
              f"{pooled.num_rows:,} tiles, {int(n[1]):,} tests, {n[3] / n[2] / 1000:.1f} Mbps down")

    pq.write_table(pa.concat_tables(tiles), TILES_PATH)
    for path, header, rows in [
        (PROVINCE_PATH, ["il_kodu", "il", "donem"], province_rows),
        (DISTRICT_PATH, ["ilce_kodu", "il_kodu", "il", "ilce", "donem"], district_rows),
    ]:
        with path.open("w", newline="", encoding="utf-8") as out:
            writer = csv.writer(out)
            writer.writerow(header + VALUE_COLUMNS)
            writer.writerows(rows)
    print(f"{len(province_rows)} province rows, {len(district_rows)} district rows, "
          f"{TILES_PATH.stat().st_size / 1e6:.0f} MB tile table")


if __name__ == "__main__":
    main()
