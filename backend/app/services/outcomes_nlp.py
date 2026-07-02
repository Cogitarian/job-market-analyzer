import html as html_lib
from typing import List, Dict, Any
import re
import math
from collections import Counter, defaultdict

# Outcome/program codes like "fwk_k1_u01", "eli_k1_w03" — not real words.
_CODE_RE = re.compile(r'^[a-z]*\d+[a-z]*$|.*_.*\d.*|^[uwk]\d+$')


def tokenize(text: str) -> List[str]:
    # Decode HTML entities (&nbsp; etc.) leaked from scraped syllabus pages
    text = html_lib.unescape(text).replace('\xa0', ' ')
    text = text.lower()
    text = re.sub(r'[^\w\s]', ' ', text)
    tokens = text.split()
    # Polish + English stopwords
    stopwords = {
        'the', 'a', 'an', 'and', 'or', 'of', 'in', 'to', 'is', 'are', 'be',
        'for', 'on', 'with', 'by', 'at', 'from', 'that', 'this', 'as',
        'w', 'i', 'z', 'do', 'na', 'że', 'się', 'oraz', 'nie', 'jest',
        'to', 'po', 'przez', 'jak', 'które', 'który', 'jego', 'zna',
        'student', 'studenta', 'can', 'use', 'their', 'which', 'have',
        'nbsp', 'amp', 'quot', 'lub', 'ich', 'tym', 'dla', 'także', 'inne',
        'inny', 'innych', 'oraz', 'ora', 'lub', 'przy', 'co', 'ze', 'od',
        'być', 'ma', 'są', 'oraz', 'takich', 'takie', 'sposób', 'ale',
    }
    # Syllabus/assessment boilerplate — high frequency, low information.
    # Polish inflects heavily, so match by stem prefix rather than exact word.
    # Kept narrow (e.g. not "umie"/"rozumi"/"projekt") so real content words
    # like "umiejętność" or "rozumienie ze słuchu" survive.
    stem_stopwords = (
        'potraf', 'test', 'zaliczen', 'egzamin', 'ustn', 'pisemn',
        'praktyczn', 'ocen', 'kolokwi', 'wykonuj', 'wykonyw',
    )
    out = []
    for t in tokens:
        if len(t) <= 2 or t in stopwords:
            continue
        if _CODE_RE.match(t):
            continue
        if any(t.startswith(stem) for stem in stem_stopwords):
            continue
        out.append(t)
    return out


def build_tfidf(documents: List[str]) -> tuple[List[Dict], List[str]]:
    """Build TF-IDF matrix. Returns (doc_vectors, vocab)."""
    tokenized = [tokenize(d) for d in documents]

    # Build vocabulary
    all_terms = set()
    for tokens in tokenized:
        all_terms.update(tokens)
    vocab = sorted(all_terms)
    term_to_idx = {t: i for i, t in enumerate(vocab)}

    # TF
    tf_vectors = []
    for tokens in tokenized:
        counter = Counter(tokens)
        total = len(tokens) or 1
        vec = {t: count / total for t, count in counter.items()}
        tf_vectors.append(vec)

    # IDF
    n_docs = len(documents)
    df = Counter()
    for tokens in tokenized:
        for t in set(tokens):
            df[t] += 1
    idf = {t: math.log((n_docs + 1) / (df[t] + 1)) + 1 for t in vocab}

    # TF-IDF vectors
    tfidf_vectors = []
    for tf in tf_vectors:
        vec = {t: tf.get(t, 0) * idf.get(t, 1) for t in vocab}
        # Normalize
        norm = math.sqrt(sum(v**2 for v in vec.values())) or 1
        vec = {t: v / norm for t, v in vec.items()}
        tfidf_vectors.append(vec)

    return tfidf_vectors, vocab


def cosine_similarity(vec1: Dict, vec2: Dict) -> float:
    common = set(vec1) & set(vec2)
    dot = sum(vec1[t] * vec2[t] for t in common)
    return round(dot, 4)


def compute_similarity_matrix(tfidf_vectors: List[Dict]) -> List[List[float]]:
    n = len(tfidf_vectors)
    matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i, n):
            sim = cosine_similarity(tfidf_vectors[i], tfidf_vectors[j])
            matrix[i][j] = sim
            matrix[j][i] = sim
    return matrix


