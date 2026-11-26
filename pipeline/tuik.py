"""Read TÜİK's average household size per province and year from the official Excel file into a tidy CSV.

Source: TÜİK, Adrese Dayalı Nüfus Kayıt Sistemi Sonuçları 2025 bulletin, table "İllere Göre Ortalama Hanehalkı
Büyüklüğü" (https://veriportali.tuik.gov.tr/tr/press/53899). TÜİK's server refuses downloads outside a browser, so
the .xls is saved by hand to data/raw/tuik/ and this step is run by hand, not by the weekly data update.

    uv run --locked python -m pipeline.tuik
"""
from __future__ import annotations

import csv

import xlrd

from .common import PROCESSED_DIR, PROVINCES, RAW_DIR, province_code

SOURCE_PAGE = "https://veriportali.tuik.gov.tr/tr/press/53899"
XLS_PATH = RAW_DIR / "tuik" / "ortalama_hane_buyuklugu_2008_2025.xls"
OUT_PATH = PROCESSED_DIR / "tuik_hane.csv"
NATIONAL = "Toplam-Total"  # TÜİK's row for Türkiye, written out as code "00"


def read_workbook(path) -> dict[str, dict[int, float]]:
    """{plate code or "00": {year: average household size}}. The year header is the first row with numbers after
    its first cell; the rows under it are named in the first cell, and the title and source lines map to None."""
    sheet = xlrd.open_workbook(path).sheet_by_index(0)
    rows = [sheet.row_values(r) for r in range(sheet.nrows)]
    start = next(i for i, row in enumerate(rows) if isinstance(row[1], float))
    years = {i: int(v) for i, v in enumerate(rows[start]) if isinstance(v, float)}

    data: dict[str, dict[int, float]] = {}
    for row in rows[start + 1:]:
        name = str(row[0]).strip()
        code = "00" if name == NATIONAL else province_code(name)
        if code is None:
            continue
        data[code] = {year: float(row[i]) for i, year in years.items()}
    return data


def main() -> None:
    if not XLS_PATH.exists():
        raise SystemExit(f"{XLS_PATH} is missing: download the table from {SOURCE_PAGE} with a browser")
    data = read_workbook(XLS_PATH)
    missing = sorted((set(PROVINCES) | {"00"}) - set(data))
    if missing:
        raise SystemExit(f"not found in the workbook: {missing}")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["il_kodu", "yil", "ortalama_hane_buyuklugu"])
        for code in sorted(data):
            for year, size in sorted(data[code].items()):
                writer.writerow([code, year, round(size, 4)])
    years = sorted({y for d in data.values() for y in d})
    print(f"{len(data) - 1} provinces + Türkiye, {years[0]}-{years[-1]} -> {OUT_PATH.relative_to(PROCESSED_DIR.parent.parent)}")


if __name__ == "__main__":
    main()
