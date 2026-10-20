"""Join Ookla tiles, BTK provincial statistics and province boundaries into the map's data files.

    uv run python -m pipeline.build

Outputs:
    web/data/iller.geojson   province shapes (code + name only)
    web/data/iller.json      per-province metrics, national figures and metadata
    web/data/hucreler.json   ~2.4 km speed cells for the zoomed-in layer
    data/processed/iller_ozet.csv  the same per-province metrics as a flat table
"""
from __future__ import annotations

import csv
import json
from datetime import date

import numpy as np
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq
import shapely

from .common import PROCESSED_DIR, RAW_DIR, WEB_DATA_DIR, PROVINCES, quadkey_to_tile, tile_bounds

CURRENT = [(2025, 4), (2026, 1), (2026, 2), (2026, 3)]
BASELINE = [(2019, 1), (2019, 2), (2019, 3), (2019, 4)]
BTK_YEARS = list(range(2020, 2026))
CELL_ZOOM = 14            # ~2.4 km cells for the detail layer
MIN_CELL_TESTS = 10       # pooled over the four quarters
# A tile counts for Türkiye when at least this share of it is Turkish land. Coastal tiles
# whose centre is offshore stay in; tiles across a land border (e.g. Qamishli) stay out.
MIN_LAND_SHARE = 0.2
# Reliability is judged on pooled test counts; see README for the reasoning.
RELIABILITY = [(10_000, "yuksek"), (2_000, "orta"), (0, "dusuk")]


def load_period(quarters: list[tuple[int, int]]) -> dict[str, np.ndarray]:
    """Pool several quarters per tile: summed tests and test-weighted metric totals."""
    parts = []
    for year, quarter in quarters:
        path = RAW_DIR / "ookla" / f"fixed_{year}q{quarter}.parquet"
        if not path.exists():
            raise SystemExit(f"{path} is missing - run pipeline.ookla first")
        t = pq.read_table(path)
        tests = pc.cast(t["tests"], pa.float64())
        lat_ok = pc.is_valid(t["avg_lat_ms"])
        parts.append(pa.table({
            "quadkey": pc.cast(t["quadkey"], pa.string()),
            "lon": t["lon"],
            "lat": t["lat"],
            "tests": tests,
            "d_sum": pc.multiply(pc.cast(t["avg_d_kbps"], pa.float64()), tests),
            "u_sum": pc.multiply(pc.cast(t["avg_u_kbps"], pa.float64()), tests),
            "lat_sum": pc.if_else(lat_ok, pc.multiply(pc.cast(t["avg_lat_ms"], pa.float64()), tests), 0.0),
            "lat_tests": pc.if_else(lat_ok, tests, 0.0),
        }))
    pooled = pa.concat_tables(parts).group_by("quadkey").aggregate([
        ("lon", "min"), ("lat", "min"), ("tests", "sum"), ("d_sum", "sum"),
        ("u_sum", "sum"), ("lat_sum", "sum"), ("lat_tests", "sum"),
    ])
    out = {"quadkey": np.array(pooled["quadkey"].to_pylist(), dtype=object)}
    for name in ("lon", "lat"):
        out[name] = pooled[f"{name}_min"].to_numpy()
    for name in ("tests", "d_sum", "u_sum", "lat_sum", "lat_tests"):
        out[name] = pooled[f"{name}_sum"].to_numpy()
    return out


def assign_provinces(tiles: dict[str, np.ndarray], polygons: np.ndarray, tree: shapely.STRtree) -> np.ndarray:
    """Index of the province holding most of each tile's land, or -1 outside Türkiye."""
    bounds = np.array([tile_bounds(*quadkey_to_tile(qk)) for qk in tiles["quadkey"]])
    boxes = shapely.box(bounds[:, 0], bounds[:, 1], bounds[:, 2], bounds[:, 3])
    owner = np.full(len(boxes), -1)

    # Most tiles sit fully inside one province; only edge tiles need area maths.
    box_i, poly_i = tree.query(boxes, predicate="within")
    owner[box_i] = poly_i
    edge = np.flatnonzero(owner < 0)
    box_i, poly_i = tree.query(boxes[edge], predicate="intersects")
    share = shapely.area(shapely.intersection(boxes[edge][box_i], polygons[poly_i])) / shapely.area(boxes[edge][box_i])

    best: dict[int, tuple[int, float]] = {}
    total: dict[int, float] = {}
    for b, p, s in zip(box_i, poly_i, share):
        total[b] = total.get(b, 0.0) + s
        if s > best.get(b, (-1, 0.0))[1]:
            best[b] = (p, s)
    kept = [b for b in best if total[b] >= MIN_LAND_SHARE]
    owner[edge[kept]] = [best[b][0] for b in kept]

    inside = owner >= 0
    print(f"  {len(boxes):,} tiles in the box; {inside.sum():,} in Türkiye "
          f"({len(kept):,} on a coast or border), {tiles['tests'][inside].sum() / tiles['tests'].sum():.1%} of tests")
    return owner


