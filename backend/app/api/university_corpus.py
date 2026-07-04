from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from collections import Counter

from app.services import syllabus_corpus, corpus_nlp, study_planner, phrase_tree
from app.services.efekty_corpus import load_corpus as load_efekty_corpus

router = APIRouter()


@router.get("/status")
async def get_status():
    if not syllabus_corpus.is_available():
        return {"available": False, "message": "Baza sylabusów całego uniwersytetu jeszcze się buduje."}
    courses = syllabus_corpus.load_courses()
    index = syllabus_corpus.load_kierunki_index()
    n_with_content = sum(1 for s in courses.values() if s.get("content"))
    return {
        "available": True,
        "n_courses": len(courses),
        "n_courses_with_content": n_with_content,
        "n_kierunek_variants": len(index),
    }


# ── Efekty kształcenia: scoped analysis straight from the one-time-crawled
# database (kierunek | wydział | cała uczelnia) — no live scraping, since the
# whole point of the crawl was to stop re-fetching syllabi that don't change
# between sessions. ──────────────────────────────────────────────────────────

@router.get("/faculties-list")
async def get_faculties_list():
    index = syllabus_corpus.load_kierunki_index()
    names = sorted({v["faculty_name"] for v in index.values()})
    return {"faculties": names}


@router.get("/kierunki-in-scope")
async def get_kierunki_in_scope(faculty_name: Optional[str] = None):
    index = syllabus_corpus.load_kierunki_index()
    names = sorted({
        v["kierunek"] for v in index.values()
        if not faculty_name or v["faculty_name"] == faculty_name
    })
    return {"kierunki": names}


def _scoped_outcomes(faculty_name: Optional[str] = None, kierunek: Optional[str] = None) -> list[dict]:
    courses = syllabus_corpus.load_courses()
    outcomes = []
    for uuid, syl in courses.items():
        if faculty_name or kierunek:
            variants = syllabus_corpus.course_to_kierunki(uuid)
            if faculty_name and not any(v["faculty_name"] == faculty_name for v in variants):
                continue
            if kierunek and not any(v["kierunek"] == kierunek for v in variants):
                continue
            if not variants:
                continue
        for o in syl.get("outcomes", []):
            outcomes.append({**o, "source_uuid": uuid, "source_title": syl.get("title", "")})
    return outcomes


class ScopedOutcomesRequest(BaseModel):
    faculty_name: Optional[str] = None  # None + kierunek None => cała uczelnia
    kierunek: Optional[str] = None


