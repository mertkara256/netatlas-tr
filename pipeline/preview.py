"""The link-preview image: the latest period's heat map with the site's title.

Chat apps and social sites show it beside a shared link to the site. It is drawn the way the map
draws cells: each pixel is one Web Mercator tile at level 14 (about 1.9 km, four by four of Ookla's
squares), coloured with the device-weighted mean download speed of the measured squares inside it, in
the site's dark-theme colours. Pixels with no measured square stay empty, and neighbouring pixels
are never blended, so a colour is always a measured value.

    uv run python -m pipeline.preview      (after pipeline.boundaries, pipeline.build and pipeline.tiles)

Output: web/app/opengraph-image.png (1200 x 630, in git; Next.js adds it to every page's metadata).
"""
from __future__ import annotations

import json
import math

import numpy as np
import pyarrow.compute as pc
import pyarrow.parquet as pq
import shapely
from PIL import Image, ImageDraw, ImageFont

from .boundaries import PROVINCES_PATH
from .build import TILES_PATH
from .common import ROOT, quadkey_to_tile
from .tiles import OUT_DIR

OUT_PATH = ROOT / "web" / "app" / "opengraph-image.png"
WIDTH, HEIGHT = 1200, 630
LEVEL = 14  # one pixel per tile at this level
SQUARE_LEVEL = 16
SUPERSAMPLE = 4  # borders and the land are drawn this much larger, then shrunk, for smooth edges

# The site's dark theme (web/app/globals.css) and its speed colours (web/lib/colors.ts, RAMPS.dark.full,
# and the download breaks in web/lib/metrics.ts); a test checks they still match.
PAGE = "#0d0d0d"
LAND = "#1a1a19"
INK = "#f0efec"
INK_2 = "#c3c2b7"
MUTED = "#9a9890"
BORDER = (255, 255, 255, 64)
RAMP = ["#184f95", "#2265b8", "#2f7ddb", "#5497e7", "#7db1ee", "#a6c9f5", "#cde2fb"]
BREAKS = [10, 25, 50, 100, 200, 400]

# The operating system's sans-serif, as on the site: Helvetica on macOS, DejaVu Sans on Linux.
FONTS = [
    ("/System/Library/Fonts/Helvetica.ttc", 0, "/System/Library/Fonts/Helvetica.ttc", 1),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 0, "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 0),
]


# --- Colours: a port of areaColor() for download speeds -------------------------------------------

