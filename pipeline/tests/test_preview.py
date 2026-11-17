"""Checks that the link-preview image colours speeds the way the site does."""
import math
import re

from pipeline.common import ROOT
from pipeline.preview import BREAKS, RAMP, speed_color


def ts_source(path):
    return (ROOT / "web" / "lib" / path).read_text(encoding="utf-8")


def test_colours_and_breaks_match_the_site():
    dark = re.search(r"dark: \{\s*full: \[([^\]]*)\]", ts_source("colors.ts")).group(1)
    assert RAMP == re.findall(r'"(#[0-9a-f]{6})"', dark)
    download = re.search(r'id: "indirme".*?breaks: \[([^\]]*)\]', ts_source("metrics.ts"), re.DOTALL).group(1)
    assert BREAKS == [int(b) for b in download.split(",")]


def test_a_speed_in_the_middle_of_its_class_takes_that_class_colour():
    # As in web/tests/colors.test.mjs: 50-100 Mbps is class 3, its log-midpoint about 70.7.
    expected = [int(RAMP[3][i:i + 2], 16) for i in (1, 3, 5)]
    assert all(abs(a - b) <= 3 for a, b in zip(speed_color(math.sqrt(50 * 100)), expected, strict=True))


def test_faster_is_lighter():
    lightness = [sum(speed_color(v)) for v in [5, 12, 30, 70, 120, 180, 300, 900]]
    assert lightness == sorted(lightness)