@router.post("/efekty-scoped")
async def post_efekty_scoped(req: ScopedOutcomesRequest):
    if not syllabus_corpus.is_available():
        raise HTTPException(503, "Baza sylabusów całego uniwersytetu jeszcze się buduje — spróbuj ponownie za jakiś czas.")

    outcomes = _scoped_outcomes(req.faculty_name, req.kierunek)
    if not outcomes:
        raise HTTPException(404, "Brak efektów dla tego zakresu")
    MAX_OUTCOMES = 3000
    if len(outcomes) > MAX_OUTCOMES:
        import random
        outcomes = random.Random(42).sample(outcomes, MAX_OUTCOMES)


    texts = [o.get("description", "") for o in outcomes]
    labels = [f"{o.get('code', '?')} ({o.get('category', '')})" for o in outcomes]
    categories = Counter(o.get("category", "?") for o in outcomes)

    # Cluster count scales with corpus size (cała uczelnia has ~87k outcomes,
    # a single kierunek has tens) rather than a fixed k regardless of scope.
    k = min(15, max(2, len(texts) // 150))
    cluster_result = corpus_nlp.kmeans_cluster_sklearn(texts, k=k)
    assignments = cluster_result["assignments"]
    clusters = []
    for ci, terms in cluster_result["cluster_terms"].items():
        members = [labels[i] for i, a in enumerate(assignments) if a == ci]
        clusters.append({"id": ci, "size": len(members), "top_terms": terms, "members": members[:20]})
    clusters.sort(key=lambda c: c["size"], reverse=True)

    bigrams = corpus_nlp.ngram_frequencies(texts, 2, 2, 15, 2)
    trigrams = corpus_nlp.ngram_frequencies(texts, 3, 3, 10, 2)

    n_sim = min(20, len(texts))
    sim_vectors, _ = corpus_nlp.build_tfidf(texts[:n_sim])
    sim_matrix = [
        [corpus_nlp.cosine_similarity_sparse(sim_vectors[i], sim_vectors[j]) for j in range(n_sim)]
        for i in range(n_sim)
    ]

    return {
        "n_outcomes": len(outcomes),
        "categories": dict(categories),
        "clusters": clusters,
        "bigrams": [{"ngram": b["ngram"], "count": b["count"]} for b in bigrams],
        "trigrams": [{"ngram": t["ngram"], "count": t["count"]} for t in trigrams],
        "similarity_matrix": {"labels": labels[:n_sim], "matrix": sim_matrix},
        "assignments": assignments,
        "outcomes": outcomes[:500],
    }


# ── Content comparison (mirrors efekty-analysis, but on `content` field) ────

@router.get("/content/all")
async def get_all_content(kierunek: Optional[str] = None, search: Optional[str] = None, limit: int = 200):
    corpus = syllabus_corpus.flatten_content_corpus()
    if kierunek:
        corpus = [c for c in corpus if kierunek.lower() in c["kierunek"].lower()]
    if search:
        s = search.lower()
        corpus = [c for c in corpus if s in c["opis"].lower() or s in c["title"].lower()]
    return {"courses": corpus[:limit], "total": len(corpus)}


@router.get("/content/ngrams")
async def get_content_ngrams(
    n_min: int = Query(1, ge=1, le=6), n_max: int = Query(3, ge=1, le=6),
    top_k: int = Query(50, ge=1, le=500), min_freq: int = Query(2, ge=1),
):
    corpus = syllabus_corpus.flatten_content_corpus()
    texts = [c["opis"] for c in corpus]
    results = corpus_nlp.ngram_frequencies(texts, n_min, n_max, top_k, min_freq)
    return {"ngrams": results, "n_docs": len(texts)}


@router.get("/content/collocations")
async def get_content_collocations(
    n_min: int = Query(2, ge=2, le=6), n_max: int = Query(4, ge=2, le=6),
    top_k: int = Query(50, ge=1, le=500), min_freq: int = Query(3, ge=1),
    sort_by: str = Query("pmi", pattern="^(pmi|count)$"),
):
    corpus = syllabus_corpus.flatten_content_corpus()
    texts = [c["opis"] for c in corpus]
    results = corpus_nlp.collocations(texts, n_min, n_max, top_k, min_freq, sort_by=sort_by)
    return {"collocations": results, "n_docs": len(texts)}


class ContentKeynessRequest(BaseModel):
    kierunek: str
    n: int = 1
    min_freq: int = 2
    top_k: int = 30
    measure: str = "loglik"


@router.post("/content/keyness")
async def post_content_keyness(req: ContentKeynessRequest):
    corpus = syllabus_corpus.flatten_content_corpus()
    target = [c["opis"] for c in corpus if req.kierunek.lower() in c["kierunek"].lower()]
    rest = [c["opis"] for c in corpus if req.kierunek.lower() not in c["kierunek"].lower()]
    if not target:
        raise HTTPException(404, "Brak przedmiotów dla tego kierunku")
    results = corpus_nlp.keyness(target, rest, req.n, req.min_freq, req.top_k, req.measure)
    return {"keyness": results, "n_target": len(target), "n_rest": len(rest)}


class ContentClusterRequest(BaseModel):
    k: int = 15


@router.post("/content/clusters")
async def post_content_clusters(req: ContentClusterRequest):
    corpus = syllabus_corpus.flatten_content_corpus()
    texts = [c["opis"] for c in corpus]
    MAX_DOCS = 3000
    if len(corpus) > MAX_DOCS:
        import random
        idx = random.Random(42).sample(range(len(corpus)), MAX_DOCS)
        corpus = [corpus[i] for i in idx]
        texts = [texts[i] for i in idx]
    result = corpus_nlp.kmeans_cluster_sklearn(texts, k=req.k)
    assignments = result["assignments"]
    clusters = []
    for ci, terms in result["cluster_terms"].items():
        members = [corpus[i] for i, a in enumerate(assignments) if a == ci]
        kierunki_in_cluster = Counter(m["kierunek"] for m in members)
        clusters.append({
            "cluster": ci, "size": len(members), "top_terms": terms,
            "top_kierunki": kierunki_in_cluster.most_common(8),
            "sample_courses": [{"title": m["title"], "kierunek": m["kierunek"]} for m in members[:5]],
        })
    clusters.sort(key=lambda c: c["size"], reverse=True)
    return {"clusters": clusters, "n_docs": len(texts)}


class ContentSimilarRequest(BaseModel):
    selected_ids: list[str]
    method: str = "tfidf"
    top_k: int = 30
    n_topics: int = 20


@router.post("/content/similar")
async def post_content_similar(req: ContentSimilarRequest):
    corpus = syllabus_corpus.flatten_content_corpus()
    if not req.selected_ids:
        raise HTTPException(400, "Wybierz co najmniej jeden przedmiot")
    try:
        results = corpus_nlp.find_similar(corpus, req.selected_ids, req.method, req.top_k, req.n_topics)
    except ValueError as e:
        raise HTTPException(400, str(e))
    kierunki_summary = Counter(r["kierunek"] for r in results)
    return {"courses": results, "kierunki_summary": kierunki_summary.most_common()}


def _outcomes_corpus() -> list[dict]:
    courses = syllabus_corpus.load_courses()
    corpus = []
    for uuid, syl in courses.items():
        variants = syllabus_corpus.course_to_kierunki(uuid)
        kierunki_names = sorted({v["kierunek"] for v in variants}) or ["?"]
        kierunek_display = ", ".join(kierunki_names[:3]) + ("…" if len(kierunki_names) > 3 else "")
        for o in syl.get("outcomes", []):
            corpus.append({
                "id": f"{uuid}::{o.get('code', '')}",
                "kod": o.get("code", ""), "kierunek_key": uuid,
                "kierunek": kierunek_display,
                "kierunki_list": kierunki_names,
                "kierunek_skrot": "", "stopien": "",
                "category": o.get("category", "unknown"), "opis": o.get("description", ""), "prk": [],
                "przedmiot": syl.get("title", ""),
                "_uuid": uuid,
            })
    return corpus


@router.get("/outcomes/all")
async def get_all_outcomes(search: Optional[str] = None, category: Optional[str] = None, limit: int = 200):
    corpus = _outcomes_corpus()
    if search:
        s = search.lower()
        corpus = [c for c in corpus if s in c["opis"].lower() or s in c["kierunek"].lower()]
    if category:
        corpus = [c for c in corpus if c["category"] == category]
    return {"efekty": corpus[:limit], "total": len(corpus)}


# ── Study planner ("Zaplanuj swoje studia") — two-stage flow ────────────────
#
# Stage 1 (discover): pick a criterion (efekty kierunkowe | efekty
# przedmiotów | treści przedmiotów), select some efekty/treści from the full
# corpus, run a similarity/clustering method over it -> get back a ranked
# list of KIERUNKI that have matching content (not an immediate course plan).
#
# Stage 2 (plan): given the kierunki the user actually picks from that list,
# resolve the PRZEDMIOTY that realize them (filtered by poziom/forma) and
# aggregate hours/assessments.

class DiscoverRequest(BaseModel):
    criterion: str  # "kierunkowe" | "przedmiotowe" | "tresci"
    selected_ids: list[str]
    method: str = "tfidf"
    top_k: int = 100
    n_topics: int = 20


def _corpus_for_criterion(criterion: str) -> list[dict]:
    if criterion == "kierunkowe":
        return load_efekty_corpus()
    if not syllabus_corpus.is_available():
        raise HTTPException(503, "Baza sylabusów całego uniwersytetu jeszcze się buduje — spróbuj ponownie za jakiś czas.")
    if criterion == "przedmiotowe":
        return _outcomes_corpus()
    if criterion == "tresci":
        return syllabus_corpus.flatten_content_corpus()
    raise HTTPException(400, f"Nieznane kryterium: {criterion}")


@router.post("/discover-kierunki")
async def post_discover_kierunki(req: DiscoverRequest):
    if not req.selected_ids:
        raise HTTPException(400, "Wybierz co najmniej jeden efekt/treść")

    corpus = _corpus_for_criterion(req.criterion)
    by_id = {c["id"]: c for c in corpus}
    selected_items = [by_id[i] for i in req.selected_ids if i in by_id]

    try:
        similar = corpus_nlp.find_similar(corpus, req.selected_ids, req.method, req.top_k, req.n_topics)
    except ValueError as e:
        raise HTTPException(400, str(e))

    # Tally kierunki across both the user's direct selection and everything
    # found similar to it — "efekty kierunkowe -> kierunki" means "which
    # kierunki have this kind of content", which trivially includes the
    # kierunki the selected items themselves already belong to.
    tally: Counter = Counter()
    for item in selected_items + similar:
        names = item.get("kierunki_list") or ([item["kierunek"]] if item.get("kierunek") else [])
        for n in names:
            if n and n != "?":
                tally[n] += 1

    kierunki = [{"kierunek": k, "n_matches": n} for k, n in tally.most_common()]
    return {"items": similar, "selected_items": selected_items, "kierunki": kierunki}


# ── "Drzewo poziome" — horizontal list-based drill-down alternative to
# browsing the flat efekty/treści list in step 3 of the planner: a ranked
# list of opening words, click one to see what follows it, and so on.
# Reuses the same lemmatized-phrase trie as the "Drzewo czasownikowe" tab,
# generalized to whichever corpus the active criterion needs (see
# phrase_tree.py for why each criterion needs a different phrase-extraction
# mode — kierunkowe efekty have no leading verb in the stored text at all,
# przedmiotowe efekty already do, treści are topic-noun-phrases with no
# verb to anchor on). ────────────────────────────────────────────────────

_TREE_MODE = {"kierunkowe": "kierunkowe_efekty", "przedmiotowe": "verb", "tresci": "sequence"}


class PhraseTreeRequest(BaseModel):
    criterion: str
    max_words: int = 6
    min_freq: int = 5
    max_branches: int = 6
    max_depth: int = 6


@router.post("/phrase-tree")
async def post_phrase_tree(req: PhraseTreeRequest):
    corpus = _corpus_for_criterion(req.criterion)
    mode = _TREE_MODE.get(req.criterion)
    if not mode:
        raise HTTPException(400, f"Nieznane kryterium: {req.criterion}")
    trees = phrase_tree.build_tree(
        corpus, cache_name=req.criterion, mode=mode,
        max_words=req.max_words, min_freq=req.min_freq,
        max_branches=req.max_branches, max_depth=req.max_depth,
        group_by_category=(req.criterion != "tresci"),
    )
    return {"trees": trees}


class PhraseResolveRequest(BaseModel):
    criterion: str
    path: list[str]
    category: Optional[str] = None
    max_words: int = 6


@router.post("/phrase-tree/resolve")
async def post_phrase_resolve(req: PhraseResolveRequest):
    """Every item id under the branch the user has drilled down to —
    called on demand only for the clicked path, not baked into every node,
    so browsing the tree itself stays lightweight."""
    corpus = _corpus_for_criterion(req.criterion)
    mode = _TREE_MODE.get(req.criterion)
    if not mode:
        raise HTTPException(400, f"Nieznane kryterium: {req.criterion}")
    ids = phrase_tree.resolve_path(
        corpus, cache_name=req.criterion, mode=mode, path=req.path,
        category=req.category, max_words=req.max_words,
    )
    return {"ids": ids, "count": len(ids)}


class PlanRequest(BaseModel):
    kierunki: list[str]
    poziom: str = "MIXED"  # "LIC" | "MGR" | "MIXED"
    forma: str = "MIXED"   # "STACJ" | "NIESTACJ" | "MIXED"
    max_godzin_semestr: Optional[int] = None
    min_ects_semestr: Optional[float] = None


@router.post("/plan")
async def post_plan(req: PlanRequest):
    if not syllabus_corpus.is_available():
        raise HTTPException(503, "Baza sylabusów całego uniwersytetu jeszcze się buduje — spróbuj ponownie za jakiś czas.")
    if not req.kierunki:
        raise HTTPException(400, "Wybierz co najmniej jeden kierunek")

    course_uuids = study_planner.courses_for_kierunki(req.kierunki, req.poziom, req.forma)
    plan = study_planner.build_plan(
        course_uuids, poziom=req.poziom, forma=req.forma,
        max_godzin_semestr=req.max_godzin_semestr, min_ects_semestr=req.min_ects_semestr,
    )

    unmatched = [
        k for k in req.kierunki
        if not syllabus_corpus.resolve_kierunek_variants(k, req.poziom, req.forma)
    ]
    plan["kierunki_unmatched"] = unmatched
    return plan