def _to_lab(color: str) -> np.ndarray:
    rgb = np.array([int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    lms = np.cbrt(np.array([
        [0.4122214708, 0.5363325363, 0.0514459929],
        [0.2119034982, 0.6806995451, 0.1073969566],
        [0.0883024619, 0.2817188376, 0.6299787005],
    ]) @ linear)
    return np.array([
        [0.2104542553, 0.793617785, -0.0040720468],
        [1.9779984951, -2.428592205, 0.4505937099],
        [0.0259040371, 0.7827717662, -0.808675766],
    ]) @ lms


def _to_rgb(lab: np.ndarray) -> tuple[int, int, int]:
    lms = (np.array([
        [1, 0.3963377774, 0.2158037573],
        [1, -0.1055613458, -0.0638541728],
        [1, -0.0894841775, -1.291485548],
    ]) @ lab) ** 3
    linear = np.array([
        [4.0767416621, -3.3077115913, 0.2309699292],
        [-1.2684380046, 2.6097574011, -0.3413193965],
        [-0.0041960863, -0.7034186147, 1.707614701],
    ]) @ lms
    srgb = np.where(linear <= 0.0031308, 12.92 * linear, 1.055 * np.abs(linear) ** (1 / 2.4) - 0.055)
    return tuple(round(min(1, max(0, c)) * 255) for c in srgb)


def ramp_color(x: float) -> tuple[int, int, int]:
    """The ramp's colour at x (0-1 along the legend), blended in OKLab between its two nearest colours."""
    p = min(len(RAMP) - 1, max(0, x * len(RAMP) - 0.5))
    i = min(len(RAMP) - 2, math.floor(p))
    a, b = _to_lab(RAMP[i]), _to_lab(RAMP[i + 1])
    return _to_rgb(a + (b - a) * (p - i))


def speed_color(mbps: float) -> tuple[int, int, int]:
    """The colour the site gives a download speed: log-linear between the breaks, open-ended classes
    at both ends as wide as their neighbours."""
    logs = [math.log(b) for b in BREAKS]
    edges = [2 * logs[0] - logs[1], *logs, 2 * logs[-1] - logs[-2]]
    v = math.log(max(mbps, 0.01))
    if v <= edges[0]:
        position = 0.0
    elif v >= edges[-1]:
        position = len(edges) - 1
    else:
        i = max(j for j in range(len(edges) - 1) if v >= edges[j])
        position = i + (v - edges[i]) / (edges[i + 1] - edges[i])
    return ramp_color(position / (len(BREAKS) + 1))


# --- Drawing ---------------------------------------------------------------------------------------

def mercator(lon: np.ndarray, lat: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Degrees -> tile coordinates at LEVEL (a tile's pixel is its integer part)."""
    n = 2 ** LEVEL
    r = np.radians(lat)
    return (lon + 180) / 360 * n, (1 - np.log(np.tan(r) + 1 / np.cos(r)) / math.pi) / 2 * n


def province_rings() -> list[np.ndarray]:
    """Every province's outer and inner rings, simplified below a pixel, in tile coordinates."""
    features = json.loads(PROVINCES_PATH.read_text(encoding="utf-8"))["features"]
    shapes = shapely.simplify(shapely.from_geojson([json.dumps(f["geometry"]) for f in features]), 0.002)
    rings = []
    for polygon in shapely.get_parts(shapes):
        for ring in [polygon.exterior, *polygon.interiors]:
            lon, lat = np.asarray(ring.coords).T
            rings.append(np.column_stack(mercator(lon, lat)))
    return rings


def speed_pixels(period: str) -> dict[tuple[int, int], float]:
    """(x, y) of each level-14 tile with a measured square -> its squares' device-weighted mean download,
    as the map's cells pool them (tiles.py)."""
    table = pq.read_table(TILES_PATH, columns=["donem", "quadkey", "cihaz", "indirme_mbps"])
    table = table.filter(pc.equal(table["donem"], period))
    shift = SQUARE_LEVEL - LEVEL
    sums: dict[tuple[int, int], list[float]] = {}
    for quadkey, devices, mbps in zip(*(table[c].to_pylist() for c in ["quadkey", "cihaz", "indirme_mbps"]), strict=True):
        x, y, _ = quadkey_to_tile(quadkey)
        total = sums.setdefault((x >> shift, y >> shift), [0.0, 0])
        total[0] += devices * mbps
        total[1] += devices
    return {pixel: weighted / devices for pixel, (weighted, devices) in sums.items()}


def fonts(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    for regular, regular_index, heavy, heavy_index in FONTS:
        path, index = (heavy, heavy_index) if bold else (regular, regular_index)
        try:
            return ImageFont.truetype(path, size, index=index)
        except OSError:
            continue
    raise SystemExit("No sans-serif font found; add one to FONTS in pipeline/preview.py")


def draw(period: dict) -> Image.Image:
    rings = province_rings()
    pixels = speed_pixels(period["id"])

    # Frame Türkiye in the space under the title: whole pixels, centred.
    xs = np.concatenate([r[:, 0] for r in rings])
    ys = np.concatenate([r[:, 1] for r in rings])
    map_top, map_bottom = 168, HEIGHT - 76
    left = math.floor((xs.min() + xs.max()) / 2) - WIDTH // 2
    top = math.floor((ys.min() + ys.max()) / 2) - (map_top + map_bottom) // 2

    image = Image.new("RGB", (WIDTH, HEIGHT), PAGE)

    # Land, then the measured pixels, then the province borders over them.
    s = SUPERSAMPLE
    land = Image.new("L", (WIDTH * s, HEIGHT * s), 0)
    borders = Image.new("L", (WIDTH * s, HEIGHT * s), 0)
    land_draw, border_draw = ImageDraw.Draw(land), ImageDraw.Draw(borders)
    for ring in rings:
        points = [((x - left) * s, (y - top) * s) for x, y in ring]
        land_draw.polygon(points, fill=255)
        border_draw.line(points, fill=255, width=s)
    land = land.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    image.paste(Image.new("RGB", (WIDTH, HEIGHT), LAND), mask=land)

    colors = {}
    for (x, y), mbps in pixels.items():
        bucket = round(mbps, 1)
        if bucket not in colors:
            colors[bucket] = speed_color(bucket)
        if 0 <= x - left < WIDTH and 0 <= y - top < HEIGHT:
            image.putpixel((x - left, y - top), colors[bucket])

    alpha = borders.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS).point(lambda v: v * BORDER[3] // 255)
    image.paste(Image.new("RGB", (WIDTH, HEIGHT), BORDER[:3]), mask=alpha)

    # Title, subtitle, and a legend with the period and the source along the bottom.
    text = ImageDraw.Draw(image)
    text.text((64, 52), "NetAtlas TR", font=fonts(68, bold=True), fill=INK)
    text.text((66, 132), "Türkiye'nin ev interneti, milyonlarca hız testiyle", font=fonts(30), fill=INK_2)

    bar_left, bar_top, bar_width, bar_height = 66, HEIGHT - 50, 260, 10
    for i in range(bar_width):
        text.line([(bar_left + i, bar_top), (bar_left + i, bar_top + bar_height)], fill=ramp_color(i / (bar_width - 1)))
    small = fonts(17)
    for i, b in enumerate(BREAKS):
        x = bar_left + (i + 1) / (len(BREAKS) + 1) * bar_width
        text.text((x, bar_top + bar_height + 6), str(b), font=small, fill=MUTED, anchor="mt")
    text.text((bar_left + bar_width + 16, bar_top + bar_height / 2), f"İndirme hızı, Mbps · {period['ad']} ({period['aralik']})",
              font=small, fill=INK_2, anchor="lm")
    text.text((WIDTH - 64, bar_top + bar_height / 2), "Speedtest® by Ookla® açık verisi", font=small, fill=MUTED, anchor="rm")
    return image


def main() -> None:
    periods = json.loads((OUT_DIR / "iller.json").read_text(encoding="utf-8"))["donemler"]
    draw(periods[-1]).save(OUT_PATH, optimize=True)
    print(f"wrote {OUT_PATH.relative_to(ROOT)} ({OUT_PATH.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
