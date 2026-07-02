"""
Decomposes each kierunkowy efekt into up to four semantic slots, per the
hypothesis: [orzeczenie] + [określenie zakresu]? + [umiejętność]? + [dziedzina]
  e.g. "potrafi" + "w pogłębionym stopniu" + "scharakteryzować" + "główne
  nurty przekładoznawstwa"

Checked empirically against the corpus (7473 efekty) before building this,
rather than assuming the hypothesis holds uniformly:
  - Umiejętności (U): 3078/3079 (99.97%) contain a real VERB in the
    continuation after the injected "potrafić" trigger — the [umiejętność]
    slot (skill infinitive) is essentially always present here.
  - Wiedza (W): only 259/2843 (9%) do — W-efekty are almost always just
    [znać/rozumieć] + [dziedzina], with no skill-verb slot at all.
  - Kompetencje (K): only 210/1551 (14%) do — same pattern as W.
  - [określenie zakresu] (an explicit "w X stopniu/zakresie/poziomie/
    kontekście/wymiarze/skali/ujęciu" qualifier) appears in 1656/7473 (22%)
    of efekty across all categories — real, but a minority pattern.
So every slot below is genuinely optional except [orzeczenie] (which is
either the injected category trigger or the first real verb) and
[dziedzina] (the leftover content) — matching the request to let each
slot be skipped, since [zakres] is absent 78% of the time and [umiejętność]
only applies to U-shaped efekty.
"""
import re
from collections import Counter
from typing import Optional

from app.services.efekty_corpus import load_corpus
from app.services import verb_tree

# The "orzeczenie" (predicate) is a closed, small vocabulary — the same
# handful of introductory verbs recur across the whole corpus regardless of
# subject matter, so grouping them into synonym sets is more useful than
# treating each lemma as distinct (a real filtering axis would barely
# discriminate: nearly everything in "skills" starts with "potrafić").
PREDICATE_SYNONYMS: dict[str, str] = {
    "znać": "znać/wiedzieć", "wiedzieć": "znać/wiedzieć", "rozumieć": "znać/wiedzieć",
    "posiadać": "znać/wiedzieć", "mieć": "znać/wiedzieć", "orientować": "znać/wiedzieć",
    "potrafić": "potrafić/umieć", "umieć": "potrafić/umieć", "móc": "potrafić/umieć",
    "być": "być gotowym", "gotowy": "być gotowym", "przygotowany": "być gotowym",
    "zdolny": "być gotowym", "skłonny": "być gotowym",
}

_ZAKRES_MARKERS = ["stopniu", "stopień", "zakresie", "zakres", "poziomie", "poziom",
                    "kontekście", "kontekst", "wymiarze", "wymiar", "skali", "skala", "ujęciu", "ujęcie"]
_ZAKRES_RE = re.compile(
    r"\b(?:w|na|pod względem|z)\s+(?:\w+\s+){0,2}?(" + "|".join(_ZAKRES_MARKERS) + r")\b",
    re.IGNORECASE,
)
# Collapse inflected marker forms to one canonical facet value.
_ZAKRES_CANON = {
    "stopniu": "stopień", "stopień": "stopień",
    "zakresie": "zakres", "zakres": "zakres",
    "poziomie": "poziom", "poziom": "poziom",
    "kontekście": "kontekst", "kontekst": "kontekst",
    "wymiarze": "wymiar", "wymiar": "wymiar",
    "skali": "skala", "skala": "skala",
    "ujęciu": "ujęcie", "ujęcie": "ujęcie",
}

_DOMAIN_STOPWORDS = {
    "i", "oraz", "w", "na", "z", "do", "dla", "o", "a", "ich", "ten", "swój", "być",
    "który", "się", "on", "inny", "różny", "podstawowy", "wybrany", "odpowiedni",
}


def _predicate_group(trigger_lemmas: list[str]) -> str:
    for lemma in trigger_lemmas:
        if lemma in PREDICATE_SYNONYMS:
            return PREDICATE_SYNONYMS[lemma]
    return "/".join(trigger_lemmas) or "?"


