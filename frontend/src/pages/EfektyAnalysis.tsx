import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import './EfektyAnalysis.css'

import { API_BASE as API } from '../config'

interface Efekt {
  id: string
  kod: string
  kierunek_key: string
  kierunek: string
  kierunek_skrot: string
  stopien: string
  category: string
  opis: string
  prk: string[]
  similarity?: number
}

interface KierunekListItem {
  kierunek_key: string
  kierunek: string
  n_efekty: number
  by_stopien: { I: number; II: number; III: number; '': number }
}

type TabType = 'browse' | 'ngrams' | 'keyness' | 'clusters' | 'similar' | 'verbtree'
type StopienFilter = '' | 'I' | 'II' | 'III'

const CATEGORY_LABELS: Record<string, string> = {
  knowledge: 'Wiedza', skills: 'Umiejętności', competences: 'Kompetencje',
}

// A single BIP resolution frequently covers both I and II stopień at once
// (43/159 kierunki in this corpus do), so every kierunek picker needs a way
// to narrow selection/comparison down to one stopień.
function StopienSelect({ value, onChange, kierunek }: {
  value: StopienFilter
  onChange: (v: StopienFilter) => void
  kierunek?: KierunekListItem
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value as StopienFilter)}>
      <option value="">Oba/wszystkie stopnie</option>
      <option value="I">I stopień{kierunek ? ` (${kierunek.by_stopien.I})` : ''}</option>
      <option value="II">II stopień{kierunek ? ` (${kierunek.by_stopien.II})` : ''}</option>
      <option value="III">III stopień{kierunek ? ` (${kierunek.by_stopien.III})` : ''}</option>
    </select>
  )
}

interface VerbNode {
  word: string
  count: number
  children: VerbNode[]
  sample_kody: string[]
}

export default function EfektyAnalysis() {
  const [tab, setTab] = useState<TabType>('browse')
  const [kierunki, setKierunki] = useState<KierunekListItem[]>([])
  const [totalEfekty, setTotalEfekty] = useState(0)

  useEffect(() => {
    axios.get(`${API}/api/efekty-analysis/kierunki-list`).then(r => setKierunki(r.data.kierunki || []))
    axios.get(`${API}/api/efekty-analysis/all`).then(r => setTotalEfekty(r.data.total || 0))
  }, [])

  return (
    <div className="ea-page">
      <div className="ea-header">
        <h2>🧬 Analiza porównawcza efektów uczenia się</h2>
        <p className="ea-subtitle">
          Pełny korpus {totalEfekty.toLocaleString('pl-PL')} efektów kierunkowych z {kierunki.length} kierunków —
          n-gramy, kolokacje, słowa kluczowe wg kierunku, klastry, tematy (LSA/LDA) i wyszukiwanie podobieństwa
          (TF-IDF, embeddingi, klastrowanie).
        </p>
      </div>

      <div className="ea-tabs">
        <button className={tab === 'browse' ? 'active' : ''} onClick={() => setTab('browse')}>📋 Wszystkie efekty</button>
        <button className={tab === 'ngrams' ? 'active' : ''} onClick={() => setTab('ngrams')}>🔤 N-gramy i kolokacje</button>
        <button className={tab === 'keyness' ? 'active' : ''} onClick={() => setTab('keyness')}>🎯 Słowa kluczowe wg kierunku</button>
        <button className={tab === 'clusters' ? 'active' : ''} onClick={() => setTab('clusters')}>🧩 Klastry i tematy</button>
        <button className={tab === 'similar' ? 'active' : ''} onClick={() => setTab('similar')}>🔎 Znajdź podobne</button>
        <button className={tab === 'verbtree' ? 'active' : ''} onClick={() => setTab('verbtree')}>🌳 Drzewo czasownikowe</button>
      </div>

      {tab === 'browse' && <BrowseTab kierunki={kierunki} />}
      {tab === 'ngrams' && <NgramsTab kierunki={kierunki} />}
      {tab === 'keyness' && <KeynessTab kierunki={kierunki} />}
      {tab === 'clusters' && <ClustersTab kierunki={kierunki} />}
      {tab === 'similar' && <SimilarTab kierunki={kierunki} />}
      {tab === 'verbtree' && <VerbTreeTab />}
    </div>
  )
}

// ── Tab: Browse all efekty ───────────────────────────────────────────────────

