from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from collections import Counter

from app.services.efekty_corpus import load_corpus
from app.services import corpus_nlp
from app.services import verb_tree
from app.services import phrase_structure

router = APIRouter()


@router.get("/all")
async def get_all_efekty(kierunek_key: Optional[str] = None, stopien: Optional[str] = None):
    """Full flattened corpus — every efekt tagged with kierunek_skrot/stopien
    so the frontend can render/filter/group without extra lookups."""
    corpus = load_corpus()
    if kierunek_key:
        corpus = [c for c in corpus if c["kierunek_key"] == kierunek_key]
    if stopien:
        corpus = [c for c in corpus if c["stopien"] == stopien]
    return {"efekty": corpus, "total": len(corpus)}


@router.get("/kierunki-list")
async def get_kierunki_list():
    """Distinct kierunki present in the corpus, for the comparison-target
    selector — each tagged with a per-stopień efekt-count breakdown, since a
    single BIP resolution frequently covers both I and II stopień at once
    (43/159 kierunki in this corpus do)."""
    corpus = load_corpus()
    seen = {}
    for c in corpus:
        entry = seen.setdefault(c["kierunek_key"], {
            "kierunek_key": c["kierunek_key"], "kierunek": c["kierunek"], "n_efekty": 0,
            "by_stopien": {"I": 0, "II": 0, "III": 0, "": 0},
        })
        entry["n_efekty"] += 1
        entry["by_stopien"][c["stopien"] if c["stopien"] in entry["by_stopien"] else ""] += 1
    return {"kierunki": sorted(seen.values(), key=lambda k: k["kierunek"])}


@router.get("/ngrams")
async def get_ngrams(
    n_min: int = Query(1, ge=1, le=6),
    n_max: int = Query(3, ge=1, le=6),
    top_k: int = Query(50, ge=1, le=500),
    min_freq: int = Query(2, ge=1),
    kierunek_key: Optional[str] = None,
    stopien: Optional[str] = None,
):
    corpus = load_corpus()
    if kierunek_key:
        corpus = [c for c in corpus if c["kierunek_key"] == kierunek_key]
    if stopien:
        corpus = [c for c in corpus if c["stopien"] == stopien]
    texts = [c["opis"] for c in corpus]
    results = corpus_nlp.ngram_frequencies(texts, n_min, n_max, top_k, min_freq)
    return {"ngrams": results, "n_docs": len(texts)}


@router.get("/collocations")
async def get_collocations(
    n_min: int = Query(2, ge=2, le=6),
    n_max: int = Query(4, ge=2, le=6),
    top_k: int = Query(50, ge=1, le=500),
    min_freq: int = Query(3, ge=1),
    sort_by: str = Query("pmi", pattern="^(pmi|count)$"),
    kierunek_key: Optional[str] = None,
    stopien: Optional[str] = None,
):
    corpus = load_corpus()
    if kierunek_key:
        corpus = [c for c in corpus if c["kierunek_key"] == kierunek_key]
    if stopien:
        corpus = [c for c in corpus if c["stopien"] == stopien]
    texts = [c["opis"] for c in corpus]
    sort_field = "pmi" if sort_by == "pmi" else "count"
    results = corpus_nlp.collocations(texts, n_min, n_max, top_k, min_freq, sort_by=sort_field)
    return {"collocations": results, "n_docs": len(texts)}


class KeynessRequest(BaseModel):
    kierunek_key: str
    stopien: Optional[str] = None
    n: int = 1
    min_freq: int = 2
    top_k: int = 30
    measure: str = "loglik"  # "loglik" | "ratio"


@router.post("/keyness")
async def post_keyness(req: KeynessRequest):
    corpus = load_corpus()
    if req.stopien:
        corpus = [c for c in corpus if c["stopien"] == req.stopien]
    target_texts = [c["opis"] for c in corpus if c["kierunek_key"] == req.kierunek_key]
    rest_texts = [c["opis"] for c in corpus if c["kierunek_key"] != req.kierunek_key]
    if not target_texts:
        raise HTTPException(404, "Nie znaleziono kierunku w korpusie")
    results = corpus_nlp.keyness(target_texts, rest_texts, req.n, req.min_freq, req.top_k, req.measure)
    return {"keyness": results, "n_target": len(target_texts), "n_rest": len(rest_texts)}


class TopicsRequest(BaseModel):
    method: str = "lsa"  # "lsa" | "lda"
    n_topics: int = 10
    top_terms: int = 10
    kierunek_key: Optional[str] = None
    stopien: Optional[str] = None


