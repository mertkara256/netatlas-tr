"""Türkiye's slice of Ookla's open fixed-broadband Speedtest data, every published quarter.

Ookla publishes one global file per quarter (Speedtest by Ookla Open Data, CC BY-NC-SA 4.0)
with zoom-16 Web Mercator tiles, about 475 m across at Türkiye's latitude. Only the needed
columns and the row groups whose quadkeys can fall around Türkiye are read. The 2019 files
and 2021 Q3 are a single row group each, so they cost 80-120 MB; the others 10-35 MB.

    uv run python -m pipeline.ookla

Quarters already on disk are skipped, so a rerun only fetches newly published ones.

Output:
    data/raw/ookla/fixed_YYYYqQ.parquet   tiles in a box around Türkiye (not in git); exact
                                          assignment to provinces happens in a later step
"""
from __future__ import annotations

import re
import time

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.fs as pafs
import pyarrow.parquet as pq

from .common import RAW_DIR, lonlat_to_tile, quadkey_to_tile, tile_to_quadkey

SOURCE_DIR = "ookla-open-data/parquet/performance/type=fixed"
REGION = "us-west-2"
COLUMNS = ["quadkey", "avg_d_kbps", "avg_u_kbps", "avg_lat_ms", "tests", "devices"]
OUT_DIR = RAW_DIR / "ookla"
# (west, south, east, north): Türkiye plus a small margin.
TR_BBOX = (25.5, 35.7, 45.0, 42.2)
TILE_ZOOM = 16
PREFIX_ZOOM = 8  # row groups and rows are first narrowed by quadkey prefix at this zoom


def output_path(year: int, quarter: int):
    return OUT_DIR / f"fixed_{year}q{quarter}.parquet"


def tile_range(zoom: int) -> tuple[int, int, int, int]:
    """(x_min, x_max, y_min, y_max) of the tiles covering TR_BBOX."""
    x0, y1 = lonlat_to_tile(TR_BBOX[0], TR_BBOX[1], zoom)
    x1, y0 = lonlat_to_tile(TR_BBOX[2], TR_BBOX[3], zoom)
    return x0, x1, y0, y1


def quadkey_prefixes(zoom: int) -> list[str]:
    x0, x1, y0, y1 = tile_range(zoom)
    return sorted(tile_to_quadkey(x, y, zoom) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1))


def published_quarters(fs: pafs.FileSystem) -> dict[tuple[int, int], str]:
    found = {}
    for info in fs.get_file_info(pafs.FileSelector(SOURCE_DIR, recursive=True)):
        m = re.search(r"year=(\d{4})/quarter=(\d)/[^/]+\.parquet$", info.path)
        if m:
            found[int(m[1]), int(m[2])] = info.path
    return found


def fetch(fs: pafs.FileSystem, path: str) -> pa.Table:
    pf = pq.ParquetFile(fs.open_input_file(path))
    qk = pf.schema_arrow.get_field_index("quadkey")
    prefixes = quadkey_prefixes(PREFIX_ZOOM)

    # Files are sorted by quadkey; prefix p covers the keys from p up to p + "4".
    groups = []
    for i in range(pf.metadata.num_row_groups):
        stats = pf.metadata.row_group(i).column(qk).statistics
        if any(stats.min < p + "4" and stats.max >= p for p in prefixes):
            groups.append(i)
    table = pf.read_row_groups(groups, columns=COLUMNS)
    # Newer files store quadkeys as large_string.
    table = table.set_column(0, "quadkey", pc.cast(table["quadkey"], pa.string()))
    head = pc.utf8_slice_codeunits(table["quadkey"], 0, PREFIX_ZOOM)
    table = table.filter(pc.is_in(head, value_set=pa.array(prefixes)))

    x0, x1, y0, y1 = tile_range(TILE_ZOOM)
    inside = []
    for quadkey in table["quadkey"].to_pylist():
        x, y, _ = quadkey_to_tile(quadkey)
        inside.append(x0 <= x <= x1 and y0 <= y <= y1)
    return table.filter(pa.array(inside))


def main() -> None:
    fs = pafs.S3FileSystem(anonymous=True, region=REGION)
    quarters = published_quarters(fs)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for (year, quarter), path in sorted(quarters.items()):
        out = output_path(year, quarter)
        if out.exists():
            continue
        started = time.time()
        table = fetch(fs, path)
        pq.write_table(table, out)
        print(f"{year} Q{quarter}: {table.num_rows:,} tiles, {pc.sum(table['tests']).as_py():,} tests "
              f"({time.time() - started:.0f}s)", flush=True)
    latest = max(quarters)
    print(f"{len(quarters)} quarters published, latest {latest[0]} Q{latest[1]}")


if __name__ == "__main__":
    main()
