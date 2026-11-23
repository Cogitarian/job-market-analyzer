"""Ten text-classification approaches from the supplied APD methods CSV.

Records are dictionaries with title/abstract/keywords and optional labels.
Supervised methods require user-supplied gold labels; no labels are inferred
from the thesis metadata. Heavy/optional dependencies are imported lazily.
"""
from __future__ import annotations

import re
from typing import Any

METHODS = (
    "patterns", "dictionary_lemma", "tfidf_logreg", "naive_bayes",
    "fasttext", "transformer", "setfit", "llm", "multilabel", "span_extraction",
)

def _text(record: dict[str, Any]) -> str:
    return " ".join(str(record.get(k) or "") for k in ("title", "abstract", "keywords")).strip()

def classify(records: list[dict[str, Any]], method: str, labels: list[Any] | None = None,
             *, label_names: list[str] | None = None, model_name: str | None = None) -> dict[str, Any]:
    """Return predictions and model metadata. labels must align with records."""
    if method not in METHODS:
        raise ValueError(f"Unknown method {method!r}; choose from {METHODS}")
    texts = [_text(r) for r in records]
    if not any(texts):
        raise ValueError("No title, abstract, or keywords found.")

    if method in {"patterns", "dictionary_lemma"}:
        # Explicitly configured keyword/regex patterns; not an automatic taxonomy.
        patterns = label_names or []
        predictions = []
        for text in texts:
            found = [name for name in patterns if re.search(name, text, flags=re.I)]
            predictions.append(found or ["unclassified"])
        return {"method": method, "predictions": predictions, "note": "Pattern strings are treated as regexes; supply a domain dictionary for dictionary matching."}

    if method in {"tfidf_logreg", "naive_bayes", "fasttext", "transformer", "setfit", "llm", "multilabel", "span_extraction"}:
        if labels is None or len(labels) != len(texts):
            raise ValueError(f"{method} requires one supplied gold label per record (or label sets for multilabel).")
        if method == "tfidf_logreg":
            from sklearn.pipeline import make_pipeline
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.linear_model import LogisticRegression
            model = make_pipeline(TfidfVectorizer(ngram_range=(1, 2), min_df=1), LogisticRegression(max_iter=1000, class_weight="balanced"))
            model.fit(texts, labels)
            return {"method": method, "model": model, "predictions": model.predict(texts).tolist()}
        if method == "naive_bayes":
            from sklearn.pipeline import make_pipeline
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.naive_bayes import MultinomialNB
            model = make_pipeline(TfidfVectorizer(ngram_range=(1, 2), min_df=1), MultinomialNB())
            model.fit(texts, labels)
            return {"method": method, "model": model, "predictions": model.predict(texts).tolist()}
        if method == "fasttext":
            raise ImportError("Install fasttext and implement a corpus-specific training wrapper; not included in the base dependencies.")
        if method == "transformer":
            raise ImportError("Transformer fine-tuning is a separate GPU training job; choose a verified Polish checkpoint and train/validate it explicitly.")
        if method == "setfit":
            raise ImportError("SetFit is optional; install setfit and configure a Polish-capable sentence-transformer checkpoint.")
        if method == "llm":
            raise NotImplementedError("LLM classification requires an explicitly configured provider, model/version, and data-transfer approval.")
        if method == "multilabel":
            raise NotImplementedError("Use a multi-label target matrix and OneVsRestClassifier; this endpoint intentionally does not coerce label sets into single labels.")
        if method == "span_extraction":
            raise NotImplementedError("Span extraction requires token-level/span annotations, not document-level labels.")
    raise AssertionError("unreachable")
