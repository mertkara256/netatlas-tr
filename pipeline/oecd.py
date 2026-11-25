"""Türkiye among the 38 OECD members: fixed broadband subscriptions per 100 inhabitants and fibre's share of
them, in the last quarter of the latest full year, from the OECD's broadband database.

Source: OECD, Broadband and telecom databases (DF_BB_TEL_DATABASE), through the OECD's SDMX service, which
needs no key. Run by hand, not by the weekly data update; the OECD adds a quarter some months after it ends.

    uv run python -m pipeline.oecd
"""
from __future__ import annotations

import csv
import datetime
import io

from .common import PROCESSED_DIR, RAW_DIR, download

URL = ("https://sdmx.oecd.org/public/rest/data/OECD.STI.DEP,DSD_BB_DATABASE@DF_BB_TEL_DATABASE,2.0/.Q.FBB....."
       "?startPeriod={start}&endPeriod={end}&format=csvfilewithlabels")
RAW_PATH = RAW_DIR / "oecd" / "genisbant.csv"
OUT_PATH = PROCESSED_DIR / "oecd_genisbant.csv"

# The 38 members; the service also returns accession and partner countries and the OECD total.
MEMBERS = {
    "AUS": "Avustralya", "AUT": "Avusturya", "BEL": "Belçika", "CAN": "Kanada", "CHL": "Şili",
    "COL": "Kolombiya", "CRI": "Kosta Rika", "CZE": "Çekya", "DNK": "Danimarka", "EST": "Estonya",
    "FIN": "Finlandiya", "FRA": "Fransa", "DEU": "Almanya", "GRC": "Yunanistan", "HUN": "Macaristan",
    "ISL": "İzlanda", "IRL": "İrlanda", "ISR": "İsrail", "ITA": "İtalya", "JPN": "Japonya",
    "KOR": "Güney Kore", "LVA": "Letonya", "LTU": "Litvanya", "LUX": "Lüksemburg", "MEX": "Meksika",
    "NLD": "Hollanda", "NZL": "Yeni Zelanda", "NOR": "Norveç", "POL": "Polonya", "PRT": "Portekiz",
    "SVK": "Slovakya", "SVN": "Slovenya", "ESP": "İspanya", "SWE": "İsveç", "CHE": "İsviçre",
    "TUR": "Türkiye", "GBR": "Birleşik Krallık", "USA": "ABD",
}

# (access mode, unit) of each measure, by the service's codes: Subscriptions, "Total" in "Per 100 inhabitants"
# and "Fibre/LAN" in "Percentage of fixed broadband subscriptions".
SERIES = {("_T", "100HB"): "abone_100", ("FIB", "PT_SB_FBB"): "fiber_payi"}
FIELDS = ["ulke_kodu", "ulke", "donem", "abone_100", "abone_100_sira", "fiber_payi", "fiber_payi_sira", "erisim"]


def read_values(text: str, members=MEMBERS) -> dict[str, dict[str, dict[str, float]]]:
    """{last-quarter period: {member: {measure: value}}}. Empty values are left out."""
    values: dict[str, dict[str, dict[str, float]]] = {}
    for row in csv.DictReader(io.StringIO(text)):
        measure = SERIES.get((row["NETWORK_ACCESS_MODE"], row["UNIT_MEASURE"]))
        if row["MEASURE"] != "SUB" or measure is None or row["REF_AREA"] not in members:
            continue
        if not row["TIME_PERIOD"].endswith("-Q4") or not row["OBS_VALUE"]:
            continue
        values.setdefault(row["TIME_PERIOD"], {}).setdefault(row["REF_AREA"], {})[measure] = float(row["OBS_VALUE"])
    return values


def latest_complete(values, members=MEMBERS) -> str:
    """The latest last quarter in which every member has both measures."""
    complete = [p for p, by in values.items() if all(len(by.get(code, {})) == len(SERIES) for code in members)]
    if not complete:
        raise SystemExit(f"no last quarter has both measures for all {len(members)} members: {sorted(values)}")
    return max(complete)


def rank(values: dict[str, float]) -> dict[str, int]:
    """1 for the highest; equal values share a rank."""
    return {code: 1 + sum(other > v for other in values.values()) for code, v in values.items()}


def table(values, period: str, accessed: str, members=MEMBERS) -> list[dict]:
    """One row per member, by fibre's share from the highest. Shares are written from 0 to 1, as in the other tables."""
    by = {code: values[period][code] for code in members}
    ranks = {m: rank({code: v[m] for code, v in by.items()}) for m in SERIES.values()}
    rows = [{
        "ulke_kodu": code,
        "ulke": members[code],
        "donem": period,
        "abone_100": v["abone_100"],
        "abone_100_sira": ranks["abone_100"][code],
        "fiber_payi": round(v["fiber_payi"] / 100, 4),
        "fiber_payi_sira": ranks["fiber_payi"][code],
        "erisim": accessed,
    } for code, v in by.items()]
    return sorted(rows, key=lambda r: (r["fiber_payi_sira"], r["ulke"]))


def main() -> None:
    today = datetime.date.today()
    # Last year's last quarter, or the one before while last year's is not out for every member.
    url = URL.format(start=f"{today.year - 2}-Q4", end=f"{today.year - 1}-Q4")
    print(f"downloading {url}")
    text = download(url).decode("utf-8-sig")
    RAW_PATH.parent.mkdir(parents=True, exist_ok=True)
    RAW_PATH.write_text(text, encoding="utf-8")

    values = read_values(text)
    period = latest_complete(values)
    rows = table(values, period, today.isoformat())
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    tur = next(r for r in rows if r["ulke_kodu"] == "TUR")
    print(f"{len(rows)} members, {period}: Türkiye {tur['abone_100']} per 100 ({tur['abone_100_sira']}.), "
          f"fibre {tur['fiber_payi']} ({tur['fiber_payi_sira']}.) -> {OUT_PATH.relative_to(PROCESSED_DIR.parent.parent)}")


if __name__ == "__main__":
    main()
