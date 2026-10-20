"""Download Türkiye's slice of Ookla's open Speedtest performance tiles.

Only the row groups whose quadkey range overlaps Türkiye are read, so a ~350 MB
global file costs a few dozen MB of transfer.

    uv run python -m pipeline.ookla fixed 2025-4 2026-1 2026-2 2026-3
"""
from __future__ import annotations

import argparse
import sys
import time

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.fs as pafs
import pyarrow.parquet as pq

from .common import RAW_DIR, TR_BBOX, quadkey_prefixes, quadkey_to_tile, tile_center

BUCKET = "ookla-open-data"
COLUMNS = ["quadkey", "avg_d_kbps", "avg_u_kbps", "avg_lat_ms", "tests", "devices"]
PREFIX_ZOOM = 8


def s3_path(kind: str, year: int, quarter: int) -> str:
    month = (quarter - 1) * 3 + 1
    return (f"{BUCKET}/parquet/performance/type={kind}/year={year}/quarter={quarter}/"
            f"{year}-{month:02d}-01_performance_{kind}_tiles.parquet")


def output_path(kind: str, year: int, quarter: int):
    return RAW_DIR / "ookla" / f"{kind}_{year}q{quarter}.parquet"


def fetch(fs: pafs.FileSystem, kind: str, year: int, quarter: int) -> pa.Table:
    pf = pq.ParquetFile(fs.open_input_file(s3_path(kind, year, quarter)))
    meta = pf.metadata
    qk_index = pf.schema_arrow.get_field_index("quadkey")
    prefixes = quadkey_prefixes(TR_BBOX, PREFIX_ZOOM)

    selected = []
    for i in range(meta.num_row_groups):
        stats = meta.row_group(i).column(qk_index).statistics
        if stats is None or not stats.has_min_max:
            selected.append(i)
            continue
        lo, hi = stats.min, stats.max
        if isinstance(lo, bytes):
            lo, hi = lo.decode(), hi.decode()
        if any(lo < p + "4" and hi >= p for p in prefixes):
            selected.append(i)
    print(f"  {meta.num_rows:,} tiles in {meta.num_row_groups} row groups, reading {len(selected)}")

    table = pf.read_row_groups(selected, columns=COLUMNS)
    head = pc.utf8_slice_codeunits(table["quadkey"], 0, PREFIX_ZOOM)
    table = table.filter(pc.is_in(head, value_set=pa.array(prefixes)))

    lons, lats = [], []
    for qk in table["quadkey"].to_pylist():
        lon, lat = tile_center(*quadkey_to_tile(qk))
        lons.append(lon)
        lats.append(lat)
    table = table.append_column("lon", pa.array(lons)).append_column("lat", pa.array(lats))
    lon, lat = table["lon"], table["lat"]
    inside = pc.and_(
        pc.and_(pc.greater_equal(lon, TR_BBOX[0]), pc.less_equal(lon, TR_BBOX[2])),
        pc.and_(pc.greater_equal(lat, TR_BBOX[1]), pc.less_equal(lat, TR_BBOX[3])),
    )
    return table.filter(inside)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("kind", choices=["fixed", "mobile"])
    parser.add_argument("quarters", nargs="+", help="YYYY-Q, e.g. 2026-3")
    parser.add_argument("--force", action="store_true", help="re-download existing files")
    args = parser.parse_args()

    try:
        region = pafs.resolve_s3_region(BUCKET)
    except Exception:
        region = "us-west-2"
    fs = pafs.S3FileSystem(anonymous=True, region=region)

    for spec in args.quarters:
        year, quarter = (int(p) for p in spec.split("-"))
        out = output_path(args.kind, year, quarter)
        if out.exists() and not args.force:
            print(f"{out.name}: already present, skipping")
            continue
        print(f"{args.kind} {year} Q{quarter}")
        started = time.time()
        try:
            table = fetch(fs, args.kind, year, quarter)
        except FileNotFoundError:
            print(f"  not published yet", file=sys.stderr)
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        pq.write_table(table, out)
        print(f"  {table.num_rows:,} tiles, {pc.sum(table['tests']).as_py():,} tests "
              f"-> {out.relative_to(RAW_DIR.parent.parent)} ({time.time() - started:.0f}s)")


if __name__ == "__main__":
    main()