def decompose_corpus(max_words_domain: int = 8) -> list[dict]:
    """One record per efekt: {id, category, orzeczenie, zakres, umiejetnosc,
    dziedzina, dziedzina_terms}. Reuses the same persisted lemma-token cache
    the verb tree already builds/loads (no extra spaCy pass)."""
    corpus = load_corpus()
    cache = verb_tree._load_tokens_cache(corpus)
    by_id = {e["id"]: e for e in cache}

    out = []
    for c in corpus:
        entry = by_id.get(c["id"])
        if not entry:
            continue
        tokens = entry["tokens"]
        trigger = verb_tree._CATEGORY_TRIGGER.get(c["category"], [])
        orzeczenie = _predicate_group(trigger)

        opis_lower = c["opis"].lower()
        zm = _ZAKRES_RE.search(opis_lower)
        zakres = _ZAKRES_CANON.get(zm.group(1).lower()) if zm else None

        content_tokens = [(lemma, pos) for lemma, pos, is_punct, is_space in tokens
                           if not is_punct and not is_space]
        verb_lemmas = [lemma for lemma, pos in content_tokens if pos == "VERB"]
        umiejetnosc = verb_lemmas[0] if verb_lemmas else None

        # dziedzina = the leftover content: NOUN/PROPN/ADJ lemmas, excluding
        # the skill-verb itself and the zakres marker word, capped for the
        # n-gram/keyness tools this feeds into.
        domain_terms = [
            lemma for lemma, pos in content_tokens
            if pos in ("NOUN", "PROPN") and lemma not in _DOMAIN_STOPWORDS
            and lemma not in _ZAKRES_CANON
        ][:max_words_domain]

        out.append({
            "id": c["id"], "category": c["category"], "kierunek": c["kierunek"],
            "orzeczenie": orzeczenie, "zakres": zakres, "umiejetnosc": umiejetnosc,
            "dziedzina_terms": domain_terms, "opis": c["opis"],
        })
    return out


def facets(decomposed: list[dict]) -> dict:
    """Distinct filterable values per slot, each with a corpus-wide count —
    the frontend renders these as optional dropdowns (any slot skippable)."""
    orzeczenie_counts = Counter(d["orzeczenie"] for d in decomposed if d["orzeczenie"])
    zakres_counts = Counter(d["zakres"] for d in decomposed if d["zakres"])
    umiejetnosc_counts = Counter(d["umiejetnosc"] for d in decomposed if d["umiejetnosc"])
    domain_counts: Counter = Counter()
    for d in decomposed:
        domain_counts.update(set(d["dziedzina_terms"]))

    return {
        "orzeczenie": [{"value": v, "count": n} for v, n in orzeczenie_counts.most_common()],
        "zakres": [{"value": v, "count": n} for v, n in zakres_counts.most_common()],
        "umiejetnosc": [{"value": v, "count": n} for v, n in umiejetnosc_counts.most_common(200)],
        "dziedzina": [{"value": v, "count": n} for v, n in domain_counts.most_common(300)],
    }


def filter_efekty(decomposed: list[dict], category: Optional[str] = None,
                   orzeczenie: Optional[str] = None, zakres: Optional[str] = None,
                   umiejetnosc: Optional[str] = None, dziedzina: Optional[list[str]] = None) -> list[dict]:
    """Every slot is optional/skippable — None/empty means "any"."""
    results = decomposed
    if category:
        results = [d for d in results if d["category"] == category]
    if orzeczenie:
        results = [d for d in results if d["orzeczenie"] == orzeczenie]
    if zakres:
        results = [d for d in results if d["zakres"] == zakres]
    if umiejetnosc:
        results = [d for d in results if d["umiejetnosc"] == umiejetnosc]
    if dziedzina:
        wanted = set(dziedzina)
        results = [d for d in results if wanted & set(d["dziedzina_terms"])]
    return results