def kmeans_cluster(tfidf_vectors: List[Dict], vocab: List[str], k: int = 5, max_iter: int = 50) -> List[int]:
    """Simple k-means clustering."""
    import random
    if len(tfidf_vectors) <= k:
        return list(range(len(tfidf_vectors)))

    # Convert to dense vectors
    n = len(tfidf_vectors)
    d = len(vocab)
    v2i = {t: i for i, t in enumerate(vocab)}

    def to_dense(vec):
        arr = [0.0] * d
        for t, v in vec.items():
            if t in v2i:
                arr[v2i[t]] = v
        return arr

    dense = [to_dense(v) for v in tfidf_vectors]

    # Init centroids: pick k random docs
    random.seed(42)
    centroid_idxs = random.sample(range(n), k)
    centroids = [dense[i][:] for i in centroid_idxs]

    assignments = [0] * n
    for _ in range(max_iter):
        # Assign
        new_assignments = []
        for vec in dense:
            best_c = 0
            best_sim = -1
            for ci, centroid in enumerate(centroids):
                # cosine sim
                dot = sum(a * b for a, b in zip(vec, centroid))
                norm1 = math.sqrt(sum(a**2 for a in vec)) or 1
                norm2 = math.sqrt(sum(b**2 for b in centroid)) or 1
                sim = dot / (norm1 * norm2)
                if sim > best_sim:
                    best_sim = sim
                    best_c = ci
            new_assignments.append(best_c)

        if new_assignments == assignments:
            break
        assignments = new_assignments

        # Update centroids
        for ci in range(k):
            members = [dense[i] for i, a in enumerate(assignments) if a == ci]
            if members:
                centroids[ci] = [sum(m[j] for m in members) / len(members) for j in range(d)]

    return assignments


def top_ngrams(texts: List[str], n: int = 2, top_k: int = 20) -> List[Dict]:
    """Extract top n-grams across all texts."""
    counter = Counter()
    for text in texts:
        tokens = tokenize(text)
        for i in range(len(tokens) - n + 1):
            gram = " ".join(tokens[i:i+n])
            counter[gram] += 1

    return [{"ngram": ng, "count": c} for ng, c in counter.most_common(top_k)]


def top_terms_per_cluster(
    texts: List[str],
    assignments: List[int],
    vocab: List[str],
    tfidf_vectors: List[Dict],
    k: int,
    top: int = 8
) -> Dict[int, List[str]]:
    """Get top TF-IDF terms per cluster."""
    cluster_vecs = defaultdict(list)
    for i, (vec, a) in enumerate(zip(tfidf_vectors, assignments)):
        cluster_vecs[a].append(vec)

    result = {}
    for ci in range(k):
        vecs = cluster_vecs.get(ci, [])
        if not vecs:
            result[ci] = []
            continue
        # Average TF-IDF per term
        avg = Counter()
        for vec in vecs:
            for t, v in vec.items():
                avg[t] += v / len(vecs)
        result[ci] = [t for t, _ in avg.most_common(top)]

    return result


def analyze_outcomes(outcomes: List[Dict]) -> Dict:
    """Full NLP analysis pipeline for a list of outcomes."""
    if not outcomes:
        return {}

    texts = [o.get("description", "") for o in outcomes]
    labels = [f"{o.get('code', '?')} ({o.get('category', '')})" for o in outcomes]

    tfidf_vectors, vocab = build_tfidf(texts)

    k = min(5, max(2, len(texts) // 3))
    assignments = kmeans_cluster(tfidf_vectors, vocab, k=k)

    cluster_terms = top_terms_per_cluster(texts, assignments, vocab, tfidf_vectors, k)

    # Similarity for first 20 outcomes (to keep response small)
    n_sim = min(20, len(texts))
    sim_matrix = compute_similarity_matrix(tfidf_vectors[:n_sim])

    bigrams = top_ngrams(texts, n=2, top_k=15)
    trigrams = top_ngrams(texts, n=3, top_k=10)

    # Category distribution
    categories = Counter(o.get("category", "?") for o in outcomes)

    return {
        "n_outcomes": len(outcomes),
        "clusters": [
            {
                "id": ci,
                "size": assignments.count(ci),
                "top_terms": cluster_terms.get(ci, []),
                "members": [labels[i] for i, a in enumerate(assignments) if a == ci],
            }
            for ci in range(k)
        ],
        "similarity_matrix": {
            "labels": labels[:n_sim],
            "matrix": sim_matrix,
        },
        "bigrams": bigrams,
        "trigrams": trigrams,
        "categories": dict(categories),
        "assignments": assignments,
    }
