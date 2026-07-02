"""
Comparative NLP analysis over the flattened kierunkowe-efekty corpus:
n-grams (1-6), collocations (2-6, frequency + PMI strength), per-kierunek
keyness (which words/n-grams are distinctively frequent for one kierunek
vs the rest), and similarity/topic methods (TF-IDF cosine, LSA, LDA,
k-means) for "find kierunki with similar efekty" queries.

Every method takes its tunable parameters as explicit arguments — callers
(the API layer) expose these as query/body params so the frontend can let
the user adjust them, since which method/threshold works best isn't known
in advance.
"""
import math
from collections import Counter
from typing import Optional

from app.services.outcomes_nlp import tokenize


# ── N-grams ───────────────────────────────────────────────────────────────────

def extract_ngrams(tokens: list[str], n: int) -> list[str]:
    if len(tokens) < n:
        return []
    return [" ".join(tokens[i:i + n]) for i in range(len(tokens) - n + 1)]


def ngram_frequencies(texts: list[str], n_min: int = 1, n_max: int = 6, top_k: int = 50, min_freq: int = 2) -> list[dict]:
    counters = {n: Counter() for n in range(n_min, n_max + 1)}
    for text in texts:
        tokens = tokenize(text)
        for n in range(n_min, n_max + 1):
            counters[n].update(extract_ngrams(tokens, n))

    results = []
    for n, counter in counters.items():
        for ngram, count in counter.items():
            if count >= min_freq:
                results.append({"ngram": ngram, "n": n, "count": count})
    results.sort(key=lambda r: r["count"], reverse=True)
    return results[:top_k]


# ── Collocations (frequency + PMI strength) ───────────────────────────────────

def collocations(texts: list[str], n_min: int = 2, n_max: int = 6, top_k: int = 50,
                  min_freq: int = 3, sort_by: str = "pmi") -> list[dict]:
    """Multivariate PMI: log2( P(w1..wn) / prod(P(wi)) ), estimated from
    corpus counts. `sort_by` is 'pmi' (association strength) or 'freq'
    (raw frequency) — both are always returned so the caller can re-sort
    client-side without a new request."""
    all_tokens: list[list[str]] = [tokenize(t) for t in texts]
    unigram_counts = Counter()
    total_tokens = 0
    for tokens in all_tokens:
        unigram_counts.update(tokens)
        total_tokens += len(tokens)

    results = []
    for n in range(n_min, n_max + 1):
        ngram_counts = Counter()
        for tokens in all_tokens:
            ngram_counts.update(extract_ngrams(tokens, n))

        for ngram, count in ngram_counts.items():
            if count < min_freq:
                continue
            words = ngram.split(" ")
            # P(ngram) approximated as count / total_tokens (unigram-scale denominator)
            p_ngram = count / total_tokens
            p_product = 1.0
            for w in words:
                p_product *= (unigram_counts[w] / total_tokens)
            if p_product <= 0:
                continue
            pmi = math.log2(p_ngram / p_product)
            results.append({"ngram": ngram, "n": n, "count": count, "pmi": round(pmi, 3)})

    results.sort(key=lambda r: r[sort_by], reverse=True)
    return results[:top_k]


# ── Keyness: distinctive words/n-grams for one kierunek vs the rest ──────────

def keyness(target_texts: list[str], rest_texts: list[str], n: int = 1,
            min_freq: int = 2, top_k: int = 30, measure: str = "loglik") -> list[dict]:
    """Log-likelihood (G2, Dunning 1993) or simple relative-frequency-ratio
    keyness, comparing n-gram frequency in target vs rest corpus."""
    def ngram_counts(texts):
        c = Counter()
        total = 0
        for t in texts:
            grams = extract_ngrams(tokenize(t), n)
            c.update(grams)
            total += len(grams)
        return c, total

    target_counts, target_total = ngram_counts(target_texts)
    rest_counts, rest_total = ngram_counts(rest_texts)

    results = []
    for ngram, a in target_counts.items():
        if a < min_freq:
            continue
        b = rest_counts.get(ngram, 0)
        c_ = target_total - a
        d = rest_total - b

        if measure == "ratio":
            rel_target = a / target_total
            rel_rest = (b + 1) / (rest_total + 1)  # +1 smoothing to avoid div-by-zero
            score = rel_target / rel_rest
        else:
            # Dunning log-likelihood G2
            e1 = target_total * (a + b) / (target_total + rest_total)
            e2 = rest_total * (a + b) / (target_total + rest_total)
            score = 0.0
            if a > 0 and e1 > 0:
                score += 2 * a * math.log(a / e1)
            if b > 0 and e2 > 0:
                score += 2 * b * math.log(b / e2)
            # sign: negative if actually under-represented vs expected
            if a / target_total < b / max(rest_total, 1):
                score = -score

        results.append({
            "ngram": ngram, "n": n,
            "count_target": a, "count_rest": b,
            "freq_target": round(a / target_total, 5) if target_total else 0,
            "freq_rest": round(b / rest_total, 5) if rest_total else 0,
            "score": round(score, 3),
        })

    results.sort(key=lambda r: r["score"], reverse=True)
    return results[:top_k]