def weighted_median(values: np.ndarray, weights: np.ndarray) -> float:
    order = np.argsort(values)
    cum = np.cumsum(weights[order])
    return float(values[order][np.searchsorted(cum, cum[-1] / 2)])


def speed_stats(tiles: dict[str, np.ndarray], mask: np.ndarray) -> dict | None:
    tests = tiles["tests"][mask]
    total = tests.sum()
    if total == 0:
        return None
    tile_mean = tiles["d_sum"][mask] / tests
    lat_tests = tiles["lat_tests"][mask].sum()
    return {
        "tests": int(total),
        "tiles": int(mask.sum()),
        "down": round(tiles["d_sum"][mask].sum() / total / 1000, 1),
        "up": round(tiles["u_sum"][mask].sum() / total / 1000, 1),
        "latency": round(tiles["lat_sum"][mask].sum() / lat_tests, 1) if lat_tests else None,
        "down_tile_median": round(weighted_median(tile_mean, tests) / 1000, 1),
        "share_100": round(tests[tile_mean >= 100_000].sum() / total, 3),
    }


def load_btk() -> dict[str, dict[int, dict[str, float]]]:
    data: dict[str, dict[int, dict[str, float]]] = {}
    with (PROCESSED_DIR / "btk_iller.csv").open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            values = {k: float(v) for k, v in row.items() if k not in ("il_kodu", "il", "yil") and v != ""}
            data.setdefault(row["il_kodu"], {})[int(row["yil"])] = values
    return data


def access_stats(years: dict[int, dict[str, float]]) -> dict:
    def per_100(y):
        return years[y]["sabit_genisbant"] / years[y]["nufus"] * 100

    def share(y, field):
        return years[y].get(field, 0.0) / years[y]["sabit_genisbant"]

    last = BTK_YEARS[-1]
    cur = years[last]
    return {
        "population": int(cur["nufus"]),
        "fixed_subs": int(cur["sabit_genisbant"]),
        "fixed_per_100": round(per_100(last), 2),
        "fiber_share": round(share(last, "fiber"), 3),
        "xdsl_share": round(share(last, "xdsl"), 3),
        "cable_share": round(share(last, "kablo"), 3),
        "fiber_km_per_1000": round(cur.get("fiber_km", 0.0) / cur["nufus"] * 1000, 2),
        "coverage_45g": cur.get("kapsama_45g"),
        "trend": {
            "years": BTK_YEARS,
            "fixed_per_100": [round(per_100(y), 2) for y in BTK_YEARS],
            "fiber_share": [round(share(y, "fiber"), 3) for y in BTK_YEARS],
        },
    }


def reliability(tests: int) -> str:
    return next(label for floor, label in RELIABILITY if tests >= floor)


def build_cells(tiles: dict[str, np.ndarray], owner: np.ndarray) -> list[list[float]]:
    inside = owner >= 0
    table = pa.table({
        "cell": pc.utf8_slice_codeunits(pa.array(tiles["quadkey"][inside], pa.string()), 0, CELL_ZOOM),
        "tests": tiles["tests"][inside],
        "d_sum": tiles["d_sum"][inside],
    }).group_by("cell").aggregate([("tests", "sum"), ("d_sum", "sum")])
    cells = []
    for qk, tests, d_sum in zip(table["cell"].to_pylist(), table["tests_sum"].to_pylist(),
                                table["d_sum_sum"].to_pylist()):
        if tests >= MIN_CELL_TESTS:
            x, y, _ = quadkey_to_tile(qk)
            cells.append([x, y, round(d_sum / tests / 1000), int(tests)])
    cells.sort()
    return cells


def web_geometry(geom) -> dict:
    geom = shapely.set_precision(shapely.simplify(geom, 0.002, preserve_topology=True), 0.0001)
    return json.loads(shapely.to_geojson(geom))


def quarter_label(quarters: list[tuple[int, int]]) -> str:
    (y0, q0), (y1, q1) = quarters[0], quarters[-1]
    return f"{y0} Ç{q0} – {y1} Ç{q1}" if (y0, q0) != (y1, q1) else f"{y0} Ç{q0}"


