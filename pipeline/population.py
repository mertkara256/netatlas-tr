"""Residents on Ookla's tile grid, from WorldPop's population grid for Türkiye.

"Gridded population estimates for Turkey using UN COD-PS estimates 2021, version 1.0" (WorldPop,
University of Southampton; CC BY 4.0) takes each district's 2021 population from TÜİK's address
based register and spreads it over the cells mapped as settled, by built-up surface. A cell is
3 arc-seconds, about 90 m by 70 m at Türkiye's latitude. Each cell is added to the zoom-16 Web
Mercator tile holding its centre, the grid the speed data comes on, so a later step can say how
many people live where speeds were measured.

    uv run python -m pipeline.population

Output:
    data/processed/nufus_kareler.parquet   residents per tile, for tiles with residents (not in git)
"""
from __future__ import annotations

import io
import zipfile

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import rasterio

from .common import PROCESSED_DIR, RAW_DIR, download, tile_to_quadkey
from .ookla import TILE_ZOOM

SOURCE_URL = "https://data.worldpop.org/repo/wopr/TUR/v1/constrained/100m/tur_population_2021_100m_constrained_v1.zip"
MEMBER = "tur_population_2021_100m_constrained_v1/TUR_pop_2021_constrained_100m_v1.tif"
SOURCE_PATH = RAW_DIR / "worldpop" / "TUR_pop_2021_constrained_100m_v1.tif"
OUT_PATH = PROCESSED_DIR / "nufus_kareler.parquet"


def tile_ids(lon: np.ndarray, lat: np.ndarray) -> np.ndarray:
    """y * 2^16 + x of the zoom-16 tile holding each point, as common.lonlat_to_tile finds it."""
    n = 2 ** TILE_ZOOM
    x = np.floor((lon + 180.0) / 360.0 * n).astype(np.int64)
    y = np.floor((1.0 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2.0 * n).astype(np.int64)
    return y * n + x


def read_cells() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Longitude, latitude and residents of every settled cell."""
    with rasterio.open(SOURCE_PATH) as src:
        people = src.read(1)
        transform = src.transform
    rows, columns = np.nonzero(people > 0)  # unsettled cells hold a large negative number
    lon = transform.c + (columns + 0.5) * transform.a
    lat = transform.f + (rows + 0.5) * transform.e
    return lon, lat, people[rows, columns].astype(np.float64)


def tile_population(lon: np.ndarray, lat: np.ndarray, people: np.ndarray) -> pa.Table:
    tiles, index = np.unique(tile_ids(lon, lat), return_inverse=True)
    totals = np.bincount(index, weights=people)
    n = 2 ** TILE_ZOOM
    quadkeys = [tile_to_quadkey(int(t % n), int(t // n), TILE_ZOOM) for t in tiles]
    return pa.table({"quadkey": quadkeys, "nufus": totals}).sort_by("quadkey")


def main() -> None:
    if not SOURCE_PATH.exists():
        print(f"downloading {SOURCE_URL}")
        SOURCE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(io.BytesIO(download(SOURCE_URL))) as z:
            SOURCE_PATH.write_bytes(z.read(MEMBER))
    table = tile_population(*read_cells())
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, OUT_PATH)
    print(f"{table.num_rows:,} tiles with {np.sum(table['nufus'].to_numpy()):,.0f} residents -> "
          f"{OUT_PATH.relative_to(PROCESSED_DIR.parent.parent)}")


if __name__ == "__main__":
    main()