# ── TF-IDF / cosine similarity (reused pattern from outcomes_nlp) ────────────

def build_tfidf(documents: list[str]) -> tuple[list[dict], list[str]]:
    tokenized = [tokenize(d) for d in documents]
    all_terms = set()
    for tokens in tokenized:
        all_terms.update(tokens)
    vocab = sorted(all_terms)

    tf_vectors = []
    for tokens in tokenized:
        counter = Counter(tokens)
        total = len(tokens) or 1
        tf_vectors.append({t: c / total for t, c in counter.items()})

    n_docs = len(documents)
    df = Counter()
    for tokens in tokenized:
        for t in set(tokens):
            df[t] += 1
    idf = {t: math.log((n_docs + 1) / (df[t] + 1)) + 1 for t in vocab}

    tfidf_vectors = []
    for tf in tf_vectors:
        vec = {t: tf.get(t, 0) * idf.get(t, 1) for t in tf}
        norm = math.sqrt(sum(v ** 2 for v in vec.values())) or 1
        tfidf_vectors.append({t: v / norm for t, v in vec.items()})

    return tfidf_vectors, vocab


def cosine_similarity_sparse(vec1: dict, vec2: dict) -> float:
    common = set(vec1) & set(vec2)
    return round(sum(vec1[t] * vec2[t] for t in common), 4)


# ── LSA (TruncatedSVD) and LDA (sklearn) topic models ────────────────────────

def lsa_topics(texts: list[str], n_topics: int = 10, top_terms: int = 10):
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.decomposition import TruncatedSVD

    vectorizer = TfidfVectorizer(tokenizer=tokenize, lowercase=False, token_pattern=None, min_df=2)
    X = vectorizer.fit_transform(texts)
    n_topics = min(n_topics, X.shape[0] - 1, X.shape[1] - 1)
    if n_topics < 1:
        return {"topics": [], "doc_topics": []}

    svd = TruncatedSVD(n_components=n_topics, random_state=42)
    doc_topics = svd.fit_transform(X)
    terms = vectorizer.get_feature_names_out()

    topics = []
    for i, component in enumerate(svd.components_):
        top_idx = component.argsort()[::-1][:top_terms]
        topics.append({"topic": i, "top_terms": [terms[j] for j in top_idx]})

    return {"topics": topics, "doc_topics": doc_topics.tolist()}


def lda_topics(texts: list[str], n_topics: int = 10, top_terms: int = 10):
    from sklearn.feature_extraction.text import CountVectorizer
    from sklearn.decomposition import LatentDirichletAllocation

    vectorizer = CountVectorizer(tokenizer=tokenize, lowercase=False, token_pattern=None, min_df=2)
    X = vectorizer.fit_transform(texts)
    n_topics = min(n_topics, X.shape[0] - 1)
    if n_topics < 1 or X.shape[1] < 1:
        return {"topics": [], "doc_topics": []}

    lda = LatentDirichletAllocation(n_components=n_topics, random_state=42, max_iter=20)
    doc_topics = lda.fit_transform(X)
    terms = vectorizer.get_feature_names_out()

    topics = []
    for i, component in enumerate(lda.components_):
        top_idx = component.argsort()[::-1][:top_terms]
        topics.append({"topic": i, "top_terms": [terms[j] for j in top_idx]})

    return {"topics": topics, "doc_topics": doc_topics.tolist()}


# ── K-means clustering (sklearn, replaces the from-scratch version for
#    n-document scale used here) ─────────────────────────────────────────────

def query_similarity_sklearn(texts: list[str], query: str, top_k: int = 20) -> list[dict]:
    """Free-text query vs. every text — sklearn's vectorized TfidfVectorizer,
    not the pure-Python build_tfidf above, which is fine for a few hundred
    docs (comparative-analysis endpoints) but far too slow for the
    full-university corpus (tens of thousands of course-level efekty)."""
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import linear_kernel

    vectorizer = TfidfVectorizer(tokenizer=tokenize, lowercase=False, token_pattern=None, min_df=1)
    X = vectorizer.fit_transform(texts + [query])
    sims = linear_kernel(X[-1], X[:-1]).flatten()

    ranked = sorted(range(len(texts)), key=lambda i: sims[i], reverse=True)[:top_k]
    return [{"index": i, "score": round(float(sims[i]), 4)} for i in ranked if sims[i] > 0.01]


