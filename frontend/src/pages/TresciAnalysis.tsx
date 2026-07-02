import { useState, useEffect } from 'react'
import axios from 'axios'
import './EfektyAnalysis.css'

import { API_BASE as API } from '../config'

interface Course {
  id: string
  kod: string
  kierunek: string
  kierunek_key: string
  opis: string
  title: string
  similarity?: number
}

type TabType = 'browse' | 'ngrams' | 'keyness' | 'clusters' | 'similar'

export default function TresciAnalysis() {
  const [status, setStatus] = useState<{ available: boolean; n_courses?: number; n_courses_with_content?: number; message?: string } | null>(null)
  const [tab, setTab] = useState<TabType>('browse')

  useEffect(() => {
    axios.get(`${API}/api/university-corpus/status`).then(r => setStatus(r.data))
  }, [])

  return (
    <div className="ea-page">
      <div className="ea-header">
        <h2>📖 Analiza porównawcza treści programowych</h2>
        <p className="ea-subtitle">
          Treści przedmiotów (nie efekty) ze wszystkich sylabusów UAM — które przedmioty mają podobną treść, a które
          różnią się, niezależnie od kierunku, który je oferuje.
        </p>
        {status && !status.available && (
          <div className="ea-info-note" style={{ marginTop: '0.6rem' }}>
            ⏳ {status.message || 'Baza sylabusów całego uniwersytetu jeszcze się buduje (jednorazowy scraping ~11 000 przedmiotów, potrwa kilka godzin). Wróć później.'}
          </div>
        )}
        {status?.available && (
          <div className="ea-info-note" style={{ marginTop: '0.6rem' }}>
            ✅ Baza gotowa: {status.n_courses?.toLocaleString('pl-PL')} przedmiotów w bazie,
            {' '}{status.n_courses_with_content?.toLocaleString('pl-PL')} z rozpoznaną treścią programową.
          </div>
        )}
      </div>

      {status?.available && (
        <>
          <div className="ea-tabs">
            <button className={tab === 'browse' ? 'active' : ''} onClick={() => setTab('browse')}>📋 Wszystkie treści</button>
            <button className={tab === 'ngrams' ? 'active' : ''} onClick={() => setTab('ngrams')}>🔤 N-gramy i kolokacje</button>
            <button className={tab === 'keyness' ? 'active' : ''} onClick={() => setTab('keyness')}>🎯 Słowa kluczowe wg kierunku</button>
            <button className={tab === 'clusters' ? 'active' : ''} onClick={() => setTab('clusters')}>🧩 Klastry</button>
            <button className={tab === 'similar' ? 'active' : ''} onClick={() => setTab('similar')}>🔎 Znajdź podobne przedmioty</button>
          </div>

          {tab === 'browse' && <BrowseTresci />}
          {tab === 'ngrams' && <NgramsTresci />}
          {tab === 'keyness' && <KeynessTresci />}
          {tab === 'clusters' && <ClustersTresci />}
          {tab === 'similar' && <SimilarTresci />}
        </>
      )}
    </div>
  )
}