@router.post("/topics")
async def post_topics(req: TopicsRequest):
    corpus = load_corpus()
    if req.kierunek_key:
        corpus = [c for c in corpus if c["kierunek_key"] == req.kierunek_key]
    if req.stopien:
        corpus = [c for c in corpus if c["stopien"] == req.stopien]
    texts = [c["opis"] for c in corpus]
    fn = corpus_nlp.lsa_topics if req.method == "lsa" else corpus_nlp.lda_topics
    result = fn(texts, n_topics=req.n_topics, top_terms=req.top_terms)
    return {"topics": result["topics"], "n_docs": len(texts)}


class ClusterRequest(BaseModel):
    k: int = 15
    kierunek_key: Optional[str] = None
    stopien: Optional[str] = None


@router.post("/clusters")
async def post_clusters(req: ClusterRequest):
    corpus = load_corpus()
    if req.kierunek_key:
        corpus = [c for c in corpus if c["kierunek_key"] == req.kierunek_key]
    if req.stopien:
        corpus = [c for c in corpus if c["stopien"] == req.stopien]
    texts = [c["opis"] for c in corpus]
    result = corpus_nlp.kmeans_cluster_sklearn(texts, k=req.k)
    assignments = result["assignments"]

    clusters = []
    for ci, terms in result["cluster_terms"].items():
        members = [corpus[i] for i, a in enumerate(assignments) if a == ci]
        kierunki_in_cluster = Counter(m["kierunek"] for m in members)
        clusters.append({
            "cluster": ci,
            "size": len(members),
            "top_terms": terms,
            "top_kierunki": kierunki_in_cluster.most_common(8),
            "sample_efekty": members[:5],
        })
    clusters.sort(key=lambda c: c["size"], reverse=True)
    return {"clusters": clusters, "n_docs": len(texts)}


class SimilarRequest(BaseModel):
    selected_ids: list[str]
    method: str = "tfidf"  # "tfidf" | "lsa" | "lda" | "cluster" | "embeddings"
    top_k: int = 30
    n_topics: int = 20


@router.post("/similar")
async def post_similar(req: SimilarRequest):
    corpus = load_corpus()
    if not req.selected_ids:
        raise HTTPException(400, "Wybierz co najmniej jeden efekt")
    try:
        results = corpus_nlp.find_similar(corpus, req.selected_ids, req.method, req.top_k, req.n_topics)
    except ValueError as e:
        raise HTTPException(400, str(e))

    kierunki_summary = Counter(r["kierunek"] for r in results)
    return {
        "efekty": results,
        "kierunki_summary": kierunki_summary.most_common(),
    }



class VerbTreeRequest(BaseModel):
    max_words: int = 6
    min_freq: int = 5
    max_branches: int = 6
    max_depth: int = 6


@router.post("/verb-tree")
async def post_verb_tree(req: VerbTreeRequest):
    """Lemmatized, POS-anchored verb-phrase tree per category (knowledge/
    skills/competences): category -> verb -> next word -> next word ...,
    aggregated across the whole corpus. First call lemmatizes+POS-tags the
    full corpus (~15s, cached in-process afterward)."""
    corpus = load_corpus()
    trees = verb_tree.verb_trees_by_category(
        corpus, max_words=req.max_words, min_freq=req.min_freq,
        max_branches=req.max_branches, max_depth=req.max_depth,
    )
    return {"trees": trees}


# ── Structural decomposition: [orzeczenie] + [zakres]? + [umiejętność]? +
# [dziedzina] — see phrase_structure.py for the empirical check behind this
# (skills efekty have a real skill-verb 99.97% of the time; wiedza/
# kompetencje only ~10-14%, so those two middle slots are genuinely
# optional, not universal). ───────────────────────────────────────────────

@router.get("/structure-facets")
async def get_structure_facets():
    """Distinct filterable values for each slot, with corpus-wide counts,
    so the frontend can render "any / skip" + a ranked dropdown per slot."""
    decomposed = phrase_structure.decompose_corpus()
    return phrase_structure.facets(decomposed)


class StructureFilterRequest(BaseModel):
    category: Optional[str] = None
    orzeczenie: Optional[str] = None
    zakres: Optional[str] = None
    umiejetnosc: Optional[str] = None
    dziedzina: Optional[list[str]] = None
    limit: int = 300


@router.post("/structure-filter")
async def post_structure_filter(req: StructureFilterRequest):
    """Every field is optional/skippable — omitted means "any" for that
    slot. Returns matching efekty tagged with kierunek/kod for selection."""
    decomposed = phrase_structure.decompose_corpus()
    matches = phrase_structure.filter_efekty(
        decomposed, category=req.category, orzeczenie=req.orzeczenie,
        zakres=req.zakres, umiejetnosc=req.umiejetnosc, dziedzina=req.dziedzina,
    )
    corpus_by_id = {c["id"]: c for c in load_corpus()}
    efekty = [corpus_by_id[m["id"]] for m in matches if m["id"] in corpus_by_id]
    return {"efekty": efekty[:req.limit], "total": len(efekty)}
