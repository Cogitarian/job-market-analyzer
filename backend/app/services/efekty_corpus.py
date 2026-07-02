"""
Flattens the kierunkowe-efekty dataset (backend/data/kierunkowe_efekty.json)
into one corpus of individual efekty records, each tagged with a kierunek
abbreviation and stopień so cross-kierunek comparison (n-grams, keyness,
clustering, similarity) has something to group/filter by.
"""
import json
import os
import re
from typing import Optional

_DATA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "kierunkowe_efekty.json"
)

_corpus_cache: Optional[list[dict]] = None

_STOPIEN_LABELS = {"a": "I", "b": "II", "": ""}

# The dataset's own "stopien" field is populated for only ~40% of records —
# for the rest we derive it from more reliable signals also present on every
# efekt: the PRK reference (P6S/P6U = poziom 6 = I stopień, P7S/P7U = poziom
# 7 = II stopień, P8S/P8U = poziom 8 = III stopień/doktorat) and, when PRK is
# missing, the "K<n>" segment of the kod itself — empirically K1/K3 pair with
# I stopień (P6) and K2/K4/K5 pair with II stopień (P7) in this corpus.
_KOD_STOPIEN_SEGMENT = {"K1": "I", "K3": "I", "K2": "II", "K4": "II", "K5": "II"}
_KOD_K_SEGMENT_RE = re.compile(r"_K(\d+)_")


def derive_stopien(kod: str, prk: list[str], raw_stopien: str) -> str:
    prk_str = " ".join(prk)
    if "P6" in prk_str:
        return "I"
    if "P7" in prk_str:
        return "II"
    if "P8" in prk_str:
        return "III"
    m = _KOD_K_SEGMENT_RE.search(kod)
    if m:
        label = _KOD_STOPIEN_SEGMENT.get(f"K{m.group(1)}")
        if label:
            return label
    return _STOPIEN_LABELS.get(raw_stopien, raw_stopien)


def _kierunek_skrot(kod: str, kierunek: str) -> str:
    """Derive a short kierunek code from the efekt's own kod prefix
    (e.g. "FFR_K1_U01" -> "FFR"), falling back to initials of the kierunek
    name for bare-format codes ("K_W01", "O.W01") that carry no prefix."""
    if "_" in kod:
        prefix = kod.split("_")[0]
        if prefix and prefix.isupper() and not prefix[0].isdigit() and prefix != "K":
            return prefix
    words = [w for w in re.split(r"[\s\-]+", kierunek) if len(w) > 2]
    skrot = "".join(w[0].upper() for w in words[:4])
    return skrot or re.sub(r"[^A-Za-z]", "", kierunek)[:4].upper()


def load_corpus(force_reload: bool = False) -> list[dict]:
    """Returns the flattened efekty corpus, cached in memory after first call."""
    global _corpus_cache
    if _corpus_cache is not None and not force_reload:
        return _corpus_cache

    with open(_DATA_PATH, encoding="utf-8") as f:
        data = json.load(f)

    corpus = []
    for key, entry in data.items():
        kierunek = entry["kierunek"]
        for e in entry.get("efekty", []):
            if "kod" not in e:
                continue
            skrot = _kierunek_skrot(e["kod"], kierunek)
            stopien = derive_stopien(e["kod"], e.get("prk", []), e.get("stopien", ""))
            corpus.append({
                "id": f"{key}::{e['kod']}",
                "kod": e["kod"],
                "kierunek_key": key,
                "kierunek": kierunek,
                "kierunek_skrot": skrot,
                "stopien": stopien,
                "category": e.get("category", "unknown"),
                "opis": e["opis"],
                "prk": e.get("prk", []),
            })

    _corpus_cache = corpus
    return corpus