def main() -> None:
    def read_shapes(name: str) -> dict:
        data = json.loads((RAW_DIR / name).read_text(encoding="utf-8"))
        return {f["properties"]["il_kodu"]: shapely.geometry.shape(f["geometry"]) for f in data["features"]}

    detailed = read_shapes("tr_iller.geojson")
    simplified = read_shapes("tr_iller_sade.geojson")
    codes = sorted(detailed)
    polygons = np.array([detailed[c] for c in codes], dtype=object)
    shapely.prepare(polygons)
    tree = shapely.STRtree(polygons)

    print("current period")
    current = load_period(CURRENT)
    owner_now = assign_provinces(current, polygons, tree)
    print("baseline period")
    baseline = load_period(BASELINE)
    owner_base = assign_provinces(baseline, polygons, tree)

    btk = load_btk()
    provinces = {}
    for i, code in enumerate(codes):
        now = speed_stats(current, owner_now == i)
        base = speed_stats(baseline, owner_base == i)
        access = access_stats(btk[code])
        provinces[code] = {
            "code": code,
            "name": PROVINCES[code],
            **access,
            "speed": now,
            "speed_2019": base,
            "growth": round(now["down"] / base["down"], 2) if now and base else None,
            "tests_per_1000": round(now["tests"] / access["population"] * 1000, 2) if now else None,
            "reliability": reliability(now["tests"]) if now else "dusuk",
        }

    nat_now = speed_stats(current, owner_now >= 0)
    nat_base = speed_stats(baseline, owner_base >= 0)
    national = {
        **access_stats(btk["00"]),
        "speed": nat_now,
        "speed_2019": nat_base,
        "growth": round(nat_now["down"] / nat_base["down"], 2),
    }

    cells = build_cells(current, owner_now)
    meta = {
        "generated": date.today().isoformat(),
        "speed_period": quarter_label(CURRENT),
        "baseline_period": quarter_label(BASELINE),
        "btk_year": BTK_YEARS[-1],
        "cell_zoom": CELL_ZOOM,
        "min_cell_tests": MIN_CELL_TESTS,
        "reliability_floors": {label: floor for floor, label in RELIABILITY},
    }

    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    shapes = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"code": code, "name": PROVINCES[code]},
         "geometry": web_geometry(simplified[code])}
        for code in codes
    ]}
    (WEB_DATA_DIR / "iller.geojson").write_text(json.dumps(shapes, ensure_ascii=False, separators=(",", ":")),
                                                encoding="utf-8")
    (WEB_DATA_DIR / "iller.json").write_text(
        json.dumps({"meta": meta, "national": national, "provinces": provinces},
                   ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (WEB_DATA_DIR / "hucreler.json").write_text(
        json.dumps({"zoom": CELL_ZOOM, "cells": cells}, separators=(",", ":")), encoding="utf-8")

    with (PROCESSED_DIR / "iller_ozet.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["il_kodu", "il", "nufus", "sabit_abone_100_kisi", "fiber_payi", "xdsl_payi",
                         "fiber_km_1000_kisi", "ort_indirme_mbps", "ort_yukleme_mbps", "gecikme_ms",
                         "test_sayisi", "ort_indirme_2019_mbps", "artis_kat", "guvenilirlik"])
        for code in sorted(provinces):
            p = provinces[code]
            s, b = p["speed"] or {}, p["speed_2019"] or {}
            writer.writerow([code, p["name"], p["population"], p["fixed_per_100"], p["fiber_share"],
                             p["xdsl_share"], p["fiber_km_per_1000"], s.get("down"), s.get("up"),
                             s.get("latency"), s.get("tests"), b.get("down"), p["growth"], p["reliability"]])

    tests = sorted(p["speed"]["tests"] for p in provinces.values() if p["speed"])
    print(f"national: {nat_now['down']} Mbps now vs {nat_base['down']} Mbps in 2019 "
          f"({national['growth']}x), {nat_now['tests']:,} tests")
    print(f"tests per province: min {tests[0]:,}, median {tests[len(tests) // 2]:,}, max {tests[-1]:,}")
    print(f"reliability: " + ", ".join(
        f"{label} {sum(p['reliability'] == label for p in provinces.values())}" for _, label in RELIABILITY))
    print(f"{len(cells):,} detail cells")
    for name in ("iller.geojson", "iller.json", "hucreler.json"):
        print(f"  web/data/{name}: {(WEB_DATA_DIR / name).stat().st_size / 1024:,.0f} KB")


if __name__ == "__main__":
    main()
