"""Türkiye's official province (il) and district (ilçe) boundaries, with correct Turkish names.

Shapes and codes come from OCHA's COD-AB for Türkiye on HDX, based on the General Command of
Mapping (Harita Genel Müdürlüğü): 81 provinces, 973 districts, CC BY-IGO.

The Turkish names in that file went through a case conversion that turned "I" into "i" and
"İ" into "i̇" (Çayırlı became "Çayirli"), so district names are taken from OpenStreetMap via
geoBoundaries (ODbL), with a few overrides checked by hand.

    uv run python -m pipeline.boundaries

Outputs:
    data/raw/sinirlar/iller.geojson, ilceler.geojson   full-resolution shapes (large, not in git)
    data/processed/ilceler.csv                         the district list with codes and names
"""
from __future__ import annotations

import csv
import json
import zipfile
from collections import defaultdict

from .common import PROCESSED_DIR, PROVINCES, RAW_DIR, download, normalize_name, province_code

COD_URL = ("https://data.humdata.org/dataset/d74086a0-f398-4474-9e12-1b9a70907bd0/resource/"
           "470bd810-2240-4ce0-b5c4-17434112ce41/download/tur_admin_boundaries.geojson.zip")
OSM_URL = ("https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/TUR/ADM2/"
           "geoBoundaries-TUR-ADM2_simplified.geojson")
DIR = RAW_DIR / "sinirlar"
COD_ZIP = DIR / "cod_tur_admin_boundaries.geojson.zip"
OSM_PATH = DIR / "geoboundaries_tur_adm2.geojson"
PROVINCES_PATH = DIR / "iller.geojson"
DISTRICTS_PATH = DIR / "ilceler.geojson"
DISTRICT_LIST_PATH = PROCESSED_DIR / "ilceler.csv"

# District names neither source spells correctly, keyed by COD pcode.
NAME_OVERRIDES = {
    "TUR017001": "Ayvacık",        # OSM has both "Ayvacık" and "Ayvacik"
    "TUR055005": "Ayvacık",
    "TUR017010": "Gökçeada",       # OSM: "Imbros"
    "TUR034001": "Adalar",         # OSM: "Prince Islands"
    "TUR024003": "İliç",           # OSM: "Ilıç"
    "TUR032010": "Şarkikaraağaç",  # OSM: "Şarkîkaraağaç"
}


def fetch(url: str, path) -> None:
    if not path.exists():
        print(f"downloading {url}")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(download(url))


def plate_code(props: dict) -> str:
    """'TUR034' -> '34', cross-checked against the province name in the same record."""
    code = props["adm1_pcode"].removeprefix("TUR")[-2:]
    if province_code(props["adm1_name"]) != code:
        raise ValueError(f"pcode {props['adm1_pcode']} does not match {props['adm1_name']!r}")
    return code


def undo_case_conversion(name: str) -> str:
    """'Karai̇sali' -> 'Karaisalı': a marked i̇ was an İ, a plain i was an I."""
    return name.replace("i̇", "\0").replace("i", "ı").replace("\0", "i")


def district_name(props: dict, province: str, osm: dict[str, set[str]]) -> str:
    key = normalize_name(props["adm2_name"])
    if key == normalize_name(province):
        return f"{province} Merkez"
    if props["adm2_pcode"] in NAME_OVERRIDES:
        return NAME_OVERRIDES[props["adm2_pcode"]]
    if len(osm.get(key, ())) == 1:
        return next(iter(osm[key]))
    if "̇" in props["adm2_name1"]:
        return undo_case_conversion(props["adm2_name1"])
    raise SystemExit(f"no reliable Turkish name for {props['adm2_pcode']} {props['adm2_name']!r}; "
                     "add it to NAME_OVERRIDES")


def write_geojson(path, features: list[dict]) -> None:
    collection = {"type": "FeatureCollection", "features": features}
    path.write_text(json.dumps(collection, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    fetch(COD_URL, COD_ZIP)
    fetch(OSM_URL, OSM_PATH)

    with zipfile.ZipFile(COD_ZIP) as z:
        admin1 = json.load(z.open("tur_admin1.geojson"))["features"]
        admin2 = json.load(z.open("tur_admin2.geojson"))["features"]
    osm: dict[str, set[str]] = defaultdict(set)
    for f in json.loads(OSM_PATH.read_text(encoding="utf-8"))["features"]:
        osm[normalize_name(f["properties"]["shapeName"])].add(f["properties"]["shapeName"])

    provinces = []
    for f in admin1:
        code = plate_code(f["properties"])
        provinces.append({"type": "Feature", "properties": {"il_kodu": code, "il": PROVINCES[code]},
                          "geometry": f["geometry"]})

    districts = []
    for f in admin2:
        code = plate_code(f["properties"])
        props = {"ilce_kodu": f["properties"]["adm2_pcode"], "il_kodu": code, "il": PROVINCES[code],
                 "ilce": district_name(f["properties"], PROVINCES[code], osm)}
        districts.append({"type": "Feature", "properties": props, "geometry": f["geometry"]})

    write_geojson(PROVINCES_PATH, provinces)
    write_geojson(DISTRICTS_PATH, districts)
    DISTRICT_LIST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with DISTRICT_LIST_PATH.open("w", newline="", encoding="utf-8") as out:
        writer = csv.writer(out)
        writer.writerow(["ilce_kodu", "il_kodu", "il", "ilce"])
        for d in sorted(districts, key=lambda d: d["properties"]["ilce_kodu"]):
            p = d["properties"]
            writer.writerow([p["ilce_kodu"], p["il_kodu"], p["il"], p["ilce"]])
    print(f"{len(provinces)} provinces, {len(districts)} districts -> "
          f"{DISTRICT_LIST_PATH.relative_to(PROCESSED_DIR.parent.parent)}")


if __name__ == "__main__":
    main()
