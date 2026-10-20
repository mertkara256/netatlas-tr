"""Shared paths, the province list and a download helper."""
from __future__ import annotations

import re
import ssl
import unicodedata
import urllib.request
from pathlib import Path

import certifi

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"

# Plate code -> official province name.
PROVINCES = {
    "01": "Adana", "02": "Adıyaman", "03": "Afyonkarahisar", "04": "Ağrı", "05": "Amasya",
    "06": "Ankara", "07": "Antalya", "08": "Artvin", "09": "Aydın", "10": "Balıkesir",
    "11": "Bilecik", "12": "Bingöl", "13": "Bitlis", "14": "Bolu", "15": "Burdur",
    "16": "Bursa", "17": "Çanakkale", "18": "Çankırı", "19": "Çorum", "20": "Denizli",
    "21": "Diyarbakır", "22": "Edirne", "23": "Elazığ", "24": "Erzincan", "25": "Erzurum",
    "26": "Eskişehir", "27": "Gaziantep", "28": "Giresun", "29": "Gümüşhane", "30": "Hakkari",
    "31": "Hatay", "32": "Isparta", "33": "Mersin", "34": "İstanbul", "35": "İzmir",
    "36": "Kars", "37": "Kastamonu", "38": "Kayseri", "39": "Kırklareli", "40": "Kırşehir",
    "41": "Kocaeli", "42": "Konya", "43": "Kütahya", "44": "Malatya", "45": "Manisa",
    "46": "Kahramanmaraş", "47": "Mardin", "48": "Muğla", "49": "Muş", "50": "Nevşehir",
    "51": "Niğde", "52": "Ordu", "53": "Rize", "54": "Sakarya", "55": "Samsun",
    "56": "Siirt", "57": "Sinop", "58": "Sivas", "59": "Tekirdağ", "60": "Tokat",
    "61": "Trabzon", "62": "Tunceli", "63": "Şanlıurfa", "64": "Uşak", "65": "Van",
    "66": "Yozgat", "67": "Zonguldak", "68": "Aksaray", "69": "Bayburt", "70": "Karaman",
    "71": "Kırıkkale", "72": "Batman", "73": "Şırnak", "74": "Bartın", "75": "Ardahan",
    "76": "Iğdır", "77": "Yalova", "78": "Karabük", "79": "Kilis", "80": "Osmaniye",
    "81": "Düzce",
}

_TR_ASCII = str.maketrans({
    "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ı": "i", "I": "i", "İ": "i",
    "ö": "o", "Ö": "o", "ş": "s", "Ş": "s", "ü": "u", "Ü": "u",
})

# Older or abbreviated names that still appear in official tables (BTK writes Mersin as "İÇEL").
_ALIASES = {"kmaras": "46", "surfa": "63", "afyon": "03", "icel": "33"}


def normalize_name(name: str) -> str:
    """'AFYONKARAHİSAR', 'Afyonkarahisar' and 'Afyonkarahisar ' all map to 'afyonkarahisar'."""
    s = name.translate(_TR_ASCII).lower()
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", s)


_BY_NAME = {normalize_name(n): code for code, n in PROVINCES.items()} | _ALIASES


def province_code(name: str) -> str | None:
    return _BY_NAME.get(normalize_name(name))


def download(url: str) -> bytes:
    # certifi keeps HTTPS working on Python builds that ship without system CA roots.
    context = ssl.create_default_context(cafile=certifi.where())
    with urllib.request.urlopen(url, context=context) as resp:
        return resp.read()
