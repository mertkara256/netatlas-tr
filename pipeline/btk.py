"""Read BTK's provincial yearly statistics from the official Excel file into a tidy CSV.

Source: BTK "Yıllık İl İstatistikleri", bulletin covering 2020-2025
(https://www.btk.gov.tr/yillik-il-istatistikleri).

    uv run python -m pipeline.btk
"""
from __future__ import annotations

import csv

import openpyxl

from .common import PROCESSED_DIR, PROVINCES, RAW_DIR, download, province_code

SOURCE_URL = ("https://www.btk.gov.tr/s3/web-btk-site/7708c26c-5161-4919-8b3d-daa31d4ac8fb/"
              "2026/05/e708565d-ed2c-4863-a0d0-65c5b1755551.xlsx")
XLSX_PATH = RAW_DIR / "btk" / "il_istatistikleri_2020_2025.xlsx"
OUT_PATH = PROCESSED_DIR / "btk_iller.csv"
SHEET = "İl Bazlı Veri"
NATIONAL = "TOPLAM"  # BTK's national totals block, written out as code "00"

# Each value row carries an English label in column C; those labels are stable, so rows are matched on them.
ROWS = {
    "(Population)": "nufus",
    "(Number of Fixed Telephony Access Lines)": "sabit_hat",
    "(Number of Mobile Telephony Subscriptions - Total)": "mobil_abone",
    "(Number of Broadband Subscriptions - Total)": "genisbant",
    "(Number of Fixed Broadband Subscriptions - Total)": "sabit_genisbant",
    "(Fiber)": "fiber",
    "(xDSL)": "xdsl",
    "(Cable)": "kablo",
    "(Other)": "diger",
    "(Number of Mobile Broadband Subscriptions - Total)": "mobil_genisbant",
    "(The Length of Fiber-km)": "fiber_km",
    "(4.5 Mobile Coverage Rates)": "kapsama_45g",
}
FIELDS = list(ROWS.values())
DECIMALS = {"fiber_km": 1, "kapsama_45g": 2}  # everything else is a count


def read_workbook(path) -> dict[str, dict[int, dict[str, float]]]:
    """{plate code or "00": {year: {field: value}}}. Blank cells are left out."""
    sheet = openpyxl.load_workbook(path, read_only=True, data_only=True)[SHEET]
    rows = sheet.iter_rows(values_only=True)
    header = next(rows)
    years = {i: int(v) for i, v in enumerate(header) if isinstance(v, (int, float))}

    data: dict[str, dict[int, dict[str, float]]] = {}
    current = None
    for row in rows:
        if isinstance(row[0], str) and row[0].strip():
            # Column A names the block that follows; "Genel Toplam" and header text map to None.
            current = "00" if row[0].strip() == NATIONAL else province_code(row[0])
        field = ROWS.get(row[2]) if isinstance(row[2], str) else None
        if current is None or field is None:
            continue
        for i, year in years.items():
            if row[i] is not None:
                data.setdefault(current, {}).setdefault(year, {})[field] = float(row[i])
    return data


def format_value(field: str, value: float | None) -> str:
    if value is None:
        return ""
    digits = DECIMALS.get(field)
    return str(round(value, digits)) if digits else str(round(value))


def main() -> None:
    if not XLSX_PATH.exists():
        print(f"downloading {SOURCE_URL}")
        XLSX_PATH.parent.mkdir(parents=True, exist_ok=True)
        XLSX_PATH.write_bytes(download(SOURCE_URL))

    data = read_workbook(XLSX_PATH)
    missing = sorted((set(PROVINCES) | {"00"}) - set(data))
    if missing:
        raise SystemExit(f"not found in the workbook: {missing}")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["il_kodu", "il", "yil", *FIELDS])
        for code in sorted(data):
            name = "Türkiye" if code == "00" else PROVINCES[code]
            for year in sorted(data[code]):
                values = data[code][year]
                writer.writerow([code, name, year, *(format_value(f, values.get(f)) for f in FIELDS)])
    years = sorted({y for d in data.values() for y in d})
    print(f"{len(data) - 1} provinces + national total, {years[0]}-{years[-1]} -> "
          f"{OUT_PATH.relative_to(PROCESSED_DIR.parent.parent)}")


if __name__ == "__main__":
    main()
