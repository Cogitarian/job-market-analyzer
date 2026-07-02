import html as html_lib
import re
import ssl
import urllib.request
from typing import Optional

BASE = "https://sylabus.amu.edu.pl"
YEAR = "22"  # 2025/26
CTX = ssl._create_unverified_context()

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; JobMarketAnalyzer/1.0; research)"}


def _get(path: str) -> str:
    url = f"{BASE}{path}"
    req = urllib.request.Request(url, headers=HEADERS)
    resp = urllib.request.urlopen(req, context=CTX, timeout=15)
    return resp.read().decode("utf-8", errors="ignore")


def _text(html: str) -> str:
    text = re.sub("<[^>]+>", " ", html)
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def get_faculties() -> list[dict]:
    html = _get(f"/pl/{YEAR}/0/0")
    links = re.findall(
        rf'href=["\'](/pl/{YEAR}/0/0/(\d+))["\'][^>]*>(.*?)</a>', html, re.DOTALL
    )
    out = []
    for href, fid, name in links:
        name = re.sub("<[^>]+>", "", name).strip()
        if name and len(name) > 3 and "static" not in href:
            out.append({"id": int(fid), "name": name, "url": href})
    return out


def get_programs(faculty_id: int) -> list[dict]:
    html = _get(f"/pl/{YEAR}/0/0/{faculty_id}")

    # Programs (kierunki/specjalności) are grouped under heading divs; each
    # heading is followed by a <ul> of <li><a> entries for form/level combos.
    # Split the page into per-heading chunks first, then pull links from each.
    heading_re = re.compile(r'<div class="student-view-content-list-heading">(.*?)</div>', re.DOTALL)
    headings = list(heading_re.finditer(html))

    link_re = re.compile(
        rf'href=["\'](/pl/{YEAR}/(\d+)/(\d+)/{faculty_id}/(\d+))["\'][^>]*>\s*([^<]+)'
    )

    seen = set()
    out = []
    for i, h in enumerate(headings):
        kierunek = re.sub(r"<[^>]+>", "", h.group(1)).strip()
        chunk_start = h.end()
        chunk_end = headings[i + 1].start() if i + 1 < len(headings) else len(html)
        chunk = html[chunk_start:chunk_end]

        for href, form, level, pid, form_label in link_re.findall(chunk):
            form_label = re.sub(r"\s+", " ", form_label).strip()
            key = (int(pid), int(form), int(level))
            if key in seen or not form_label or len(form_label) <= 2:
                continue
            seen.add(key)
            out.append({
                "id": int(pid),
                "faculty_id": faculty_id,
                "kierunek": kierunek,
                "form_label": form_label,
                "label": f"{kierunek} — {form_label}" if kierunek else form_label,
                "form_id": int(form),
                "level_id": int(level),
                "url": href,
            })
    return out


def get_course_uuids(faculty_id: int, program_id: int, form_id: int = 3, level_id: int = 2) -> list[dict]:
    html = _get(f"/pl/{YEAR}/{form_id}/{level_id}/{faculty_id}/{program_id}")
    # Course buttons have data-syllabus-id with UUID
    uuids = re.findall(r'data-syllabus-id=["\']([0-9a-f-]{36})["\'][^>]*>\s*([^<]+)', html)
    # Also get course names from context
    courses = []
    for uuid, name in uuids:
        courses.append({"uuid": uuid, "name": name.strip()})
    # Deduplicate
    seen = set()
    out = []
    for c in courses:
        if c["uuid"] not in seen:
            seen.add(c["uuid"])
            out.append(c)
    return out


def get_syllabus(uuid: str) -> Optional[dict]:
    try:
        html = _get(f"/pl/document/{uuid}.html")
    except Exception as e:
        return None

    text = _text(html)

    title_match = re.search(r"<title>(.*?)</title>", html, re.DOTALL)
    if title_match:
        title = re.sub(r"\s+", " ", title_match.group(1)).strip()
        title = re.sub(r"\s*-\s*Sylabus UAM$", "", title).strip()
        title = html_lib.unescape(title)
    else:
        title = ""

    goals = _extract_goals(text)
    outcomes = _extract_outcomes(text)
    content = _extract_content(text)
    program_codes = _extract_program_codes(text)
    schedule = _extract_schedule(text)

    return {
        "uuid": uuid,
        "title": title,
        "goals": goals,
        "outcomes": outcomes,
        "content": content,
        "program_codes": program_codes,
        "schedule": schedule,
    }


