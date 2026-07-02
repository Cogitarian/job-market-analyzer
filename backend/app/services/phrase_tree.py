"""
Generalizes verb_tree.py's phrase-drilling trie to any corpus — kierunkowe
efekty, course-level (przedmiotowe) efekty, or treści/content — for the
"drzewo poziome" (horizontal list-based drill-down) alternative to
browsing a flat list in the study planner: first a list of "opening" words
by frequency, click one, see the words that follow it, click one of those,
and so on until the underlying efekty/treści are pinned down.

Three phrase-extraction modes, chosen per corpus after checking the actual
text (see the "kierunkowe" caveat below — this isn't guesswork):
  - "kierunkowe_efekty": kierunkowe efekty (BIP resolutions) store the
    description as a continuation with NO leading verb at all (the verb
    lives only in the PDF's category header row) — reuses verb_tree's
    trigger-injection + verb-anchored split.
  - "verb": course-level (przedmiotowe) efekty and any other corpus that's
    already written as a full clause ("potrafi opisać...", "zna i
    rozumie...") — anchor phrases at VERB tokens directly, no injection
    needed since the real verb is already in the text.
  - "sequence": treści/content items are topic-phrase nouns with no
    consistent verb to anchor on ("Geografia językowa...", "Historia
    systemów pisma...") — just the first max_words lemmas in order.
"""
import json
import os
from typing import Optional

from app.services import verb_tree

_DATA_DIR = verb_tree._DATA_DIR


def _cache_path(cache_name: str) -> str:
    return os.path.join(_DATA_DIR, f"phrase_tokens_{cache_name}.json")


def _lemmatize(corpus: list[dict], cache_name: str, force: bool = False) -> list[dict]:
    """Same disk-persisted-by-fingerprint pattern as verb_tree._load_tokens_cache,
    but keyed per corpus (cache_name) so switching between kierunkowe/
    przedmiotowe/treści in the study planner doesn't thrash a single cache."""
    cache_path = _cache_path(cache_name)
    fingerprint = verb_tree._corpus_fingerprint(corpus)

    if not force and os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            saved = json.load(f)
        if saved.get("fingerprint") == fingerprint:
            return saved["entries"]

    nlp = verb_tree._get_nlp()
    texts = [c["opis"] for c in corpus]
    docs = nlp.pipe(texts, batch_size=100)

    entries = []
    for c, doc in zip(corpus, docs):
        tokens = [[tok.lemma_.lower(), tok.pos_, tok.is_punct, tok.is_space] for tok in doc]
        entries.append({"id": c["id"], "category": c.get("category", ""), "tokens": tokens})

    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump({"fingerprint": fingerprint, "entries": entries}, f, ensure_ascii=False)
    return entries


def _sequence_phrase(tokens: list[list], max_words: int) -> list[list[str]]:
    words = [lemma for lemma, pos, is_punct, is_space in tokens if not is_punct and not is_space]
    return [words[:max_words]] if words else []


def _phrases_for_entry(entry: dict, mode: str, max_words: int) -> list[list[str]]:
    if mode == "verb":
        return verb_tree._split_verb_phrases(entry["tokens"], max_words=max_words)
    return _sequence_phrase(entry["tokens"], max_words)


def _build_trie(phrases: list[tuple], min_freq: int, max_branches: int, max_depth: int,
                 sample_size: int = 6) -> list[dict]:
    def build_level(sub_phrases: list[tuple], depth: int) -> list[dict]:
        if depth >= max_depth:
            return []
        groups: dict[str, list[tuple]] = {}
        for words, item_id in sub_phrases:
            if len(words) > depth:
                groups.setdefault(words[depth], []).append((words, item_id))

        counted = [(word, len(group)) for word, group in groups.items()]
        counted = [wc for wc in counted if wc[1] >= min_freq]
        counted.sort(key=lambda wc: wc[1], reverse=True)

        nodes = []
        for word, count in counted[:max_branches]:
            group = groups[word]
            children = build_level(group, depth + 1)
            ids = list({item_id for _, item_id in group})
            nodes.append({
                "word": word, "count": count, "children": children,
                "n_items": len(ids), "sample_ids": ids[:sample_size],
            })
        return nodes

    return build_level(phrases, 0)


def build_tree(corpus: list[dict], cache_name: str, mode: str, max_words: int = 6,
               min_freq: int = 5, max_branches: int = 6, max_depth: int = 6,
               group_by_category: bool = True, force: bool = False) -> dict:
    """Returns {group_key: [trie nodes]} — group_key is the efekt category
    (knowledge/skills/competences) when group_by_category, else "all"."""
    if mode == "kierunkowe_efekty":
        cache = verb_tree.build_lemma_cache(corpus, max_words=max_words, force=force)
        phrases_by_group: dict[str, list[tuple]] = {}
        for entry in cache:
            key = entry["category"] if group_by_category else "all"
            bucket = phrases_by_group.setdefault(key, [])
            for words in entry["phrases"]:
                if words:
                    bucket.append((words, entry["id"]))
    else:
        entries = _lemmatize(corpus, cache_name, force=force)
        phrases_by_group = {}
        for entry in entries:
            key = entry["category"] if group_by_category else "all"
            bucket = phrases_by_group.setdefault(key, [])
            for words in _phrases_for_entry(entry, mode, max_words):
                if words:
                    bucket.append((words, entry["id"]))

    return {
        key: _build_trie(phrases, min_freq, max_branches, max_depth)
        for key, phrases in phrases_by_group.items()
    }


def resolve_path(corpus: list[dict], cache_name: str, mode: str, path: list[str],
                  category: Optional[str] = None, max_words: int = 6) -> list[str]:
    """Every item id whose phrase starts with this exact lemma sequence —
    used when the user clicks "select this branch" at whatever depth
    they've drilled to in the horizontal tree."""
    if mode == "kierunkowe_efekty":
        cache = verb_tree.build_lemma_cache(corpus, max_words=max_words)
        ids = set()
        for entry in cache:
            if category and entry["category"] != category:
                continue
            for words in entry["phrases"]:
                if words[:len(path)] == path:
                    ids.add(entry["id"])
        return list(ids)

    entries = _lemmatize(corpus, cache_name)
    ids = set()
    for entry in entries:
        if category and entry.get("category") != category:
            continue
        for words in _phrases_for_entry(entry, mode, max_words):
            if words[:len(path)] == path:
                ids.add(entry["id"])
    return list(ids)
