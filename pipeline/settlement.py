"""Settlement type of every place: yoğun kent, orta yoğun kent or kır, TÜİK's names for the degree of
urbanisation (Eurostat), worked out on the resident grid population.py makes.

A cell is a zoom-15 Web Mercator tile, 2x2 of Ookla's squares and about 0.9 km wide in Türkiye. Its
residents are those of its four squares, its density those residents per km² of its area on the sphere.

- yoğun kent: cells of at least 1,500 residents per km² joined through shared edges (4 neighbours), in
  clusters of at least 50,000 residents;
- orta yoğun kent: cells of at least 300 per km² joined through shared edges or corners (8 neighbours), in
  clusters of at least 5,000, other than yoğun kent; such a cluster counts the yoğun kent cells in it;
- kır: every other cell, with or without residents.

This is close to the official method, not the same: Eurostat uses 1 km cells of an equal-area grid and also
fills gaps in yoğun kent (a cell joins when 5 of its 8 neighbours are in it). Filling gaps here moved
Türkiye's shares by less than a point. Of Türkiye's residents as build.py counts them, WorldPop's 2021 grid
puts 65.3% in yoğun kent, 19.3% in orta yoğun kent and 15.5% in kır (TÜİK 2025: 67.5%, 15.8%, 16.8%).

Every square of the grid counts, also those build.py leaves out for holding under a fifth Turkish land:
their residents live in the towns along the coast and the borders.
"""
from __future__ import annotations

import numpy as np
import pyarrow as pa
import pyarrow.compute as pc

from .common import quadkey_to_tile

CELL_ZOOM = 15
EARTH_RADIUS_KM = 6371.0088  # mean radius
# Residents per km² of a cell, and residents of a cluster of such cells.
DENSE, DENSE_CLUSTER = 1500, 50_000
SEMI_DENSE, SEMI_DENSE_CLUSTER = 300, 5_000
TYPES = ["yogun_kent", "orta_yogun_kent", "kir"]
DENSE_TYPE, SEMI_DENSE_TYPE, RURAL = TYPES
EDGES = [(1, 0), (-1, 0), (0, 1), (0, -1)]
CORNERS = [(1, 1), (1, -1), (-1, 1), (-1, -1)]


def cell_area(y: np.ndarray) -> np.ndarray:
    """Area in km² on the sphere of zoom-15 tiles in row y; a row's tiles all have the same area."""
    n = 2 ** CELL_ZOOM
    north = np.arctan(np.sinh(np.pi * (1 - 2 * y / n)))
    south = np.arctan(np.sinh(np.pi * (1 - 2 * (y + 1) / n)))
    return EARTH_RADIUS_KM ** 2 * (2 * np.pi / n) * (np.sin(north) - np.sin(south))


def cluster_residents(xy: list[tuple[int, int]], residents: np.ndarray, member: np.ndarray,
                      steps: list[tuple[int, int]]) -> np.ndarray:
    """For each member cell, the residents of its cluster: the member cells reached from it one step at a
    time. Other cells get 0."""
    index = {cell: i for i, cell in enumerate(xy) if member[i]}
    totals = np.zeros(len(xy))
    seen = np.zeros(len(xy), dtype=bool)
    for start in index.values():
        if seen[start]:
            continue
        seen[start] = True
        cluster, stack = [start], [start]
        while stack:
            x, y = xy[stack.pop()]
            for dx, dy in steps:
                j = index.get((x + dx, y + dy))
                if j is not None and not seen[j]:
                    seen[j] = True
                    cluster.append(j)
                    stack.append(j)
        totals[cluster] = residents[cluster].sum()
    return totals


def cell_types(population: pa.Table) -> dict[str, str]:
    """The type of every cell with residents, by its quadkey, from a table of zoom-16 squares and their
    residents (quadkey, nufus)."""
    cells = (population.append_column("hucre", pc.utf8_slice_codeunits(population["quadkey"], 0, CELL_ZOOM))
             .group_by("hucre").aggregate([("nufus", "sum")]))
    quadkeys = cells["hucre"].to_pylist()
    residents = cells["nufus_sum"].to_numpy()
    xy = [quadkey_to_tile(q)[:2] for q in quadkeys]
    density = residents / cell_area(np.array([y for _, y in xy]))
    dense = density >= DENSE
    dense &= cluster_residents(xy, residents, dense, EDGES) >= DENSE_CLUSTER
    semi_dense = ~dense & (cluster_residents(xy, residents, density >= SEMI_DENSE, EDGES + CORNERS) >= SEMI_DENSE_CLUSTER)
    types = np.where(dense, DENSE_TYPE, np.where(semi_dense, SEMI_DENSE_TYPE, RURAL))
    return dict(zip(quadkeys, types.tolist(), strict=True))


def tile_types(quadkeys: pa.Array | pa.ChunkedArray, types: dict[str, str]) -> pa.Array:
    """The type of each zoom-16 square: its cell's, kır where the cell has no residents."""
    return pa.array([types.get(cell, RURAL) for cell in pc.utf8_slice_codeunits(quadkeys, 0, CELL_ZOOM).to_pylist()])
