"""
Lemmatizes + POS-tags every efekt (spaCy, pl_core_news_sm), splits each
efekt's text into verb-anchored phrases (each phrase starts at a VERB and
runs until the next VERB or end of sentence, capped at max_words), then
aggregates those phrases per category (knowledge/skills/competences) into
a branching trie: category -> verb -> next word -> next word -> ...,
where a node only exists if it occurs at least `min_freq` times, and only
the `max_branches` most frequent children are kept per node (otherwise the
tree explodes combinatorially across 6000+ efekty).

All words are lemmatized before entering the tree, so inflected forms of
the same word/verb collapse onto one branch instead of fragmenting counts.

The spaCy pass itself (load model + run NLP pipe over the whole corpus,
~15s) is the expensive part and doesn't depend on any of the tree-building
parameters (max_words/min_freq/max_branches/max_depth) — only on the efekty
text, which is now a one-time-crawled, stable corpus. So it's persisted to
disk (backend/data/verb_lemma_tokens.json) after the first run and reloaded
from there on every subsequent process start, keyed by a fingerprint of the
corpus so it still recomputes if the underlying efekty ever change.
"""
import hashlib
import json
import os
from typing import Optional

import spacy

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
_TOKENS_CACHE_PATH = os.path.join(_DATA_DIR, "verb_lemma_tokens.json")

_nlp = None
_tokens_cache: Optional[list[dict]] = None  # per-efekt: {id, category, kierunek, kierunek_skrot, kod, tokens}
_lemma_cache: Optional[list[dict]] = None  # phrases capped at a specific max_words, derived from _tokens_cache
_lemma_cache_max_words: Optional[int] = None


def _get_nlp():
    global _nlp
    if _nlp is None:
        _nlp = spacy.load("pl_core_news_sm", disable=["ner", "parser"])
    return _nlp


def _corpus_fingerprint(corpus: list[dict]) -> str:
    h = hashlib.sha1()
    for c in corpus:
        h.update(c["id"].encode("utf-8"))
        h.update(b"\0")
    return h.hexdigest()


def _lemmatize_tokens(corpus: list[dict]) -> list[dict]:
    """The expensive step: spaCy lemma+POS pass over every efekt's text.
    Keeps punctuation/space tokens (tagged, not dropped) so the downstream
    phrase splitter can replicate its exact original spaCy-Doc-based logic
    without re-running spaCy."""
    nlp = _get_nlp()
    texts = [c["opis"] for c in corpus]
    docs = nlp.pipe(texts, batch_size=100)

    out = []
    for c, doc in zip(corpus, docs):
        tokens = [
            [tok.lemma_.lower(), tok.pos_, tok.is_punct, tok.is_space]
            for tok in doc
        ]
        out.append({
            "id": c["id"], "category": c["category"], "kierunek": c["kierunek"],
            "kierunek_skrot": c.get("kierunek_skrot", ""), "kod": c.get("kod", ""),
            "tokens": tokens,
        })
    return out


