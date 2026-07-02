"""
Scrapes official kierunek-level ("kierunkowe") learning outcomes from UAM
Senate resolutions published on bip.amu.edu.pl.

Unlike sylabus.amu.edu.pl (course-level outcomes + bare kierunkowy codes),
these resolutions ("Uchwała ... w sprawie ustalenia programu studiów na
kierunku X") carry the full official text for each code, as attachments
named "Zal.1a"/"Zal.1b" (stopień 1 / stopień 2) or "Zal.1" (single-cycle
studies).
"""
import html as html_lib
import re
import time
import urllib.request

BIP = "https://bip.amu.edu.pl"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; JobMarketAnalyzer/1.0; research)"}

# Senate resolution index pages, most recent first. bip.amu.edu.pl names
# academic-year pages inconsistently across kadencje (terms of office).
YEAR_PAGES = [
    "/dokumenty/uchwaly-senatu/uchwaly-senatu-uam-kadencja-2024-2028-rok-akademicki-20252026",
    "/dokumenty/uchwaly-senatu/uchwaly-senatu-uam-kadencja-2024-2028-rok-akademicki-20242025",
    "/dokumenty/uchwaly-senatu/rok-ak.-20232024",
    "/dokumenty/uchwaly-senatu/rok-ak.-20222023",
    "/dokumenty/uchwaly-senatu/uchwaly-senatu-uam-kadencja-2020-2024-rok-akademicki-20212022",
    "/dokumenty/uchwaly-senatu/rok.-ak.-20202021",
    "/dokumenty/uchwaly-senatu/rok.-ak.-20192020",
]

_RESOLUTION_RE = re.compile(
    r'Uchwała nr (\d+)/(\d+)/(\d+) Senatu[^<]*?'
    r'w sprawie ustalenia programu studiów na kierunku\s+([^(<]+?)\s*\(',
)


def _get(url: str, timeout: int = 20) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    resp = urllib.request.urlopen(req, timeout=timeout)
    return resp.read().decode("utf-8", errors="ignore")


def _get_binary(url: str, timeout: int = 30) -> bytes:
    req = urllib.request.Request(url, headers=HEADERS)
    resp = urllib.request.urlopen(req, timeout=timeout)
    return resp.read()


# bip.amu.edu.pl spells this inconsistently across its own subpages —
# "uchwaly-nr-X-Y" on most, but "uchwal-nr-X-Y" (no "y") on at least one
# per year. Matching only one spelling silently drops a whole page's worth
# of resolutions (this is exactly how "japonistyka" and "administracja"
# went missing on the first crawl).
_SUBPAGE_RE = re.compile(r'href="(https://bip\.amu\.edu\.pl/dokumenty/uchwaly-senatu/[^"]*uchwal(?:y)?-nr-[^"]*)"')


def _year_page_htmls(path: str) -> list[str]:
    """A year's resolutions may be paginated into 'uchwaly-nr-X-Y' range
    sub-pages when there are too many to list on one page. Returns the HTML
    of every sub-page, or of the year page itself if it's not paginated."""
    html = _get(f"{BIP}{path}")
    subpages = list(dict.fromkeys(_SUBPAGE_RE.findall(html)))
    if not subpages:
        return [html]
    htmls = []
    for url in subpages:
        try:
            htmls.append(_get(url))
        except Exception:
            continue
    return htmls


def list_program_resolutions() -> list[dict]:
    """Crawl the Senate resolution archive for every 'ustalenie programu
    studiów na kierunku X' resolution found, across all indexed years.
    Returns one entry per (kierunek, uchwała) — duplicates across years are
    resolved by the caller (latest uchwała wins)."""
    found = []
    for path in YEAR_PAGES:
        try:
            htmls = _year_page_htmls(path)
        except Exception:
            continue

        for html in htmls:
            for m in _RESOLUTION_RE.finditer(html):
                nr, y1, y2, kierunek = m.groups()
                kierunek = html_lib.unescape(kierunek).strip()
                kierunek = re.sub(r"\s+", " ", kierunek)

                # Resolutions passed right at the academic-year boundary
                # (e.g. late September) keep their sequential number from
                # the outgoing year's series, but bip.amu.edu.pl uploads
                # their attachment files tagged with the *incoming*
                # academic year — "Uchwała nr 412/2022/2023" (25 września
                # 2023) has attachments named "US-412-2023-2024-Zal.*.pdf",
                # not "US-412-2022-2023-...". Try the stated year first,
                # then the shifted (+1/+1) year as a fallback.
                candidate_prefixes = [f"US-{nr}-{y1}-{y2}", f"US-{nr}-{int(y1)+1}-{int(y2)+1}"]

                attachments = []
                for file_prefix in candidate_prefixes:
                    # Tolerate two quirks seen in the wild: a stray double
                    # dot ("Zal.1..pdf") and a bare "Zal.pdf" with no digit
                    # at all (single-cycle programs, one attachment).
                    attach_re = re.compile(
                        rf'href="({re.escape(BIP)}/__data/assets/pdf_file/[^"]*{re.escape(file_prefix)}-Zal(?:\.1[a-z]?)?\.{{1,2}}pdf)"'
                    )
                    attachments = list(dict.fromkeys(attach_re.findall(html)))
                    if attachments:
                        break

                if not attachments:
                    # Pre-2022 resolutions use a different filename scheme
                    # entirely ("Uchwala_{nr}-{y1}-{y2}_{Kierunek}.pdf" or
                    # "Uchwala_{nr}_Zal-{n}_{topic}.pdf") often bundling
                    # everything into one combined document rather than
                    # separate Zal.1a/1b files. Grab every PDF referencing
                    # this uchwała number and let the table parser sort out
                    # which page(s), if any, hold the efekty table.
                    fallback_re = re.compile(
                        rf'href="({re.escape(BIP)}/__data/assets/pdf_file/[^"]*Uchwala_{re.escape(nr)}[_-][^"]*\.pdf)"'
                    )
                    attachments = list(dict.fromkeys(fallback_re.findall(html)))

                if not attachments:
                    continue

                found.append({
                    "kierunek": kierunek,
                    "uchwala_nr": f"{nr}/{y1}/{y2}",
                    "uchwala_sort_key": (int(y1), int(nr)),
                    "attachments": attachments,
                })
    return found


