from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from collections import Counter

from app.services import job_offers, corpus_nlp
from app.services.efekty_corpus import load_corpus as load_efekty_corpus

router = APIRouter()


@router.get("/status")
async def get_status():
    offers = job_offers.load_offers()
    source = job_offers.active_source()
    return {
        "is_placeholder": job_offers.is_placeholder(),
        "source": source,
        "n_offers": len(offers),
        "message": (
            "CBOP (żywe, indywidualne oferty pracy z Ministerstwa) wymaga jednorazowej rejestracji "
            "jako Partner — zobacz app/services/job_offers.py, sekcja CBOP, po jej zakończeniu dane "
            "przełączą się automatycznie."
        ),
    }


@router.get("/stanowiska")
async def get_stanowiska():
    offers = job_offers.load_offers()
    return {"stanowiska": job_offers.stanowiska_summary(offers), "is_placeholder": job_offers.is_placeholder()}


class WymaganiaRequest(BaseModel):
    stanowiska: Optional[list[str]] = None  # None/empty = all offers
    n_min: int = 1
    n_max: int = 3
    top_k: int = 40
    min_freq: int = 1


@router.post("/wymagania")
async def post_wymagania(req: WymaganiaRequest):
    """Generalizes the free-text requirement fields (umiejetnosciSzczegoly,
    inneWymagania) across the selected stanowiska into ranked n-grams, plus
    tallies the structured categorical fields (wyksztalcenia/jezyki/
    uprawnienia) directly — those don't need NLP generalization, CBOP
    already returns them as discrete values."""
    offers = job_offers.load_offers()
    if req.stanowiska:
        offers = job_offers.offers_for_stanowiska(offers, req.stanowiska)
    if not offers:
        raise HTTPException(404, "Brak ofert dla wybranych stanowisk")

    texts = [job_offers._requirement_text(o) for o in offers]
    ngrams = corpus_nlp.ngram_frequencies(texts, req.n_min, req.n_max, req.top_k, req.min_freq)

    facets: dict[str, Counter] = {"wyksztalcenia": Counter(), "jezyki": Counter(), "uprawnienia": Counter()}
    for o in offers:
        for bucket in ("wymaganiaKonieczne", "wymaganiaPozadane", "wymaganiaDodatkowe"):
            req_bucket = o.get(bucket) or {}
            for field in facets:
                val = req_bucket.get(field)
                if val:
                    facets[field][val] += 1

    return {
        "n_offers": len(offers),
        "ngrams": ngrams,
        "facets": {k: [{"value": v, "count": n} for v, n in c.most_common(30)] for k, c in facets.items()},
        "is_placeholder": job_offers.is_placeholder(),
    }


class StanowiskaForWymaganiaRequest(BaseModel):
    terms: list[str]


@router.post("/stanowiska-for-wymagania")
async def post_stanowiska_for_wymagania(req: StanowiskaForWymaganiaRequest):
    """Reverse direction: given selected requirement terms, which
    stanowiska actually ask for them."""
    if not req.terms:
        raise HTTPException(400, "Wybierz co najmniej jeden wymóg")
    offers = job_offers.load_offers()
    wanted = [t.lower() for t in req.terms]

    matches = Counter()
    for o in offers:
        text = job_offers._requirement_text(o).lower()
        if any(t in text for t in wanted):
            stanowisko = o.get("stanowisko", "").strip()
            if stanowisko:
                matches[stanowisko] += 1

    return {
        "stanowiska": [{"stanowisko": s, "n_matches": n} for s, n in matches.most_common()],
        "is_placeholder": job_offers.is_placeholder(),
    }


class EfektyForWymaganiaRequest(BaseModel):
    terms: list[str]
    top_k: int = 40


@router.post("/efekty-for-wymagania")
async def post_efekty_for_wymagania(req: EfektyForWymaganiaRequest):
    """Matches selected requirement terms (free text, from job postings)
    against the full kierunkowe-efekty corpus by TF-IDF query similarity —
    the resulting efekt ids feed directly into the existing
    /api/university-corpus/discover-kierunki -> /plan pipeline, so
    kierunki/przedmioty/program-building for a job-market-driven selection
    reuses the same machinery as the study planner's own efekty-first flow."""
    if not req.terms:
        raise HTTPException(400, "Wybierz co najmniej jeden wymóg")

    corpus = load_efekty_corpus()
    texts = [c["opis"] for c in corpus]
    query = " ".join(req.terms)
    scored = corpus_nlp.query_similarity_sklearn(texts, query, top_k=req.top_k)

    results = [{**corpus[s["index"]], "similarity": s["score"]} for s in scored]
    kierunki_summary = Counter(r["kierunek"] for r in results)
    return {
        "efekty": results,
        "kierunki_summary": kierunki_summary.most_common(),
        "is_placeholder": job_offers.is_placeholder(),
    }
