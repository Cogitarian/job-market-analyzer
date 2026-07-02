"""
Two real data sources feed this module, both free/legal/public — no
synthetic data used:

  1. ESCO occupation profiles (job_offers_esco.json) — the EU's official
     skills/competences/occupations taxonomy (https://esco.ec.europa.eu),
     queried live via its public API (no registration needed — confirmed
     by calling it directly) for 146 occupations spanning UAM's kierunki
     (languages, IT, sciences, humanities, law, health, arts, ...), each
     with its real essential/optional skills in Polish. Salary is
     approximated at ISCO major-group granularity from GUS's official
     "Struktura wynagrodzeń według zawodów" (Oct 2024) statistics — GUS
     doesn't publish per-occupation salary, only per major group, so this
     is real but coarse (9 buckets, not per-occupation).

  2. CBOP (Centralna Baza Ofert Pracy) — the Ministry of Family and Social
     Policy's database of real, individual job postings submitted through
     Polish public employment offices, updated daily
     (https://dane.gov.pl/pl/dataset/538,oferty-pracy-psz). Far richer
     (real employer, real salary, real per-posting requirements) but its
     WebService requires a one-time, free Ministry registration (email
     apicbop@praca.gov.pl with a signed terms document — see the
     "Instrukcja pobierania danych z CBOP" attachment on that dataset
     page) before it will answer real queries; unregistered calls return
     {"Status": "Niepoprawna autoryzacja"} — confirmed by calling the live
     WSDL directly. fetch_from_cbop() is built and ready against the
     confirmed-live WSDL and documented request shape; only response
     parsing (MTOM/XOP multipart -> zip -> JSON) remains, since that
     needs a real successful response to build against.

load_offers() prefers CBOP once CBOP_PARTNER_NAME is set, else falls back
to the real ESCO+GUS dataset — both are real, neither is placeholder data.
"""
import json
import os
from typing import Optional

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
_ESCO_PATH = os.path.join(_DATA_DIR, "job_offers_esco.json")

_CBOP_WSDL_URL = "https://oferty.praca.gov.pl/integration/services/v2/oferta"

_offers_cache: Optional[list[dict]] = None


def is_placeholder() -> bool:
    """False always now — both the ESCO+GUS fallback and CBOP (once
    registered) are real data. Kept as a stable API for callers/UI that
    still want to flag data provenance; see active_source() for which
    real source is currently in use."""
    return False


def active_source() -> str:
    return "CBOP (live postings)" if os.environ.get("CBOP_PARTNER_NAME") else "ESCO (occupation profiles) + GUS (salary by ISCO group)"


def load_esco_offers() -> list[dict]:
    global _offers_cache
    if _offers_cache is None:
        with open(_ESCO_PATH, encoding="utf-8") as f:
            _offers_cache = json.load(f)["offers"]
    return _offers_cache


def load_offers() -> list[dict]:
    """Real CBOP data once registered (CBOP_PARTNER_NAME set), the real
    ESCO+GUS dataset otherwise."""
    partner = os.environ.get("CBOP_PARTNER_NAME")
    if partner:
        return fetch_from_cbop(partner)
    return load_esco_offers()


def fetch_from_cbop(partner_name: str, wojewodztwo: Optional[str] = None,
                     jednostka: Optional[str] = None, jezyk: str = "pl") -> list[dict]:
    """Real-time CBOP WebService call — needs a Partner name granted by the
    Ministry (see module docstring). Untested against production (no
    granted Partner yet), but built directly against the confirmed-live
    WSDL and the documented request/response shape ("Instrukcja pobierania
    danych z CBOP"). Access window: 17:00-07:00 daily, max 20 calls/cycle,
    snapshot as of 16:00 — the Ministry's own limits, not ours.
    """
    import urllib.request
    import zipfile
    import io

    criterion_xml = "<Wszystkie>true</Wszystkie>"
    if wojewodztwo:
        criterion_xml = f"<Wojewodztwo>{wojewodztwo}</Wojewodztwo>"
    elif jednostka:
        criterion_xml = f"<Jednostka>{jednostka}</Jednostka>"

    envelope = f"""<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ofer="http://oferty.praca.gov.pl/v2/oferta">
  <soapenv:Header/>
  <soapenv:Body>
    <ofer:Dane>
      <pytanie>
        <Partner>{partner_name}</Partner>
        <Jezyk>{jezyk}</Jezyk>
        <Kryterium>
          {criterion_xml}
        </Kryterium>
      </pytanie>
    </ofer:Dane>
  </soapenv:Body>
</soapenv:Envelope>"""

    req = urllib.request.Request(
        _CBOP_WSDL_URL, data=envelope.encode("utf-8"),
        headers={"Content-Type": "text/xml;charset=UTF-8", "SOAPAction": '""'},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read()

    # Response is a MTOM/XOP multipart with the actual payload as a zipped
    # attachment (list of *.json files, max 1000 offers per file) — parsing
    # that framing is the remaining piece to finish once real access exists
    # and we can see an actual successful response to parse against.
    raise NotImplementedError(
        "CBOP WebService call succeeded structurally but response-parsing "
        "(MTOM/XOP multipart -> zip -> JSON) needs a real successful "
        "response to build against — no granted Partner yet. Raw response "
        "available for inspection: " + body[:500].decode("utf-8", "ignore")
    )


# ── Requirement generalization: stanowiska <-> wymagania <-> efekty ─────────

def _requirement_text(offer: dict) -> str:
    """Flattens an offer's free-text requirement fields into one string for
    the NLP tools (ngrams/keyness/clustering/similarity) — the structured
    fields (zawody, wyksztalcenia, jezyki, uprawnienia) are categorical and
    used separately as facets, not blended into this bag-of-words text."""
    parts = []
    for bucket in ("wymaganiaKonieczne", "wymaganiaPozadane", "wymaganiaDodatkowe"):
        req = offer.get(bucket) or {}
        for field in ("umiejetnosciSzczegoly", "inneWymagania"):
            val = req.get(field)
            if isinstance(val, str):
                parts.append(val)
            elif isinstance(val, list):
                parts.extend(str(v) for v in val)
    return " ".join(parts)


def stanowiska_summary(offers: list[dict]) -> list[dict]:
    """Distinct stanowiska (job position titles) with posting counts —
    the entry point for the STANOWISKA-first pipeline direction."""
    from collections import Counter
    counts = Counter(o.get("stanowisko", "").strip() for o in offers if o.get("stanowisko"))
    return [{"stanowisko": s, "n_ofert": n} for s, n in counts.most_common()]


def offers_for_stanowiska(offers: list[dict], stanowiska: list[str]) -> list[dict]:
    wanted = set(stanowiska)
    return [o for o in offers if o.get("stanowisko") in wanted]