_ASSESSMENT_PREFIX_RE = re.compile(r"^(Egzamin|Zaliczenie z oceną|Zaliczenie)\s+")


def _extract_schedule(text: str) -> dict:
    """Pulls the per-course scheduling facts needed to plan a course of
    study: which semester it's taught in, how many hours per class form
    (Wykład/Ćwiczenia/Konwersatorium/...), how it's assessed, and its ECTS
    weight. "Rok studiów" (year) isn't a labelled field on the page — it's
    derived from semester number (sem. 1-2 -> year 1, 3-4 -> year 2, ...)."""
    result = {
        "poziom_studiow": "", "forma_studiow": "", "semestr": None, "rok": None,
        "zajecia": [], "forma_zaliczenia": "", "ects": None,
    }

    m = re.search(r"Poziom studiów\s+(.+?)\s+Forma studiów", text)
    if m:
        result["poziom_studiow"] = m.group(1).strip()

    m = re.search(r"Forma studiów\s+(.+?)\s+Profil studiów", text)
    if m:
        result["forma_studiow"] = m.group(1).strip()

    m = re.search(r"Okres\s+Semestr\s+(\d+)", text)
    if m:
        semestr = int(m.group(1))
        result["semestr"] = semestr
        result["rok"] = (semestr + 1) // 2

    m = re.search(r"Forma zajęć\s*/\s*liczba godzin\s*/\s*forma zaliczenia\s+(.+?)\s+Liczba punktów ECTS", text)
    if m:
        raw = m.group(1).strip()
        # Some courses interleave a "w tym zajęcia zdalne: ..." remote-teaching
        # breakdown into the same cell (e.g. "Zaliczenie z oceną; w tym zajęcia
        # zdalne: Wykład synchroniczny: 10 Ćwiczenia: 10"), which breaks a
        # naive comma-split. Instead: find every "FormaName: N" pair anywhere
        # in the text, and the assessment type as a separate keyword search —
        # order-independent, so interleaved notes don't corrupt either.
        zajecia = [
            # Per-form assessment type (e.g. "Egzamin Laboratorium: 30") can
            # precede the next form's name with no punctuation between them —
            # strip it so it doesn't get captured as part of the form name.
            {"forma": _ASSESSMENT_PREFIX_RE.sub("", name.strip()), "godziny": int(hours)}
            for name, hours in re.findall(r"([A-ZŁŚŻŹĆŃÓĄĘ][^:,;]{2,40}?):\s*(\d+)\b", raw)
            # "Wykład synchroniczny: 10" etc. describes the remote-delivery
            # mode of hours already counted under the parent form ("Wykład:
            # 10"), not additional hours — drop it to avoid double-counting.
            if "synchroniczn" not in name.lower() and "asynchroniczn" not in name.lower()
        ]
        am = re.search(r"\b(Egzamin|Zaliczenie z oceną|Zaliczenie)\b", raw)
        result["zajecia"] = zajecia
        result["forma_zaliczenia"] = am.group(1) if am else ""

    m = re.search(r"Liczba punktów ECTS\s+(\d+)", text)
    if m:
        result["ects"] = int(m.group(1))

    return result


def _extract_goals(text: str) -> list[dict]:
    goals = []
    # Pattern: C1 some goal text C2 ...
    matches = re.findall(r'\b(C\d+)\s+([^C\d][^C]*?)(?=\bC\d+\b|Learning outcomes|$)', text)
    for code, desc in matches:
        desc = desc.strip()
        if desc and len(desc) > 10 and _looks_polish(desc):
            goals.append({"code": code, "description": desc[:500]})
    return goals[:20]