def kmeans_cluster_sklearn(texts: list[str], k: int = 10) -> dict:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.cluster import KMeans

    vectorizer = TfidfVectorizer(tokenizer=tokenize, lowercase=False, token_pattern=None, min_df=2)
    X = vectorizer.fit_transform(texts)
    k = min(k, X.shape[0])
    if k < 1:
        return {"assignments": [], "cluster_terms": {}}

    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    assignments = km.fit_predict(X).tolist()
    terms = vectorizer.get_feature_names_out()

    cluster_terms = {}
    for ci in range(k):
        centroid = km.cluster_centers_[ci]
        top_idx = centroid.argsort()[::-1][:10]
        cluster_terms[ci] = [terms[j] for j in top_idx]

    return {"assignments": assignments, "cluster_terms": cluster_terms}


# ── Embeddings (sentence-transformers, lazy-loaded — heavier, optional) ──────

_embedder = None
_embedding_cache: dict[str, list] = {}


def _get_embedder():
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer
        _embedder = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
    return _embedder


def embed_texts(texts: list[str], cache_keys: Optional[list[str]] = None):
    """Encode texts to embedding vectors, caching by cache_key (e.g. efekt id)
    so repeated similarity queries over the same corpus don't re-embed."""
    import numpy as np

    if cache_keys is None:
        model = _get_embedder()
        return model.encode(texts, show_progress_bar=False)

    to_compute_idx = [i for i, k in enumerate(cache_keys) if k not in _embedding_cache]
    if to_compute_idx:
        model = _get_embedder()
        vecs = model.encode([texts[i] for i in to_compute_idx], show_progress_bar=False)
        for i, v in zip(to_compute_idx, vecs):
            _embedding_cache[cache_keys[i]] = v
    return np.array([_embedding_cache[k] for k in cache_keys])


# ── Find similar efekty across the whole corpus by various methods ──────────

def find_similar(corpus: list[dict], selected_ids: list[str], method: str = "tfidf",
                  top_k: int = 30, n_topics: int = 20) -> list[dict]:
    """corpus: flattened efekty records (see efekty_corpus.load_corpus).
    selected_ids: efekt 'id' fields to use as the query.
    method: 'tfidf' | 'lsa' | 'lda' | 'cluster' | 'embeddings'.
    Returns other efekty ranked by similarity to the (averaged) selection,
    each tagged with its own similarity score."""
    import numpy as np

    texts = [c["opis"] for c in corpus]
    ids = [c["id"] for c in corpus]
    selected_idx = [i for i, id_ in enumerate(ids) if id_ in selected_ids]
    if not selected_idx:
        return []
    other_idx = [i for i in range(len(corpus)) if i not in selected_idx]

    if method == "tfidf":
        vectors, _ = build_tfidf(texts)
        sel_terms = set()
        for i in selected_idx:
            sel_terms |= set(vectors[i])
        avg_vec = {t: sum(vectors[i].get(t, 0) for i in selected_idx) / len(selected_idx) for t in sel_terms}
        scores = [(cosine_similarity_sparse(avg_vec, vectors[i]), i) for i in other_idx]

    elif method in ("lsa", "lda"):
        result = lsa_topics(texts, n_topics=n_topics) if method == "lsa" else lda_topics(texts, n_topics=n_topics)
        doc_topics = np.array(result["doc_topics"])
        if doc_topics.size == 0:
            return []
        avg_vec = doc_topics[selected_idx].mean(axis=0)
        norms = np.linalg.norm(doc_topics, axis=1)
        avg_norm = np.linalg.norm(avg_vec) or 1
        sims = (doc_topics @ avg_vec) / (norms * avg_norm + 1e-9)
        scores = [(round(float(sims[i]), 4), i) for i in other_idx]

    elif method == "cluster":
        cluster_result = kmeans_cluster_sklearn(texts, k=n_topics)
        assignments = cluster_result["assignments"]
        sel_clusters = Counter(assignments[i] for i in selected_idx)
        target_cluster = sel_clusters.most_common(1)[0][0]
        scores = [(1.0 if assignments[i] == target_cluster else 0.0, i) for i in other_idx]

    elif method == "embeddings":
        try:
            vecs = embed_texts(texts, cache_keys=ids)
        except ImportError:
            # sentence-transformers/torch aren't installed on this deployment
            # (too heavy for the free-tier build) — fall back to tfidf instead
            # of a raw 500.
            return find_similar(corpus, selected_ids, method="tfidf", top_k=top_k, n_topics=n_topics)
        avg_vec = vecs[selected_idx].mean(axis=0)
        norms = np.linalg.norm(vecs, axis=1)
        avg_norm = np.linalg.norm(avg_vec) or 1
        sims = (vecs @ avg_vec) / (norms * avg_norm + 1e-9)
        scores = [(round(float(sims[i]), 4), i) for i in other_idx]

    else:
        raise ValueError(f"unknown method: {method}")

    scores.sort(key=lambda s: s[0], reverse=True)
    return [
        {**corpus[i], "similarity": score}
        for score, i in scores[:top_k] if score > 0
    ]
