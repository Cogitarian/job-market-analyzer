from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


# ── Reverse lookup: outcomes → programs ──────────────────────────────────────

class SearchRequest(BaseModel):
    query: str
    top_k: int = 10


@router.post("/search")
async def search_outcomes(req: SearchRequest):
    """Find outcomes matching query text, return with their program context.
    Searches the full one-time-crawled university database (not a live
    scrape) — see app/services/syllabus_corpus.py."""
    from app.services import syllabus_corpus, corpus_nlp

    if not syllabus_corpus.is_available():
        return {"results": [], "message": "Baza sylabusów całego uniwersytetu jeszcze się buduje."}

    all_outcomes = []
    for uuid, syl in syllabus_corpus.load_courses().items():
        for o in syl.get("outcomes", []):
            all_outcomes.append({
                **o,
                "source_title": syl.get("title", ""),
                "source_uuid": uuid,
            })

    if not all_outcomes:
        return {"results": [], "message": "Baza sylabusów jest pusta"}

    texts = [o.get("description", "") for o in all_outcomes]
    scored = corpus_nlp.query_similarity_sklearn(texts, req.query, top_k=req.top_k)

    results = [{"score": s["score"], "outcome": all_outcomes[s["index"]]} for s in scored]
    return {"results": results, "query": req.query}