function BrowseTab({ kierunki }: { kierunki: KierunekListItem[] }) {
  const [selectedKierunek, setSelectedKierunek] = useState('')
  const [stopien, setStopien] = useState<StopienFilter>('')
  const [search, setSearch] = useState('')
  const [efekty, setEfekty] = useState<Efekt[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  const selectedKierunekItem = kierunki.find(k => k.kierunek_key === selectedKierunek)

  useEffect(() => {
    setLoading(true)
    const params: any = {}
    if (selectedKierunek) params.kierunek_key = selectedKierunek
    if (stopien) params.stopien = stopien
    axios.get(`${API}/api/efekty-analysis/all`, { params })
      .then(r => setEfekty(r.data.efekty || []))
      .finally(() => setLoading(false))
    setPage(0)
  }, [selectedKierunek, stopien])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return efekty
    return efekty.filter(e => e.opis.toLowerCase().includes(q) || e.kod.toLowerCase().includes(q))
  }, [efekty, search])

  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  return (
    <div className="ea-tab-content">
      <div className="ea-controls-row">
        <select value={selectedKierunek} onChange={e => setSelectedKierunek(e.target.value)}>
          <option value="">— wszystkie kierunki ({kierunki.length}) —</option>
          {kierunki.map(k => (
            <option key={k.kierunek_key} value={k.kierunek_key}>{k.kierunek} ({k.n_efekty})</option>
          ))}
        </select>
        <StopienSelect value={stopien} onChange={setStopien} kierunek={selectedKierunekItem} />
        <input
          className="ea-search-input"
          placeholder="Szukaj w treści efektu lub kodzie…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="ea-count-badge">{filtered.length.toLocaleString('pl-PL')} efektów</span>
      </div>

      {loading && <div className="ea-loading">Wczytywanie…</div>}

      {!loading && (
        <>
          <div className="ea-efekty-table">
            {pageItems.map(e => (
              <div key={e.id} className="ea-efekt-row">
                <div className="ea-efekt-tags">
                  <span className="ea-tag ea-tag-skrot">{e.kierunek_skrot}</span>
                  {e.stopien && <span className="ea-tag ea-tag-stopien">st. {e.stopien}</span>}
                  <span className={`ea-tag ea-tag-cat-${e.category}`}>{CATEGORY_LABELS[e.category] || e.category}</span>
                  <span className="ea-tag ea-tag-kod">{e.kod}</span>
                  <span className="ea-efekt-kierunek">{e.kierunek}</span>
                </div>
                <p className="ea-efekt-opis">{e.opis}</p>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="ea-pagination">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Poprzednia</button>
              <span>Strona {page + 1} / {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Następna →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Tab: N-grams & collocations ──────────────────────────────────────────────

function NgramsTab({ kierunki }: { kierunki: KierunekListItem[] }) {
  const [mode, setMode] = useState<'ngrams' | 'collocations'>('ngrams')
  const [kierunekFilter, setKierunekFilter] = useState('')
  const [nMin, setNMin] = useState(1)
  const [nMax, setNMax] = useState(3)
  const [topK, setTopK] = useState(40)
  const [minFreq, setMinFreq] = useState(3)
  const [sortBy, setSortBy] = useState<'pmi' | 'count'>('pmi')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const run = () => {
    setLoading(true)
    setError('')
    const path = mode === 'ngrams' ? 'ngrams' : 'collocations'
    const params: any = { n_min: nMin, n_max: nMax, top_k: topK, min_freq: minFreq }
    if (mode === 'collocations') params.sort_by = sortBy
    if (kierunekFilter) params.kierunek_key = kierunekFilter
    axios.get(`${API}/api/efekty-analysis/${path}`, { params })
      .then(r => setResults(r.data.ngrams || r.data.collocations || []))
      .catch(e => setError(e.response?.data?.detail?.[0]?.msg || e.response?.data?.detail || 'Błąd zapytania'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { run() }, []) // eslint-disable-line

  // Collocations require at least a 2-word n-gram (a single word can't be a
  // "collocation") — the backend rejects n_min<2 outright. Switching from
  // N-gramy (whose useful default is 1) used to silently carry that 1
  // over and fail with no visible error; clamp it here instead.
  const switchMode = (next: 'ngrams' | 'collocations') => {
    setMode(next)
    if (next === 'collocations' && nMin < 2) {
      setNMin(2)
      if (nMax < 2) setNMax(4)
    }
  }

  return (
    <div className="ea-tab-content">
      <div className="ea-mode-toggle">
        <button className={mode === 'ngrams' ? 'active' : ''} onClick={() => switchMode('ngrams')}>N-gramy (wg częstości)</button>
        <button className={mode === 'collocations' ? 'active' : ''} onClick={() => switchMode('collocations')}>Kolokacje (wg siły PMI)</button>
      </div>

      <div className="ea-param-grid">
        <label>Kierunek (opcjonalnie)
          <select value={kierunekFilter} onChange={e => setKierunekFilter(e.target.value)}>
            <option value="">— cały korpus —</option>
            {kierunki.map(k => <option key={k.kierunek_key} value={k.kierunek_key}>{k.kierunek}</option>)}
          </select>
        </label>
        <label>Min. długość n-gramu
          <input
            type="number" min={mode === 'collocations' ? 2 : 1} max={6} value={nMin}
            onChange={e => setNMin(mode === 'collocations' ? Math.max(2, +e.target.value) : +e.target.value)}
          />
        </label>
        <label>Maks. długość n-gramu
          <input type="number" min={mode === 'collocations' ? 2 : 1} max={6} value={nMax} onChange={e => setNMax(+e.target.value)} />
        </label>
        <label>Min. częstość
          <input type="number" min={1} value={minFreq} onChange={e => setMinFreq(+e.target.value)} />
        </label>
        <label>Liczba wyników
          <input type="number" min={5} max={500} value={topK} onChange={e => setTopK(+e.target.value)} />
        </label>
        {mode === 'collocations' && (
          <label>Sortuj wg
            <select value={sortBy} onChange={e => setSortBy(e.target.value as 'pmi' | 'count')}>
              <option value="pmi">siła (PMI)</option>
              <option value="count">częstość</option>
            </select>
          </label>
        )}
        <button className="ea-run-btn" onClick={run} disabled={loading}>{loading ? '⏳' : '▶'} Uruchom</button>
      </div>

      {error && <div className="ea-info-note">⚠️ {error}</div>}

      <div className="ea-ngram-results">
        {results.map((r, i) => (
          <div key={i} className="ea-ngram-pill">
            <span className="ea-ngram-n">{r.n}-gram</span>
            <span className="ea-ngram-text">{r.ngram}</span>
            <span className="ea-ngram-count">{r.count}×</span>
            {r.pmi !== undefined && <span className="ea-ngram-pmi">PMI {r.pmi}</span>}
          </div>
        ))}
        {!loading && results.length === 0 && <div className="ea-empty-note">Brak wyników — spróbuj obniżyć min. częstość.</div>}
      </div>
    </div>
  )
}

// ── Tab: Keyness per kierunek ─────────────────────────────────────────────────

function KeynessTab({ kierunki }: { kierunki: KierunekListItem[] }) {
  const [kierunekKey, setKierunekKey] = useState('')
  const [stopien, setStopien] = useState<StopienFilter>('')
  const [n, setN] = useState(1)
  const [measure, setMeasure] = useState<'loglik' | 'ratio'>('loglik')
  const [minFreq, setMinFreq] = useState(2)
  const [topK, setTopK] = useState(25)
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [meta, setMeta] = useState<{ n_target: number; n_rest: number } | null>(null)

  const selectedKierunekItem = kierunki.find(k => k.kierunek_key === kierunekKey)

  const run = () => {
    if (!kierunekKey) return
    setLoading(true)
    axios.post(`${API}/api/efekty-analysis/keyness`, {
      kierunek_key: kierunekKey, stopien: stopien || undefined, n, min_freq: minFreq, top_k: topK, measure,
    }).then(r => {
      setResults(r.data.keyness || [])
      setMeta({ n_target: r.data.n_target, n_rest: r.data.n_rest })
    }).finally(() => setLoading(false))
  }

  return (
    <div className="ea-tab-content">
      <p className="ea-tab-intro">
        Które słowa/n-gramy są <strong>znacząco częstsze</strong> w efektach wybranego kierunku niż we wszystkich
        pozostałych — klasyczna analiza "keyness" z lingwistyki korpusowej (log-likelihood / Dunning G², lub prosty
        stosunek częstości względnych).
      </p>
      <div className="ea-param-grid">
        <label>Kierunek
          <select value={kierunekKey} onChange={e => setKierunekKey(e.target.value)}>
            <option value="">— wybierz kierunek —</option>
            {kierunki.map(k => <option key={k.kierunek_key} value={k.kierunek_key}>{k.kierunek} ({k.n_efekty})</option>)}
          </select>
        </label>
        <label>Stopień
          <StopienSelect value={stopien} onChange={setStopien} kierunek={selectedKierunekItem} />
        </label>
        <label>Długość n-gramu
          <input type="number" min={1} max={4} value={n} onChange={e => setN(+e.target.value)} />
        </label>
        <label>Miara
          <select value={measure} onChange={e => setMeasure(e.target.value as 'loglik' | 'ratio')}>
            <option value="loglik">log-likelihood (G²)</option>
            <option value="ratio">stosunek częstości</option>
          </select>
        </label>
        <label>Min. częstość
          <input type="number" min={1} value={minFreq} onChange={e => setMinFreq(+e.target.value)} />
        </label>
        <label>Liczba wyników
          <input type="number" min={5} max={100} value={topK} onChange={e => setTopK(+e.target.value)} />
        </label>
        <button className="ea-run-btn" onClick={run} disabled={loading || !kierunekKey}>{loading ? '⏳' : '▶'} Analizuj</button>
      </div>

      {meta && (
        <p className="ea-meta-note">Porównano {meta.n_target} efektów kierunku vs {meta.n_rest} efektów pozostałych kierunków.</p>
      )}

      <div className="ea-keyness-table">
        {results.map((r, i) => (
          <div key={i} className="ea-keyness-row">
            <span className="ea-keyness-rank">#{i + 1}</span>
            <span className="ea-keyness-term">{r.ngram}</span>
            <span className="ea-keyness-freqs">{r.count_target}× tu vs {r.count_rest}× gdzie indziej</span>
            <span className="ea-keyness-score">wynik {r.score}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tab: Clusters & topics ────────────────────────────────────────────────────

function ClustersTab({ kierunki }: { kierunki: KierunekListItem[] }) {
  const [mode, setMode] = useState<'clusters' | 'lsa' | 'lda'>('clusters')
  const [k, setK] = useState(15)
  const [topTerms, setTopTerms] = useState(8)
  const [kierunekFilter, setKierunekFilter] = useState('')
  const [stopien, setStopien] = useState<StopienFilter>('')
  const [clusters, setClusters] = useState<any[]>([])
  const [topics, setTopics] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const selectedKierunekItem = kierunki.find(k => k.kierunek_key === kierunekFilter)

  const run = () => {
    setLoading(true)
    if (mode === 'clusters') {
      axios.post(`${API}/api/efekty-analysis/clusters`, { k, kierunek_key: kierunekFilter || undefined, stopien: stopien || undefined })
        .then(r => setClusters(r.data.clusters || []))
        .finally(() => setLoading(false))
    } else {
      axios.post(`${API}/api/efekty-analysis/topics`, {
        method: mode, n_topics: k, top_terms: topTerms, kierunek_key: kierunekFilter || undefined, stopien: stopien || undefined,
      }).then(r => setTopics(r.data.topics || []))
        .finally(() => setLoading(false))
    }
  }

  return (
    <div className="ea-tab-content">
      <div className="ea-mode-toggle">
        <button className={mode === 'clusters' ? 'active' : ''} onClick={() => setMode('clusters')}>Klastry (k-means)</button>
        <button className={mode === 'lsa' ? 'active' : ''} onClick={() => setMode('lsa')}>Tematy LSA</button>
        <button className={mode === 'lda' ? 'active' : ''} onClick={() => setMode('lda')}>Tematy LDA</button>
      </div>

      <div className="ea-param-grid">
        <label>Kierunek (opcjonalnie)
          <select value={kierunekFilter} onChange={e => setKierunekFilter(e.target.value)}>
            <option value="">— cały korpus —</option>
            {kierunki.map(kk => <option key={kk.kierunek_key} value={kk.kierunek_key}>{kk.kierunek}</option>)}
          </select>
        </label>
        <label>Stopień
          <StopienSelect value={stopien} onChange={setStopien} kierunek={selectedKierunekItem} />
        </label>
        <label>{mode === 'clusters' ? 'Liczba klastrów (k)' : 'Liczba tematów'}
          <input type="number" min={2} max={50} value={k} onChange={e => setK(+e.target.value)} />
        </label>
        {mode !== 'clusters' && (
          <label>Słów na temat
            <input type="number" min={3} max={20} value={topTerms} onChange={e => setTopTerms(+e.target.value)} />
          </label>
        )}
        <button className="ea-run-btn" onClick={run} disabled={loading}>{loading ? '⏳ (kilka sekund)' : '▶'} Uruchom</button>
      </div>

      {mode === 'clusters' && (
        <div className="ea-clusters-grid">
          {clusters.map(c => (
            <div key={c.cluster} className="ea-cluster-card">
              <div className="ea-cluster-header">Klaster {c.cluster} · {c.size} efektów</div>
              <div className="ea-cluster-terms">
                {c.top_terms.map((t: string) => <span key={t} className="ea-term-pill">{t}</span>)}
              </div>
              <div className="ea-cluster-kierunki">
                {c.top_kierunki.map(([name, count]: [string, number]) => (
                  <span key={name} className="ea-kierunek-pill">{name} ({count})</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {mode !== 'clusters' && (
        <div className="ea-clusters-grid">
          {topics.map(t => (
            <div key={t.topic} className="ea-cluster-card">
              <div className="ea-cluster-header">Temat {t.topic}</div>
              <div className="ea-cluster-terms">
                {t.top_terms.map((term: string) => <span key={term} className="ea-term-pill">{term}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab: Similarity search (kierunkowe efekty — the full BIP corpus this
// whole page is scoped to; for przedmiotowe/treści similarity across the
// full university database, see "Zaplanuj swoje studia" which supersedes
// what used to be a session-scraped-only version of this here). ───────────

function SimilarTab({ kierunki }: { kierunki: KierunekListItem[] }) {
  const [kierunekKey, setKierunekKey] = useState('')
  const [stopien, setStopien] = useState<StopienFilter>('')
  const [efekty, setEfekty] = useState<Efekt[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [method, setMethod] = useState<'tfidf' | 'lsa' | 'lda' | 'cluster' | 'embeddings'>('tfidf')
  const [topK, setTopK] = useState(25)
  const [nTopics, setNTopics] = useState(20)
  const [results, setResults] = useState<Efekt[]>([])
  const [summary, setSummary] = useState<[string, number][]>([])
  const [loading, setLoading] = useState(false)

  const selectedKierunekItem = kierunki.find(k => k.kierunek_key === kierunekKey)

  useEffect(() => {
    if (!kierunekKey) { setEfekty([]); return }
    const params: any = { kierunek_key: kierunekKey }
    if (stopien) params.stopien = stopien
    axios.get(`${API}/api/efekty-analysis/all`, { params })
      .then(r => setEfekty(r.data.efekty || []))
  }, [kierunekKey, stopien])

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(efekty.map(e => e.id)))
  const selectNone = () => setSelected(new Set())
  const selectCategory = (cat: string) => setSelected(new Set(efekty.filter(e => e.category === cat).map(e => e.id)))

  const runSimilar = () => {
    if (selected.size === 0) return
    setLoading(true)
    axios.post(`${API}/api/efekty-analysis/similar`, {
      selected_ids: Array.from(selected), method, top_k: topK, n_topics: nTopics,
    }).then(r => {
      setResults(r.data.efekty || [])
      setSummary(r.data.kierunki_summary || [])
    }).finally(() => setLoading(false))
  }

  return (
    <div className="ea-tab-content">
      <p className="ea-tab-intro">
        Wybierz jeden lub kilka efektów kierunkowych, a system znajdzie inne efekty o podobnej treści — pokazując,
        które kierunki oferują coś podobnego. Wypróbuj różne metody — żadna nie jest z góry "najlepsza" dla tego
        typu tekstu. Dla efektów przedmiotów/treści na poziomie całej uczelni zobacz „Zaplanuj swoje studia".
      </p>

      <div className="ea-controls-row">
        <select value={kierunekKey} onChange={e => { setKierunekKey(e.target.value); setSelected(new Set()) }}>
          <option value="">— wybierz kierunek, by wybrać z niego efekty —</option>
          {kierunki.map(k => <option key={k.kierunek_key} value={k.kierunek_key}>{k.kierunek}</option>)}
        </select>
        <StopienSelect
          value={stopien}
          onChange={s => { setStopien(s); setSelected(new Set()) }}
          kierunek={selectedKierunekItem}
        />
        <span className="ea-count-badge">{selected.size} wybranych</span>
      </div>

      {efekty.length > 0 && (
        <>
          <div className="ea-mode-toggle">
            <button onClick={selectAll}>✅ Zaznacz wszystkie ({efekty.length})</button>
            <button onClick={selectNone}>◻️ Odznacz wszystkie</button>
            <button onClick={() => selectCategory('knowledge')}>📚 Zaznacz wszystkie W</button>
            <button onClick={() => selectCategory('skills')}>🛠 Zaznacz wszystkie U</button>
            <button onClick={() => selectCategory('competences')}>🧠 Zaznacz wszystkie K</button>
          </div>
          <div className="ea-select-list">
            {efekty.map(e => (
              <label key={e.id} className="ea-select-item">
                <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} />
                <span className="ea-tag ea-tag-kod">{e.kod}</span>
                {e.stopien && <span className="ea-tag ea-tag-stopien">st. {e.stopien}</span>}
                <span className="ea-select-opis">{e.opis}</span>
              </label>
            ))}
          </div>
        </>
      )}

      <div className="ea-param-grid">
        <label>Metoda
          <select value={method} onChange={e => setMethod(e.target.value as any)}>
            <option value="tfidf">TF-IDF + podobieństwo cosinusowe</option>
            <option value="lsa">LSA (analiza ukrytej semantyki)</option>
            <option value="lda">LDA (modelowanie tematów)</option>
            <option value="cluster">Klastrowanie (k-means)</option>
            <option value="embeddings">Embeddingi transformerowe (multilingual)</option>
          </select>
        </label>
        {(method === 'lsa' || method === 'lda' || method === 'cluster') && (
          <label>Liczba tematów/klastrów
            <input type="number" min={2} max={50} value={nTopics} onChange={e => setNTopics(+e.target.value)} />
          </label>
        )}
        <label>Liczba wyników
          <input type="number" min={5} max={100} value={topK} onChange={e => setTopK(+e.target.value)} />
        </label>
        <button className="ea-run-btn" onClick={runSimilar} disabled={loading || selected.size === 0}>
          {loading ? '⏳ (embeddingi mogą potrwać do minuty przy pierwszym użyciu)' : '🔎 Znajdź podobne'}
        </button>
      </div>

      {summary.length > 0 && (
        <div className="ea-summary-panel">
          <h4>Kierunki z podobnymi efektami:</h4>
          <div className="ea-cluster-kierunki">
            {summary.map(([name, count]) => <span key={name} className="ea-kierunek-pill">{name} ({count})</span>)}
          </div>
        </div>
      )}

      <div className="ea-efekty-table">
        {results.map(e => (
          <div key={e.id} className="ea-efekt-row">
            <div className="ea-efekt-tags">
              <span className="ea-tag ea-tag-skrot">{e.kierunek_skrot || e.kierunek}</span>
              <span className="ea-tag ea-tag-kod">{e.kod}</span>
              <span className="ea-efekt-kierunek">{e.kierunek}</span>
              {e.similarity !== undefined && <span className="ea-score-tag">{Math.round(e.similarity * 100)}%</span>}
            </div>
            <p className="ea-efekt-opis">{e.opis}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tab: Verb-phrase tree (lemmatized, POS-anchored, per category) ──────────

const CATEGORY_COLORS: Record<string, string> = {
  knowledge: '#3b82f6', skills: '#22c55e', competences: '#a855f7',
}

function VerbTreeTab() {
  const [maxWords, setMaxWords] = useState(6)
  const [minFreq, setMinFreq] = useState(6)
  const [maxBranches, setMaxBranches] = useState(5)
  const [maxDepth, setMaxDepth] = useState(5)
  const [category, setCategory] = useState<'knowledge' | 'skills' | 'competences'>('knowledge')
  const [trees, setTrees] = useState<Record<string, VerbNode[]>>({})
  const [loading, setLoading] = useState(false)
  // A CSS-only "fullscreen" (fixed, covers the viewport) rather than the
  // browser's native Fullscreen API — requestFullscreen() silently fails
  // (rejected promise, no visible error) in a lot of real embedding
  // contexts (iframes without allow="fullscreen", some permission
  // policies), which is exactly what made the button look broken. A CSS
  // toggle works unconditionally, in any context.
  const [fullscreen, setFullscreen] = useState(false)

  const run = () => {
    setLoading(true)
    axios.post(`${API}/api/efekty-analysis/verb-tree`, {
      max_words: maxWords, min_freq: minFreq, max_branches: maxBranches, max_depth: maxDepth,
    }).then(r => setTrees(r.data.trees || {})).finally(() => setLoading(false))
  }

  useEffect(() => { run() }, []) // eslint-disable-line

  useEffect(() => {
    if (!fullscreen) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [fullscreen])

  const toggleFullscreen = () => setFullscreen(f => !f)

  const nodes = trees[category] || []

  const controls = (
    <>
      <p className="ea-tab-intro">
        Każdy efekt jest lematyzowany i tagowany POS (spaCy), a jego opis dzielony na frazy zaczynające się
        czasownikiem (np. "potrafi scharakteryzować…"), ograniczone do {maxWords} słów. Kliknij gałąź, by ją
        rozwinąć/zwinąć — kliknięcie pokazuje też przykładowe kody kierunku/efektu, z których ta fraza pochodzi.
      </p>
      <div className="ea-mode-toggle">
        <button className={category === 'knowledge' ? 'active' : ''} onClick={() => setCategory('knowledge')}>📚 Wiedza</button>
        <button className={category === 'skills' ? 'active' : ''} onClick={() => setCategory('skills')}>🛠 Umiejętności</button>
        <button className={category === 'competences' ? 'active' : ''} onClick={() => setCategory('competences')}>🧠 Kompetencje</button>
        <button onClick={toggleFullscreen}>{fullscreen ? '🗗 Wyjdź z pełnego ekranu' : '⛶ Pełny ekran'}</button>
      </div>
      <div className="ea-param-grid">
        <label>Maks. długość frazy
          <input type="number" min={2} max={10} value={maxWords} onChange={e => setMaxWords(+e.target.value)} />
        </label>
        <label>Min. częstość gałęzi
          <input type="number" min={1} value={minFreq} onChange={e => setMinFreq(+e.target.value)} />
        </label>
        <label>Maks. gałęzi na węzeł
          <input type="number" min={2} max={15} value={maxBranches} onChange={e => setMaxBranches(+e.target.value)} />
        </label>
        <label>Maks. głębokość
          <input type="number" min={1} max={10} value={maxDepth} onChange={e => setMaxDepth(+e.target.value)} />
        </label>
        <button className="ea-run-btn" onClick={run} disabled={loading}>
          {loading ? '⏳' : '▶ Zbuduj drzewo'}
        </button>
      </div>
    </>
  )

  return (
    <div className="ea-tab-content">
      <div className={`ea-verbtree-container ${fullscreen ? 'is-fullscreen' : ''}`}>
        {fullscreen ? (
          <div className="ea-floating-panel">{controls}</div>
        ) : controls}

        {!loading && nodes.length === 0 && (
          <div className="ea-empty-note">Brak gałęzi — obniż min. częstość lub zwiększ maks. gałęzi na węzeł.</div>
        )}

        {nodes.length > 0 && (
          <RadialVerbTree
            key={category}
            nodes={nodes}
            rootLabel={CATEGORY_LABELS[category]}
            color={CATEGORY_COLORS[category]}
            fullscreen={fullscreen}
          />
        )}
      </div>
    </div>
  )
}

interface PositionedNode {
  node: VerbNode
  x: number
  y: number
  parentX: number
  parentY: number
  depth: number
  path: string
}

function layoutRadial(
  nodes: VerbNode[], angleStart: number, angleEnd: number, depth: number,
  parentX: number, parentY: number, centerX: number, centerY: number,
  ringSpacing: number, baseRadius: number, out: PositionedNode[],
  parentPath: string, expandedPaths: Set<string>,
) {
  const totalCount = nodes.reduce((s, n) => s + n.count, 0) || 1
  let angle = angleStart
  for (const node of nodes) {
    const span = ((angleEnd - angleStart) * node.count) / totalCount
    const nodeAngle = angle + span / 2
    const radius = baseRadius + depth * ringSpacing
    const x = centerX + radius * Math.cos(nodeAngle)
    const y = centerY + radius * Math.sin(nodeAngle)
    const path = `${parentPath}/${node.word}`
    out.push({ node, x, y, parentX, parentY, depth, path })
    // Depth 1 (direct children of the root) is always visible; deeper
    // levels only render once the user has clicked this node to expand it.
    if (node.children.length > 0 && (depth === 1 || expandedPaths.has(path))) {
      layoutRadial(node.children, angle, angle + span, depth + 1, x, y, centerX, centerY, ringSpacing, baseRadius, out, path, expandedPaths)
    }
    angle += span
  }
}

const ZOOM_MIN = 0.3
const ZOOM_MAX = 3
const ZOOM_STEP = 0.2

function RadialVerbTree({ nodes, rootLabel, color, fullscreen }: { nodes: VerbNode[]; rootLabel: string; color: string; fullscreen: boolean }) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<PositionedNode | null>(null)
  const [zoom, setZoom] = useState(1)
  const zoomIn = () => setZoom(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))
  const zoomOut = () => setZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))
  const zoomReset = () => setZoom(1)

  const maxDepthFound = useMemo(() => {
    let max = 0
    const walk = (ns: VerbNode[], d: number) => {
      max = Math.max(max, d)
      ns.forEach(n => walk(n.children, d + 1))
    }
    walk(nodes, 1)
    return max
  }, [nodes])

  const ringSpacing = 85
  const baseRadius = 70
  const centerX = baseRadius + (maxDepthFound + 1) * ringSpacing
  const centerY = centerX
  const size = centerX * 2

  const positioned = useMemo(() => {
    const out: PositionedNode[] = []
    layoutRadial(nodes, 0, Math.PI * 2, 1, centerX, centerY, centerX, centerY, ringSpacing, baseRadius, out, '', expandedPaths)
    return out
  }, [nodes, centerX, centerY, expandedPaths])

  const maxCount = Math.max(...positioned.map(p => p.node.count), 1)

  const toggleExpand = (p: PositionedNode) => {
    setSelected(p)
    if (p.node.children.length === 0) return
    setExpandedPaths(prev => {
      const next = new Set(prev)
      next.has(p.path) ? next.delete(p.path) : next.add(p.path)
      return next
    })
  }

  const expandAll = () => {
    const all = new Set<string>()
    const walk = (ns: VerbNode[], path: string) => {
      ns.forEach(n => {
        const p = `${path}/${n.word}`
        all.add(p)
        walk(n.children, p)
      })
    }
    walk(nodes, '')
    setExpandedPaths(all)
  }
  const collapseAll = () => setExpandedPaths(new Set())

  return (
    <div className={`ea-radial-wrap ${fullscreen ? 'is-fullscreen-tree' : ''}`}>
      <div className="ea-radial-toolbar">
        <button onClick={expandAll}>🌳 Rozwiń wszystko do końca</button>
        <button onClick={collapseAll}>➖ Zwiń wszystko</button>
        <span className="ea-zoom-controls">
          <button onClick={zoomOut} disabled={zoom <= ZOOM_MIN} title="Pomniejsz">➖</button>
          <span className="ea-zoom-label">{Math.round(zoom * 100)}%</span>
          <button onClick={zoomIn} disabled={zoom >= ZOOM_MAX} title="Powiększ">➕</button>
          <button onClick={zoomReset} title="Resetuj powiększenie">↺</button>
        </span>
      </div>
      <svg width={size * zoom} height={size * zoom} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={centerX} cy={centerY} r={baseRadius * 0.55} fill={color} opacity={0.15} />
        <text x={centerX} y={centerY} textAnchor="middle" dominantBaseline="middle" fontSize={16} fontWeight={700} fill={color}>
          {rootLabel}
        </text>
        {positioned.map((p, i) => {
          const strokeW = Math.max(1, Math.min(6, Math.sqrt(p.node.count) / 2))
          const dotR = Math.max(4, Math.min(16, 4 + 12 * (p.node.count / maxCount)))
          const isRight = Math.cos(Math.atan2(p.y - centerY, p.x - centerX)) >= 0
          const hasChildren = p.node.children.length > 0
          const isExpanded = expandedPaths.has(p.path)
          return (
            <g key={i} onClick={() => toggleExpand(p)} style={{ cursor: 'pointer' }}>
              <line x1={p.parentX} y1={p.parentY} x2={p.x} y2={p.y} stroke={color} strokeWidth={strokeW} opacity={0.35} />
              <circle
                cx={p.x} cy={p.y} r={dotR} fill={color}
                opacity={selected?.path === p.path ? 1 : 0.85}
                stroke={hasChildren ? color : 'none'}
                strokeWidth={hasChildren && !isExpanded ? 2 : 0}
                strokeOpacity={0.4}
              >
                <title>{`${p.node.word} — ${p.node.count}×${hasChildren ? (isExpanded ? ' (kliknij, by zwinąć)' : ' (kliknij, by rozwinąć)') : ''}`}</title>
              </circle>
              <text
                x={p.x + (isRight ? dotR + 4 : -(dotR + 4))}
                y={p.y}
                textAnchor={isRight ? 'start' : 'end'}
                dominantBaseline="middle"
                fontSize={11}
                fill="var(--text)"
              >
                {p.node.word} <tspan fill="var(--text-muted)" fontSize={9}>{p.node.count}×</tspan>
                {hasChildren && <tspan fill={color} fontSize={10}>{isExpanded ? ' −' : ' +'}</tspan>}
              </text>
            </g>
          )
        })}
      </svg>
      {selected && (
        <div className="ea-node-detail">
          <strong>{selected.node.word}</strong> — {selected.node.count}× w korpusie
          <div className="ea-cluster-kierunki">
            {selected.node.sample_kody.map(k => <span key={k} className="ea-kierunek-pill">{k}</span>)}
          </div>
        </div>
      )}
    </div>
  )
}