def dedupe_latest_per_kierunek(resolutions: list[dict]) -> dict[str, dict]:
    """Keep only the most recent resolution per kierunek (by academic year,
    then uchwała number)."""
    latest: dict[str, dict] = {}
    for r in resolutions:
        key = r["kierunek"].lower()
        if key not in latest or r["uchwala_sort_key"] > latest[key]["uchwala_sort_key"]:
            latest[key] = r
    return latest


def _category_from_letter(letter: str) -> str:
    return {"W": "knowledge", "U": "skills", "K": "competences"}.get(letter, "unknown")


# A code cell looks like "FFR_K1_U01", "PSY_K5_W01", "K_W01", "O.W01" —
# always ending in a category letter (W/U/K) + 1-2 digits, joined to the
# rest by "_" or ".". Deliberately loose: pdfplumber has already isolated
# the cell, so we just need to confirm it's a code cell (vs. a category
# header row like "Wiedza: absolwent/ka zna i rozumie") and read off the
# category letter.
_CODE_CELL_RE = re.compile(r'^\S+[_.][UWK]\d{1,2}$')


def parse_efekty_pdf(pdf_bytes: bytes) -> list[dict]:
    """Extract {kod, opis, prk} rows from a 'Zal.1x' kierunkowe-efekty PDF.

    Uses pdfplumber's table extraction rather than linear text — these
    tables wrap descriptions across a variable number of lines, and the
    code/PRK-reference cells can land anywhere within that wrapped block
    (not at a fixed line), so flat-text regexes on pdftotext output
    misattribute text between adjacent rows almost every time.
    """
    import pdfplumber
    import io

    rows: list[dict] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                for row in table:
                    if not row or not row[0]:
                        continue
                    kod = row[0].strip().replace("\n", " ")
                    if not _CODE_CELL_RE.match(kod):
                        continue  # category header / non-data row

                    opis = (row[1] or "").replace("\n", " ").strip(" .")
                    if len(opis) < 5:
                        continue
                    prk_cells = [c for c in row[2:] if c]
                    prk = []
                    for cell in prk_cells:
                        prk.extend(p.strip() for p in cell.replace("\n", " ").split(",") if p.strip())

                    cat_letter = kod.split("_")[-1][0] if "_" in kod else kod.split(".")[-1][0]
                    rows.append({
                        "kod": kod,
                        "opis": opis[:800],
                        "prk": prk,
                        "category": _category_from_letter(cat_letter),
                    })
    return rows


def scrape_kierunek_efekty(attachment_urls: list[str], polite_delay: float = 0.4) -> list[dict]:
    """Download + parse every Zal.1x attachment for one kierunek, tagging
    entries with which attachment (stopień) they came from."""
    all_rows = []
    for url in attachment_urls:
        try:
            pdf_bytes = _get_binary(url)
            rows = parse_efekty_pdf(pdf_bytes)
            stopien_match = re.search(r"Zal\.1([a-z]?)\.pdf$", url)
            stopien = stopien_match.group(1) if stopien_match else ""
            for row in rows:
                row["stopien"] = stopien
                row["source_url"] = url
            all_rows.extend(rows)
        except Exception as e:
            all_rows.append({"error": str(e), "source_url": url})
        time.sleep(polite_delay)
    return all_rows


def dedupe_codes(rows: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for r in rows:
        if "error" in r:
            out.append(r)
            continue
        if r["kod"] in seen:
            continue
        seen.add(r["kod"])
        out.append(r)
    return out