def _load_tokens_cache(corpus: list[dict], force: bool = False) -> list[dict]:
    """Loads the lemmatized-tokens cache, preferring (in order): in-memory
    cache from this process, the on-disk cache (if its fingerprint matches
    the current corpus), or recomputing via spaCy and writing the disk
    cache for next time."""
    global _tokens_cache
    if _tokens_cache is not None and not force:
        return _tokens_cache

    fingerprint = _corpus_fingerprint(corpus)

    if not force and os.path.exists(_TOKENS_CACHE_PATH):
        with open(_TOKENS_CACHE_PATH, encoding="utf-8") as f:
            saved = json.load(f)
        if saved.get("fingerprint") == fingerprint:
            _tokens_cache = saved["entries"]
            return _tokens_cache

    entries = _lemmatize_tokens(corpus)
    with open(_TOKENS_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump({"fingerprint": fingerprint, "entries": entries}, f, ensure_ascii=False)
    _tokens_cache = entries
    return entries


def _split_verb_phrases(tokens: list[list], max_words: int = 6) -> list[list[str]]:
    """Split a token sequence [lemma, pos, is_punct, is_space] into phrases,
    each starting at a VERB token and continuing until the next VERB or end
    of sentence, capped at max_words lemmas. Consecutive VERB tokens with no
    punctuation between them (e.g. modal + infinitive: "potrafi
    scharakteryzować") are treated as one phrase start, not two — POS
    tagging correctly marks both as VERB, but splitting there would break
    a single compound predicate in half."""
    phrases = []
    current: list[str] = []
    in_phrase = False
    prev_was_verb = False

    def flush():
        if current:
            phrases.append(current[:max_words])

    for lemma, pos, is_punct, is_space in tokens:
        if is_space:
            continue
        if is_punct:
            prev_was_verb = False
            continue
        if pos == "VERB":
            if prev_was_verb and in_phrase:
                if len(current) < max_words:
                    current.append(lemma)
            else:
                flush()
                current = [lemma]
                in_phrase = True
            prev_was_verb = True
        else:
            if in_phrase and len(current) < max_words:
                current.append(lemma)
            prev_was_verb = False
    flush()
    return [p for p in phrases if p]


# The source PDF tables carry the governing verb in the category's header
# row ("Wiedza: absolwent/ka zna i rozumie", "Umiejętności: ... potrafi",
# "Kompetencje społeczne: ... jest gotów/gotowa do") rather than repeating
# it in each efekt's own cell — so the stored `opis` text is a continuation
# with no leading verb at all. "jest gotów do" additionally doesn't
# POS-tag as VERB (AUX + ADJ + ADP), so it wouldn't be found by
# _split_verb_phrases even if it were present. We inject the known trigger
# as a fixed first phrase, then still run the verb splitter over the rest
# of the text to catch secondary clauses some efekty contain (e.g. "zna X,
# zna Y, potrafi Z" within one description).
_CATEGORY_TRIGGER = {
    "knowledge": ["znać", "rozumieć"],
    "skills": ["potrafić"],
    "competences": ["być", "gotowy", "do"],
}


def build_lemma_cache(corpus: list[dict], max_words: int = 6, force: bool = False) -> list[dict]:
    """Builds phrases capped at max_words from the (disk-cached) lemmatized
    tokens — pure Python, no spaCy re-run needed. Cached in-memory per
    max_words value; re-run only if max_words changes or force=True."""
    global _lemma_cache, _lemma_cache_max_words
    if _lemma_cache is not None and _lemma_cache_max_words == max_words and not force:
        return _lemma_cache

    token_entries = _load_tokens_cache(corpus, force=force)

    cache = []
    for entry in token_entries:
        tokens = entry["tokens"]
        trigger = _CATEGORY_TRIGGER.get(entry["category"], [])
        continuation = [lemma for lemma, pos, is_punct, is_space in tokens if not is_punct and not is_space]
        remaining = max_words - len(trigger)
        first_phrase = trigger + (continuation[:remaining] if remaining > 0 else [])

        secondary_phrases = _split_verb_phrases(tokens, max_words=max_words)
        phrases = ([first_phrase] if first_phrase else []) + secondary_phrases

        cache.append({
            "id": entry["id"], "category": entry["category"], "kierunek": entry["kierunek"],
            "kierunek_skrot": entry["kierunek_skrot"], "kod": entry["kod"],
            "phrases": phrases,
        })

    _lemma_cache = cache
    _lemma_cache_max_words = max_words
    return cache


# Each phrase is tracked alongside a small provenance tag (kierunek skrót +
# efekt kod) so the frontend can show "which kierunek/kod does this branch
# come from" when a node is clicked, not just an aggregate count.
Phrase = tuple  # (words: list[str], skrot: str, kod: str)


def _build_trie(phrases: list[Phrase], min_freq: int, max_branches: int, max_depth: int,
                 sample_size: int = 6) -> list[dict]:
    def build_level(sub_phrases: list[Phrase], depth: int) -> list[dict]:
        if depth >= max_depth:
            return []
        groups: dict[str, list[Phrase]] = {}
        for words, skrot, kod in sub_phrases:
            if len(words) > depth:
                groups.setdefault(words[depth], []).append((words, skrot, kod))

        nodes = []
        counted = [(word, len(group)) for word, group in groups.items()]
        counted = [wc for wc in counted if wc[1] >= min_freq]
        counted.sort(key=lambda wc: wc[1], reverse=True)

        for word, count in counted[:max_branches]:
            group = groups[word]
            children = build_level(group, depth + 1)
            seen = set()
            sample = []
            for _, skrot, kod in group:
                tag = f"{skrot} {kod}".strip()
                if tag and tag not in seen:
                    seen.add(tag)
                    sample.append(tag)
                if len(sample) >= sample_size:
                    break
            nodes.append({"word": word, "count": count, "children": children, "sample_kody": sample})
        return nodes

    return build_level(phrases, 0)


def verb_trees_by_category(corpus: list[dict], max_words: int = 6, min_freq: int = 3,
                            max_branches: int = 6, max_depth: int = 6) -> dict:
    """Public entry point: returns {category: [trie nodes]} for
    knowledge/skills/competences, each a branching verb-phrase tree."""
    cache = build_lemma_cache(corpus, max_words=max_words)

    by_category: dict[str, list[Phrase]] = {"knowledge": [], "skills": [], "competences": []}
    for entry in cache:
        if entry["category"] in by_category:
            for words in entry["phrases"]:
                by_category[entry["category"]].append((words, entry["kierunek_skrot"], entry["kod"]))

    trees = {}
    for category, phrases in by_category.items():
        trees[category] = _build_trie(phrases, min_freq, max_branches, max_depth)
    return trees
