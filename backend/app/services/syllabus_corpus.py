"""
Loads the full, one-time-crawled university syllabus database — every
course across every UAM kierunek/forma/poziom (built by the background
crawl in scripts/full_syllabus_crawl.py) — so content comparison and the
study planner can query across the WHOLE university instead of being
limited to whatever kierunki the user has scraped in the current session
(that per-session limitation is what app/api/outcomes.py's in-memory
_cache still has, for the interactive "Efekty kształcenia" explorer).
"""
import json
import os
import re
from typing import Optional

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
_COURSES_PATH = os.path.join(_DATA_DIR, "syllabus_courses_db.json")
_INDEX_PATH = os.path.join(_DATA_DIR, "kierunki_index.json")

_courses_cache: Optional[dict] = None
_index_cache: Optional[dict] = None
_uuid_to_kierunki_cache: Optional[dict] = None


def is_available() -> bool:
    return os.path.exists(_COURSES_PATH) and os.path.exists(_INDEX_PATH)


def load_courses(force_reload: bool = False) -> dict:
    global _courses_cache
    if _courses_cache is None or force_reload:
        with open(_COURSES_PATH, encoding="utf-8") as f:
            _courses_cache = json.load(f)
    return _courses_cache


def load_kierunki_index(force_reload: bool = False) -> dict:
    global _index_cache
    if _index_cache is None or force_reload:
        with open(_INDEX_PATH, encoding="utf-8") as f:
            _index_cache = json.load(f)
    return _index_cache


def _uuid_to_kierunki() -> dict:
    global _uuid_to_kierunki_cache
    if _uuid_to_kierunki_cache is None:
        index = load_kierunki_index()
        mapping: dict[str, list[dict]] = {}
        for key, v in index.items():
            for uuid in v.get("course_uuids", []):
                mapping.setdefault(uuid, []).append(v)
        _uuid_to_kierunki_cache = mapping
    return _uuid_to_kierunki_cache


def course_to_kierunki(course_uuid: str) -> list[dict]:
    """Every kierunek/forma/poziom variant that teaches this course."""
    return _uuid_to_kierunki().get(course_uuid, [])


def flatten_content_corpus(poziom: Optional[str] = None, forma: Optional[str] = None) -> list[dict]:
    """One record per course with content, joined into a single text field
    (`opis`, matching efekty_corpus's field name so corpus_nlp's n-gram/
    keyness/cluster/similarity functions work unmodified on either corpus).
    `poziom`/`forma` filter to courses taught within a matching kierunek
    variant (LIC/MGR/MIXED × STACJ/NIESTACJ/MIXED — see study_planner.py
    for how those map to the raw "studia pierwszego stopnia" etc. labels)."""
    courses = load_courses()
    uuid_kierunki = _uuid_to_kierunki()

    corpus = []
    for uuid, syl in courses.items():
        content = syl.get("content", [])
        if not content:
            continue
        variants = uuid_kierunki.get(uuid, [])
        if poziom:
            variants = [v for v in variants if poziom_matches(v, poziom)]
        if forma:
            variants = [v for v in variants if forma_matches(v, forma)]
        if (poziom or forma) and not variants:
            continue

        kierunki_names = sorted({v["kierunek"] for v in variants}) or ["?"]
        corpus.append({
            "id": uuid,
            "kod": uuid[:8],
            "kierunek_key": kierunki_names[0],
            "kierunek": ", ".join(kierunki_names[:3]) + ("…" if len(kierunki_names) > 3 else ""),
            # Real per-kierunek list (unlike "kierunek" above, which is a
            # joined/truncated display string) — needed to tally matches per
            # kierunek correctly when a course is taught across several.
            "kierunki_list": kierunki_names,
            "kierunek_skrot": "",
            "stopien": "",
            "category": "content",
            "opis": " ".join(content),
            "title": syl.get("title", ""),
            "prk": [],
        })
    return corpus


def _normalize_kierunek_name(name: str) -> str:
    """BIP resolution names (efekty_corpus) and sylabus.amu.edu.pl listing
    names (kierunki_index) don't always match exactly — different casing,
    and sylabus.amu.edu.pl sometimes adds a parenthetical specialization
    suffix ("Filologia polska (k)"). Normalize both sides before comparing."""
    name = name.lower().strip()
    name = re.sub(r"\s*\([^)]*\)\s*", " ", name)
    return re.sub(r"\s+", " ", name).strip()


def resolve_kierunek_variants(kierunek_name: str, poziom: str = "MIXED", forma: str = "MIXED") -> list[dict]:
    """Every indexed kierunek/forma/poziom variant matching this kierunek
    name (fuzzy — see _normalize_kierunek_name), filtered by poziom/forma."""
    index = load_kierunki_index()
    target = _normalize_kierunek_name(kierunek_name)
    matches = []
    for v in index.values():
        vname = _normalize_kierunek_name(v["kierunek"])
        if vname == target or target in vname or vname in target:
            if poziom_matches(v, poziom) and forma_matches(v, forma):
                matches.append(v)
    return matches


# level_id: 2 = I stopień (licencjat), 3 = II stopień (magister),
# 4 = I stopień inżynierskie, 6 = II stopień inżynierskie,
# 9 = II stopień poinżynierskie, 7 = jednolite magisterskie (single
# continuous program, e.g. Prawo/Psychologia/Pedagogika specjalna/Teologia —
# doesn't split I/II at all, so it's not really "LIC" or "MGR" specifically;
# it matches whichever poziom filter is active rather than being excluded
# by either one).
_LIC_LEVELS = {2, 4}
_MGR_LEVELS = {3, 6, 9}
_JEDNOLITE_LEVELS = {7}


def poziom_matches(variant: dict, poziom: str) -> bool:
    level_id = variant.get("level_id")
    if level_id in _JEDNOLITE_LEVELS:
        return True
    if poziom == "LIC":
        return level_id in _LIC_LEVELS
    if poziom == "MGR":
        return level_id in _MGR_LEVELS
    return True  # MIXED


def forma_matches(variant: dict, forma: str) -> bool:
    # form_id: 3 = stacjonarne, 4 = niestacjonarne, 5 = niestacjonarne
    # wieczorowe (evening) — treated the same as niestacjonarne.
    form_id = variant.get("form_id")
    if forma == "STACJ":
        return form_id == 3
    if forma == "NIESTACJ":
        return form_id in (4, 5)
    return True  # MIXED
