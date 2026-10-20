"""Download Türkiye's province (ADM1) boundaries from geoBoundaries (OpenStreetMap based).

The full-resolution file is used to decide which province a speed tile belongs to;
the simplified one is what the map draws.

    uv run python -m pipeline.boundaries
"""
from __future__ import annotations

import json

from .common import RAW_DIR, PROVINCES, download, province_code

BASE_URL = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/TUR/ADM1/"
FILES = {
    "geoBoundaries-TUR-ADM1.geojson": RAW_DIR / "tr_iller.geojson",
    "geoBoundaries-TUR-ADM1_simplified.geojson": RAW_DIR / "tr_iller_sade.geojson",
}


def feature_code(props: dict) -> str | None:
    iso = (props.get("shapeISO") or "").strip()
    if iso.startswith("TR-") and iso[3:] in PROVINCES:
        return iso[3:]
    return province_code(props.get("shapeName", ""))


def main() -> None:
    for name, out in FILES.items():
        data = json.loads(download(BASE_URL + name))
        seen = set()
        for feature in data["features"]:
            code = feature_code(feature["properties"])
            if code is None:
                raise SystemExit(f"cannot match boundary {feature['properties']}")
            seen.add(code)
            feature["properties"] = {"il_kodu": code, "il": PROVINCES[code]}
        missing = sorted(set(PROVINCES) - seen)
        if missing:
            raise SystemExit(f"missing provinces in {name}: {[PROVINCES[c] for c in missing]}")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        print(f"{len(seen)} provinces -> {out.relative_to(RAW_DIR.parent.parent)}")


if __name__ == "__main__":
    main()