_NEXT_SECTION_RE = re.compile(
    r'\b(Treści (?:programowe|kształcenia)|Metody (?:kształcenia|i kryteria)|'
    r'Sposoby weryfikacji|Forma i warunki|Literatura|Zalecana literatura|'
    r'Bilans punktów ECTS|Język wykładowy|Praktyki zawodowe)\b'
)
_PROG_CODES_RE = re.compile(r'[A-Z]{2,10}_[A-Z0-9_]+(?:,\s*[A-Z]{2,10}_[A-Z0-9_]+)*')
_ASSESSMENT_HINT_RE = re.compile(
    r'\b(Kolokwium|Test|Projekt|Egzamin|Wypowiedź|Praca pisemna|Aktywność|'
    r'Obserwacja|Sprawozdanie|Referat|Esej)\b'
)

# Some UAM programs are taught in English (Wydział Anglistyki, "English
# programme" tracks, international law/relations, etc.) and their syllabi
# are written in English. We don't auto-translate (would need an LLM call
# and a user-supplied API key for every scrape), so non-Polish outcomes are
# filtered out rather than shown untranslated.
_POLISH_CHARS = set('ąćęłńóśźżĄĆĘŁŃÓŚŹŻ')
_ENGLISH_STOPWORDS_RE = re.compile(
    r'\b(the|and|of|is|are|with|for|this|that|will|able|to|in|on|as|by|from|'
    r'student|skills|knowledge|understands?|knows?|uses?|applies|'
    r'demonstrates|identifies|describes|explains|analyzes|develops|'
    r'sentences|texts|classes|semester|lecture|lectures|synchronous|'
    r'asynchronous|activities|methods|conditions|credit)\b',
    re.IGNORECASE,
)


def _looks_polish(text: str) -> bool:
    if any(ch in _POLISH_CHARS for ch in text):
        return True
    # No Polish diacritics — a single unambiguous English function word is
    # enough to call it non-Polish (false positives just over-filter, which
    # is the safer failure mode for a "must be Polish" requirement).
    return _ENGLISH_STOPWORDS_RE.search(text) is None


def _extract_outcomes(text: str) -> list[dict]:
    outcomes = []

    # Bound the search to the outcomes section so the last outcome doesn't
    # bleed into "Treści programowe" / "Literatura" / etc.
    boundary = _NEXT_SECTION_RE.search(text)
    section = text[:boundary.start()] if boundary else text

    # Split into alternating [pre-text, code, chunk, code, chunk, ...]
    parts = re.split(r'\b([UWK]\d+)\b', section)

    for i in range(1, len(parts) - 1, 2):
        code = parts[i]
        chunk = parts[i + 1]

        # Description ends where the program-code list (e.g. FFR_K1_U01)
        # starts; everything after that is assessment-method boilerplate.
        codes_match = _PROG_CODES_RE.search(chunk)
        if codes_match:
            desc = chunk[:codes_match.start()]
            prog_codes = [c.strip() for c in codes_match.group(0).split(",")]
        else:
            # No codes for this entry — fall back to cutting at the first
            # assessment-method keyword if present.
            hint = _ASSESSMENT_HINT_RE.search(chunk)
            desc = chunk[:hint.start()] if hint else chunk
            prog_codes = []

        desc = re.sub(r'\s+', ' ', desc).strip(" .")[:600]
        if desc and len(desc) > 10 and _looks_polish(desc):
            category = "skills" if code.startswith("U") else "knowledge" if code.startswith("W") else "competences"
            outcomes.append({
                "code": code,
                "category": category,
                "description": desc,
                "program_codes": prog_codes,
            })
    return outcomes[:50]


def _extract_content(text: str) -> list[str]:
    # Find content/treści section
    for marker in ["Content", "Treści", "Topics", "Subject matter"]:
        idx = text.find(marker)
        if idx >= 0:
            section = text[idx:idx+2000]
            # Split on numbered points or newlines
            items = re.findall(r'\d+\.\s+([^0-9.]{20,200})', section)
            if items:
                return [i.strip() for i in items[:20]]
            # Fallback: just return the section text
            return [section[:800]]
    return []


def _extract_program_codes(text: str) -> list[str]:
    # Extract all program-level outcome codes (e.g. ELI_K1_U01, INF_K1_W03)
    codes = re.findall(r'[A-Z]{2,8}_[A-Z0-9]{1,4}_[UWK]\d+', text)
    return list(set(codes))
