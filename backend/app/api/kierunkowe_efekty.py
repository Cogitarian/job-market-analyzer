import json
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services.efekty_corpus import derive_stopien

router = APIRouter()

_DATA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "kierunkowe_efekty.json"
)

_cache: dict | None = None


def _load() -> dict:
    global _cache
    if _cache is None:
        if not os.path.exists(_DATA_PATH):
            _cache = {}
        else:
            with open(_DATA_PATH, encoding="utf-8") as f:
                _cache = json.load(f)
    return _cache


@router.get("/kierunki")
async def list_kierunki():
    """All kierunki with an officially published kierunkowe efekty document."""
    data = _load()
    out = []
    for key, entry in data.items():
        efekty = [e for e in entry["efekty"] if "kod" in e]
        by_stopien = {"I": 0, "II": 0, "III": 0, "": 0}
        for e in efekty:
            s = derive_stopien(e["kod"], e.get("prk", []), e.get("stopien", ""))
            by_stopien[s if s in by_stopien else ""] += 1
        out.append({
            "key": key,
            "kierunek": entry["kierunek"],
            "uchwala_nr": entry["uchwala_nr"],
            "n_efekty": len(efekty),
            "categories": {
                cat: sum(1 for e in efekty if e["category"] == cat)
                for cat in ("knowledge", "skills", "competences")
            },
            # A single BIP resolution frequently covers both I and II stopień
            # at once (43/159 kierunki in this dataset do) — this tells the
            # frontend whether a stopień selector is even needed here.
            "by_stopien": by_stopien,
        })
    out.sort(key=lambda x: x["kierunek"])
    return {"kierunki": out, "total": len(out)}


@router.get("/kierunki/{key}")
async def get_kierunek_efekty(key: str):
    data = _load()
    entry = data.get(key)
    if not entry:
        raise HTTPException(404, "Nie znaleziono kierunku")
    annotated = dict(entry)
    annotated["efekty"] = [
        {**e, "stopien": derive_stopien(e["kod"], e.get("prk", []), e.get("stopien", ""))}
        if "kod" in e else e
        for e in entry["efekty"]
    ]
    return annotated


class SearchRequest(BaseModel):
    query: str
    top_k: int = 20
    stopien: Optional[str] = None


@router.post("/search")
async def search_efekty(req: SearchRequest):
    """TF-IDF search across every kierunek's official kierunkowe efekty."""
    from app.services.outcomes_nlp import build_tfidf, cosine_similarity

    data = _load()
    all_efekty = []
    for entry in data.values():
        for e in entry.get("efekty", []):
            if "kod" not in e:
                continue
            stopien = derive_stopien(e["kod"], e.get("prk", []), e.get("stopien", ""))
            if req.stopien and stopien != req.stopien:
                continue
            all_efekty.append({**e, "stopien": stopien, "kierunek": entry["kierunek"]})

    if not all_efekty:
        return {"results": [], "message": "Brak danych — uruchom najpierw scraping"}

    texts = [e["opis"] for e in all_efekty]
    tfidf_vectors, _ = build_tfidf(texts + [req.query])
    query_vec = tfidf_vectors[-1]
    doc_vecs = tfidf_vectors[:-1]

    scored = sorted(
        ((cosine_similarity(query_vec, dv), i) for i, dv in enumerate(doc_vecs)),
        reverse=True,
    )

    results = [
        {"score": score, "efekt": all_efekty[idx]}
        for score, idx in scored[:req.top_k]
        if score > 0.01
    ]
    return {"results": results, "query": req.query}
