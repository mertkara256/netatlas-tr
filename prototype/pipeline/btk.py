"""Parse BTK's provincial yearly statistics bulletin into a tidy CSV.

Source: "Elektronik Haberleşme Sektörüne İlişkin İl Bazlı Yıllık İstatistik Bülteni 2026"
(2020-2025, one page per province). Text is extracted with poppler's `pdftotext -layout`;
each number is assigned to the year column it sits under, so blank cells stay blank.

    uv run python -m pipeline.btk
"""
from __future__ import annotations

import csv
import re
import subprocess

from .common import PROCESSED_DIR, RAW_DIR, PROVINCES, download, province_code

SOURCE_URL = ("https://www.btk.gov.tr/s3/web-btk-site/7708c26c-5161-4919-8b3d-daa31d4ac8fb/"
              "2026/05/643ef9c5-2f45-413c-8f32-234877fa38d3.pdf")
PDF_PATH = RAW_DIR / "btk_il_bazli_bulten_2026.pdf"
OUT_PATH = PROCESSED_DIR / "btk_iller.csv"

# English row labels are stable and unambiguous, so rows are matched on them.
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
NUMBER = re.compile(r"\d{1,3}(?:\.\d{3})*(?:,\d+)?")
YEAR = re.compile(r"\b20\d\d\b")
NAME_LINE = re.compile(r"^[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ. ]+$")


def ensure_pdf() -> None:
    if PDF_PATH.exists():
        return
    PDF_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f"downloading {SOURCE_URL}")
    PDF_PATH.write_bytes(download(SOURCE_URL))


def parse_number(token: str) -> float:
    return float(token.replace(".", "").replace(",", "."))


def format_value(value: float | None) -> str:
    if value is None:
        return ""
    return str(int(value)) if value.is_integer() else str(value)


def parse_page(page: str):
    lines = page.splitlines()
    header = next((i for i, line in enumerate(lines) if len(YEAR.findall(line)) >= 6), None)
    if header is None:
        return None
    columns = [(int(m.group()), m.end()) for m in YEAR.finditer(lines[header])]

    name = None
    for line in lines[header + 1:]:
        if line.strip():
            if NAME_LINE.match(line.strip()):
                name = line.strip()
            break
    if name is None:
        return None

    values: dict[int, dict[str, float]] = {year: {} for year, _ in columns}
    for line in lines[header + 1:]:
        for label, field in ROWS.items():
            pos = line.find(label)
            if pos < 0:
                continue
            for m in NUMBER.finditer(line, pos + len(label)):
                year = min(columns, key=lambda c: abs(c[1] - m.end()))[0]
                values[year][field] = parse_number(m.group())
            break
    return name, values


def main() -> None:
    ensure_pdf()
    text = subprocess.run(["pdftotext", "-layout", str(PDF_PATH), "-"],
                          check=True, capture_output=True, text=True).stdout

    provinces: dict[str, dict[int, dict[str, float]]] = {}
    totals = None
    for page in text.split("\f"):
        parsed = parse_page(page)
        if parsed is None:
            continue
        name, values = parsed
        if name == "TOPLAM":
            totals = values
            continue
        code = province_code(name)
        if code is None:
            print(f"unmatched province name: {name!r}")
            continue
        provinces[code] = values

    missing = sorted(set(PROVINCES) - set(provinces))
    if missing:
        raise SystemExit(f"missing provinces: {[PROVINCES[c] for c in missing]}")

    # Sanity check: provincial figures should add up to the national totals page.
    if totals:
        for field in ("nufus", "sabit_genisbant", "fiber", "xdsl", "fiber_km"):
            national = totals[2025].get(field)
            summed = sum(p[2025].get(field, 0) for p in provinces.values())
            if national:
                print(f"2025 {field:<16} national {national:>14,.0f}  sum of provinces "
                      f"{summed:>14,.0f}  ({(summed / national - 1) * 100:+.2f}%)")

    # The national totals page is kept as code "00": it includes ISDN and satellite
    # subscriptions that BTK cannot assign to a province.
    rows = {code: (PROVINCES[code], values) for code, values in provinces.items()}
    if totals:
        rows["00"] = ("Türkiye", totals)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["il_kodu", "il", "yil", *FIELDS])
        for code in sorted(rows):
            name, values = rows[code]
            for year in sorted(values):
                row = values[year]
                writer.writerow([code, name, year, *[format_value(row.get(f)) for f in FIELDS]])
    print(f"{len(provinces)} provinces -> {OUT_PATH.relative_to(PROCESSED_DIR.parent.parent)}")


if __name__ == "__main__":
    main()