function BrowseTresci() {
  const [kierunek, setKierunek] = useState('')
  const [search, setSearch] = useState('')
  const [courses, setCourses] = useState<Course[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const run = () => {
    setLoading(true)
    axios.get(`${API}/api/university-corpus/content/all`, { params: { kierunek: kierunek || undefined, search: search || undefined, limit: 100 } })
      .then(r => { setCourses(r.data.courses || []); setTotal(r.data.total || 0) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { run() }, []) // eslint-disable-line

  return (
    <div className="ea-tab-content">
      <div className="ea-controls-row">
        <input className="ea-search-input" placeholder="Filtruj po kierunku…" value={kierunek} onChange={e => setKierunek(e.target.value)} />
        <input className="ea-search-input" placeholder="Szukaj w treści lub tytule przedmiotu…" value={search} onChange={e => setSearch(e.target.value)} />
        <button className="ea-run-btn" onClick={run} disabled={loading}>{loading ? '⏳' : '🔍'} Szukaj</button>
        <span className="ea-count-badge">{total.toLocaleString('pl-PL')} przedmiotów (pokazano {courses.length})</span>
      </div>
      <div className="ea-efekty-table">
        {courses.map(c => (
          <div key={c.id} className="ea-efekt-row">
            <div className="ea-efekt-tags">
              <span className="ea-tag ea-tag-kod">{c.title || c.kod}</span>
              <span className="ea-efekt-kierunek">{c.kierunek}</span>
            </div>
            <p className="ea-efekt-opis">{c.opis.slice(0, 400)}{c.opis.length > 400 ? '…' : ''}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function NgramsTresci() {
  const [mode, setMode] = useState<'ngrams' | 'collocations'>('ngrams')
  const [nMin, setNMin] = useState(1)
  const [nMax, setNMax] = useState(3)
  const [topK, setTopK] = useState(40)
  const [minFreq, setMinFreq] = useState(4)
  const [sortBy, setSortBy] = useState<'pmi' | 'count'>('pmi')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const run = () => {
    setLoading(true)
    const path = mode === 'ngrams' ? 'ngrams' : 'collocations'
    const params: any = { n_min: nMin, n_max: nMax, top_k: topK, min_freq: minFreq }
    if (mode === 'collocations') params.sort_by = sortBy
    axios.get(`${API}/api/university-corpus/content/${path}`, { params })
      .then(r => setResults(r.data.ngrams || r.data.collocations || []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { run() }, []) // eslint-disable-line

  return (
    <div className="ea-tab-content">
      <div className="ea-mode-toggle">
        <button className={mode === 'ngrams' ? 'active' : ''} onClick={() => setMode('ngrams')}>N-gramy</button>
        <button className={mode === 'collocations' ? 'active' : ''} onClick={() => setMode('collocations')}>Kolokacje</button>
      </div>
      <div className="ea-param-grid">
        <label>Min. długość<input type="number" min={1} max={6} value={nMin} onChange={e => setNMin(+e.target.value)} /></label>
        <label>Maks. długość<input type="number" min={1} max={6} value={nMax} onChange={e => setNMax(+e.target.value)} /></label>
        <label>Min. częstość<input type="number" min={1} value={minFreq} onChange={e => setMinFreq(+e.target.value)} /></label>
        <label>Liczba wyników<input type="number" min={5} max={500} value={topK} onChange={e => setTopK(+e.target.value)} /></label>
        {mode === 'collocations' && (
          <label>Sortuj wg
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
              <option value="pmi">siła (PMI)</option>
              <option value="count">częstość</option>
            </select>
          </label>
        )}
        <button className="ea-run-btn" onClick={run} disabled={loading}>{loading ? '⏳' : '▶'} Uruchom</button>
      </div>
      <div className="ea-ngram-results">
        {results.map((r, i) => (
          <div key={i} className="ea-ngram-pill">
            <span className="ea-ngram-n">{r.n}-gram</span>
            <span className="ea-ngram-text">{r.ngram}</span>
            <span className="ea-ngram-count">{r.count}×</span>
            {r.pmi !== undefined && <span className="ea-ngram-pmi">PMI {r.pmi}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function KeynessTresci() {
  const [kierunek, setKierunek] = useState('')
  const [n, setN] = useState(1)
  const [measure, setMeasure] = useState<'loglik' | 'ratio'>('loglik')
  const [minFreq, setMinFreq] = useState(2)
  const [topK, setTopK] = useState(25)
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [meta, setMeta] = useState<{ n_target: number; n_rest: number } | null>(null)

  const run = () => {
    if (!kierunek.trim()) return
    setLoading(true)
    axios.post(`${API}/api/university-corpus/content/keyness`, { kierunek, n, min_freq: minFreq, top_k: topK, measure })
      .then(r => { setResults(r.data.keyness || []); setMeta({ n_target: r.data.n_target, n_rest: r.data.n_rest }) })
      .finally(() => setLoading(false))
  }

  return (
    <div className="ea-tab-content">
      <p className="ea-tab-intro">
        Które słowa/n-gramy w treści przedmiotów danego kierunku są znacząco częstsze niż we wszystkich innych
        kierunkach.
      </p>
      <div className="ea-param-grid">
        <label>Kierunek (fragment nazwy)<input value={kierunek} onChange={e => setKierunek(e.target.value)} placeholder="np. filologia francuska" /></label>
        <label>Długość n-gramu<input type="number" min={1} max={4} value={n} onChange={e => setN(+e.target.value)} /></label>
        <label>Miara
          <select value={measure} onChange={e => setMeasure(e.target.value as any)}>
            <option value="loglik">log-likelihood (G²)</option>
            <option value="ratio">stosunek częstości</option>
          </select>
        </label>
        <label>Min. częstość<input type="number" min={1} value={minFreq} onChange={e => setMinFreq(+e.target.value)} /></label>
        <label>Liczba wyników<input type="number" min={5} max={100} value={topK} onChange={e => setTopK(+e.target.value)} /></label>
        <button className="ea-run-btn" onClick={run} disabled={loading || !kierunek.trim()}>{loading ? '⏳' : '▶'} Analizuj</button>
      </div>
      {meta && <p className="ea-meta-note">Porównano {meta.n_target} przedmiotów kierunku vs {meta.n_rest} pozostałych.</p>}
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

function ClustersTresci() {
  const [k, setK] = useState(15)
  const [clusters, setClusters] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const run = () => {
    setLoading(true)
    axios.post(`${API}/api/university-corpus/content/clusters`, { k })
      .then(r => setClusters(r.data.clusters || []))
      .finally(() => setLoading(false))
  }

  return (
    <div className="ea-tab-content">
      <div className="ea-param-grid">
        <label>Liczba klastrów<input type="number" min={2} max={50} value={k} onChange={e => setK(+e.target.value)} /></label>
        <button className="ea-run-btn" onClick={run} disabled={loading}>{loading ? '⏳ (kilka sekund)' : '▶ Uruchom'}</button>
      </div>
      <div className="ea-clusters-grid">
        {clusters.map(c => (
          <div key={c.cluster} className="ea-cluster-card">
            <div className="ea-cluster-header">Klaster {c.cluster} · {c.size} przedmiotów</div>
            <div className="ea-cluster-terms">{c.top_terms.map((t: string) => <span key={t} className="ea-term-pill">{t}</span>)}</div>
            <div className="ea-cluster-kierunki">
              {c.top_kierunki.map(([name, count]: [string, number]) => <span key={name} className="ea-kierunek-pill">{name} ({count})</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SimilarTresci() {
  const [search, setSearch] = useState('')
  const [courses, setCourses] = useState<Course[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [method, setMethod] = useState<'tfidf' | 'lsa' | 'lda' | 'cluster' | 'embeddings'>('tfidf')
  const [topK, setTopK] = useState(25)
  const [nTopics, setNTopics] = useState(20)
  const [results, setResults] = useState<Course[]>([])
  const [summary, setSummary] = useState<[string, number][]>([])
  const [loading, setLoading] = useState(false)

  const runSearch = () => {
    axios.get(`${API}/api/university-corpus/content/all`, { params: { search, limit: 40 } })
      .then(r => setCourses(r.data.courses || []))
  }

  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const runSimilar = () => {
    if (selected.size === 0) return
    setLoading(true)
    axios.post(`${API}/api/university-corpus/content/similar`, {
      selected_ids: Array.from(selected), method, top_k: topK, n_topics: nTopics,
    }).then(r => { setResults(r.data.courses || []); setSummary(r.data.kierunki_summary || []) })
      .finally(() => setLoading(false))
  }

  return (
    <div className="ea-tab-content">
      <p className="ea-tab-intro">Wyszukaj przedmioty po tytule/treści, zaznacz kilka, znajdź inne o podobnej treści.</p>
      <div className="ea-controls-row">
        <input className="ea-search-input" placeholder="np. programowanie, gramatyka, analiza danych…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()} />
        <button className="ea-run-btn" onClick={runSearch}>🔍 Szukaj</button>
        <span className="ea-count-badge">{selected.size} wybranych</span>
      </div>
      {courses.length > 0 && (
        <div className="ea-select-list">
          {courses.map(c => (
            <label key={c.id} className="ea-select-item">
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} />
              <span className="ea-tag ea-tag-kod">{c.title || c.kod}</span>
              <span className="ea-select-opis">{c.opis.slice(0, 150)}</span>
            </label>
          ))}
        </div>
      )}
      <div className="ea-param-grid">
        <label>Metoda
          <select value={method} onChange={e => setMethod(e.target.value as any)}>
            <option value="tfidf">TF-IDF + cosinus</option>
            <option value="lsa">LSA</option>
            <option value="lda">LDA</option>
            <option value="cluster">Klastrowanie</option>
            <option value="embeddings">Embeddingi transformerowe</option>
          </select>
        </label>
        {(method === 'lsa' || method === 'lda' || method === 'cluster') && (
          <label>Tematy/klastry<input type="number" min={2} max={50} value={nTopics} onChange={e => setNTopics(+e.target.value)} /></label>
        )}
        <label>Liczba wyników<input type="number" min={5} max={100} value={topK} onChange={e => setTopK(+e.target.value)} /></label>
        <button className="ea-run-btn" onClick={runSimilar} disabled={loading || selected.size === 0}>{loading ? '⏳' : '🔎 Znajdź podobne'}</button>
      </div>
      {summary.length > 0 && (
        <div className="ea-summary-panel">
          <h4>Kierunki oferujące podobne przedmioty:</h4>
          <div className="ea-cluster-kierunki">{summary.map(([name, count]) => <span key={name} className="ea-kierunek-pill">{name} ({count})</span>)}</div>
        </div>
      )}
      <div className="ea-efekty-table">
        {results.map(c => (
          <div key={c.id} className="ea-efekt-row">
            <div className="ea-efekt-tags">
              <span className="ea-tag ea-tag-kod">{c.title || c.kod}</span>
              <span className="ea-efekt-kierunek">{c.kierunek}</span>
              {c.similarity !== undefined && <span className="ea-score-tag">{Math.round(c.similarity * 100)}%</span>}
            </div>
            <p className="ea-efekt-opis">{c.opis.slice(0, 300)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
