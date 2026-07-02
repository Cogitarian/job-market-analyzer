import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import './OutcomesExplorer.css'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)
ChartJS.defaults.color = '#1f2937'

import { API_BASE as API } from '../config'

// ── Types ─────────────────────────────────────────────────────────────────────

type Scope = 'kierunek' | 'wydzial' | 'uczelnia'

interface Outcome {
  code: string
  category: 'skills' | 'knowledge' | 'competences'
  description: string
  program_codes: string[]
  source_uuid?: string
  source_title?: string
}

interface ClusterInfo {
  id: number
  size: number
  top_terms: string[]
  members: string[]
}

interface Analysis {
  n_outcomes: number
  clusters: ClusterInfo[]
  similarity_matrix: { labels: string[]; matrix: number[][] }
  bigrams: { ngram: string; count: number }[]
  trigrams: { ngram: string; count: number }[]
  categories: { skills?: number; knowledge?: number; competences?: number }
  assignments: number[]
}

interface SearchResult {
  score: number
  outcome: Outcome
}

// ── Colour palette for clusters ────────────────────────────────────────────────

const CLUSTER_COLOURS = [
  '#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#ef4444',
  '#a78bfa', '#34d399', '#fb923c', '#38bdf8', '#f472b6',
]

const CATEGORY_LABELS: Record<string, string> = {
  skills: 'Umiejętności (U)',
  knowledge: 'Wiedza (W)',
  competences: 'Kompetencje (K)',
}

const CATEGORY_ICONS: Record<string, string> = {
  skills: '🛠',
  knowledge: '📚',
  competences: '🧠',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OutcomesExplorer() {
  const [dbStatus, setDbStatus] = useState<{ available: boolean; message?: string; n_courses?: number } | null>(null)
  const [scope, setScope] = useState<Scope>('kierunek')
  const [faculties, setFaculties] = useState<string[]>([])
  const [kierunki, setKierunki] = useState<string[]>([])
  const [selectedFaculty, setSelectedFaculty] = useState('')
  const [selectedKierunek, setSelectedKierunek] = useState('')

  const [outcomes, setOutcomes] = useState<Outcome[]>([])
  const [analysis, setAnalysis] = useState<Analysis | null>(null)

  const [activeTab, setActiveTab] = useState<'outcomes' | 'nlp' | 'search'>('outcomes')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)

  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Everything here reads the one-time-crawled university database (see
  // syllabus_corpus.py) — no live scraping, since syllabi don't change
  // between sessions and re-fetching them every time was the whole problem.
  useEffect(() => {
    axios.get(`${API}/api/university-corpus/status`).then(r => setDbStatus(r.data))
    axios.get(`${API}/api/university-corpus/faculties-list`).then(r => setFaculties(r.data.faculties || []))
  }, [])

  useEffect(() => {
    if (scope === 'uczelnia') { setKierunki([]); return }
    axios.get(`${API}/api/university-corpus/kierunki-in-scope`, {
      params: scope === 'wydzial' ? { faculty_name: selectedFaculty || undefined } : {},
    }).then(r => setKierunki(r.data.kierunki || []))
  }, [scope, selectedFaculty])

  useEffect(() => {
    setSelectedFaculty('')
    setSelectedKierunek('')
    setOutcomes([])
    setAnalysis(null)
  }, [scope])

  const canAnalyze = scope === 'uczelnia' || (scope === 'wydzial' && !!selectedFaculty) || (scope === 'kierunek' && !!selectedKierunek)

  const runAnalysis = () => {
    if (!canAnalyze) return
    setError(null)
    setAnalyzing(true)
    setOutcomes([])
    setAnalysis(null)
    const body: any = {}
    if (scope === 'wydzial') body.faculty_name = selectedFaculty
    if (scope === 'kierunek') body.kierunek = selectedKierunek
    axios.post(`${API}/api/university-corpus/efekty-scoped`, body)
      .then(r => {
        setOutcomes(r.data.outcomes || [])
        setAnalysis(r.data)
        setActiveTab('outcomes')
      })
      .catch(e => setError(e.response?.data?.detail || 'Błąd analizy'))
      .finally(() => setAnalyzing(false))
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const r = await axios.post(`${API}/api/outcomes/search`, {
        query: searchQuery,
        top_k: 12,
      })
      setSearchResults(r.data.results || [])
    } catch {
      setError('Błąd wyszukiwania')
    } finally {
      setSearching(false)
    }
  }

  // Group outcomes by category
  const groupedOutcomes = outcomes.reduce<Record<string, Outcome[]>>((acc, o) => {
    const cat = o.category || 'unknown'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(o)
    return acc
  }, {})

  if (!dbStatus) return <div className="outcomes-explorer"><div className="oe-empty">⏳</div></div>

  if (!dbStatus.available) {
    return (
      <div className="outcomes-explorer">
        <div className="oe-empty">
          <div className="oe-empty-icon">⏳</div>
          <p>{dbStatus.message || 'Baza sylabusów całego uniwersytetu jeszcze się buduje. Wróć później.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="outcomes-explorer">
      {/* ── Selector panel ─────────────────────────────────────────────────── */}
      <div className="oe-selector-panel">
        <div className="oe-selector-row">
          <div className="oe-selector-group">
            <label>Zakres analizy</label>
            <div className="ea-mode-toggle">
              <button className={scope === 'kierunek' ? 'active' : ''} onClick={() => setScope('kierunek')}>Kierunek</button>
              <button className={scope === 'wydzial' ? 'active' : ''} onClick={() => setScope('wydzial')}>Wydział</button>
              <button className={scope === 'uczelnia' ? 'active' : ''} onClick={() => setScope('uczelnia')}>Cała uczelnia</button>
            </div>
          </div>

          {(scope === 'wydzial' || scope === 'kierunek') && (
            <div className="oe-selector-group">
              <label>Wydział {scope === 'kierunek' ? '(opcjonalnie, zawęża listę kierunków)' : ''}</label>
              <select value={selectedFaculty} onChange={e => setSelectedFaculty(e.target.value)}>
                <option value="">{scope === 'wydzial' ? '— wybierz wydział —' : '— wszystkie wydziały —'}</option>
                {faculties.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          )}

          {scope === 'kierunek' && (
            <div className="oe-selector-group">
              <label>Kierunek</label>
              <select value={selectedKierunek} onChange={e => setSelectedKierunek(e.target.value)}>
                <option value="">— wybierz kierunek ({kierunki.length}) —</option>
                {kierunki.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          )}

          <button className="oe-scrape-btn" onClick={runAnalysis} disabled={!canAnalyze || analyzing}>
            {analyzing ? '⏳ Analizuję…' : '🔍 Analizuj'}
          </button>
        </div>

        {analyzing && scope === 'uczelnia' && (
          <div className="oe-progress-label">⏳ Cała uczelnia to ~87 000 efektów — to zajmie kilka-kilkanaście sekund.</div>
        )}

        {error && (
          <div className="oe-error">{error} <button onClick={() => setError(null)}>✕</button></div>
        )}
      </div>

      {/* ── Intro / empty state ─────────────────────────────────────────────── */}
      {!outcomes.length && !analyzing && (
        <div className="oe-empty">
          <div className="oe-empty-icon">🎓</div>
          <h2>Odkrywacz Efektów Kształcenia</h2>
          <p>
            Wybierz zakres (kierunek, wydział albo całą uczelnię) i kliknij <strong>Analizuj</strong> — dane
            pochodzą z bazy {dbStatus.n_courses?.toLocaleString('pl-PL')} przedmiotów zebranej raz z
            <code> sylabus.amu.edu.pl</code> (bez ponownego pobierania), z pełną analizą NLP: klasteryzacją
            TF-IDF, bigramami/trigramami, macierzą podobieństwa. Zakładka „Szukaj po umiejętnościach"
            przeszukuje efekty całej uczelni niezależnie od wybranego zakresu — wpisz dowolne umiejętności,
            by zobaczyć, które kierunki/przedmioty uczą tego, co Cię interesuje.
          </p>
        </div>
      )}

      {/* ── Main content (tabs) ─────────────────────────────────────────────── */}
      {outcomes.length > 0 && (
        <div className="oe-content">
          {/* Tab bar */}
          <div className="oe-tabs">
            <button
              className={`oe-tab ${activeTab === 'outcomes' ? 'active' : ''}`}
              onClick={() => setActiveTab('outcomes')}
            >
              📋 Efekty kształcenia
              <span className="oe-tab-badge">{outcomes.length}</span>
            </button>
            <button
              className={`oe-tab ${activeTab === 'nlp' ? 'active' : ''}`}
              onClick={() => setActiveTab('nlp')}
            >
              🧬 Analiza NLP
            </button>
            <button
              className={`oe-tab ${activeTab === 'search' ? 'active' : ''}`}
              onClick={() => setActiveTab('search')}
            >
              🔎 Wyszukaj po umiejętnościach
            </button>
          </div>

          {/* ── Tab: Outcomes list ─────────────────────────────────────────── */}
          {activeTab === 'outcomes' && (
            <div className="oe-outcomes-panel">
              <div className="oe-summary-chips">
                {Object.entries(analysis?.categories ?? {}).map(([cat, n]) => (
                  <span key={cat} className={`oe-chip oe-chip-${cat}`}>
                    {CATEGORY_ICONS[cat] ?? '?'} {CATEGORY_LABELS[cat] ?? cat}: {n}
                  </span>
                ))}
              </div>

              {(['knowledge', 'skills', 'competences'] as const).map(cat => {
                const items = groupedOutcomes[cat] ?? []
                if (!items.length) return null
                return (
                  <div key={cat} className="oe-category-section">
                    <h3 className={`oe-category-title oe-cat-${cat}`}>
                      {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
                      <span className="oe-count">({items.length})</span>
                    </h3>
                    <div className="oe-outcomes-list">
                      {items.map((o, i) => {
                        const clusterIdx = analysis?.assignments?.[outcomes.indexOf(o)]
                        const colour = clusterIdx != null ? CLUSTER_COLOURS[clusterIdx % CLUSTER_COLOURS.length] : '#888'
                        return (
                          <div key={i} className="oe-outcome-card">
                            <div className="oe-outcome-header">
                              <span className={`oe-code oe-code-${cat}`}>{o.code}</span>
                              {clusterIdx != null && (
                                <span
                                  className="oe-cluster-dot"
                                  style={{ background: colour }}
                                  title={`Klaster ${clusterIdx}`}
                                />
                              )}
                              {o.source_title && (
                                <span className="oe-source">{o.source_title}</span>
                              )}
                            </div>
                            <p className="oe-outcome-desc">{o.description}</p>
                            {o.program_codes.length > 0 && (
                              <div className="oe-prog-codes">
                                {o.program_codes.map(c => (
                                  <span key={c} className="oe-prog-code">{c}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Tab: NLP Analysis ─────────────────────────────────────────── */}
          {activeTab === 'nlp' && analysis && (
            <div className="oe-nlp-panel">
              {/* Cluster cards */}
              <section className="oe-nlp-section">
                <h3>Klastry efektów kształcenia (TF-IDF + k-means)</h3>
                <p className="oe-nlp-desc">
                  Algorytm k-means pogrupował {analysis.n_outcomes} efektów w{' '}
                  {analysis.clusters.length} klastrów tematycznych na podstawie wektorów TF-IDF
                  (term frequency–inverse document frequency). Kolory na liście efektów
                  odpowiadają przypisaniu do klastra.
                </p>
                <div className="oe-clusters-grid">
                  {analysis.clusters.map(cl => (
                    <div
                      key={cl.id}
                      className="oe-cluster-card"
                      style={{ borderColor: CLUSTER_COLOURS[cl.id % CLUSTER_COLOURS.length] }}
                    >
                      <div
                        className="oe-cluster-header"
                        style={{ background: CLUSTER_COLOURS[cl.id % CLUSTER_COLOURS.length] }}
                      >
                        Klaster {cl.id + 1} · {cl.size} efektów
                      </div>
                      <div className="oe-cluster-terms">
                        {cl.top_terms.map(t => (
                          <span key={t} className="oe-term">{t}</span>
                        ))}
                      </div>
                      {cl.members.length > 0 && (
                        <div className="oe-cluster-members">
                          {cl.members.slice(0, 5).join(', ')}
                          {cl.members.length > 5 && ` +${cl.members.length - 5} więcej`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Bigrams chart */}
              <section className="oe-nlp-section">
                <h3>Top bigramy (kolokacje)</h3>
                <p className="oe-nlp-desc">
                  Najczęściej współwystępujące pary słów w tekstach efektów kształcenia.
                  Kolokacje ujawniają powtarzające się wzorce tematyczne.
                </p>
                <div className="oe-chart-wrap">
                  <Bar
                    data={{
                      labels: analysis.bigrams.slice(0, 15).map(b => b.ngram),
                      datasets: [{
                        label: 'Liczba wystąpień',
                        data: analysis.bigrams.slice(0, 15).map(b => b.count),
                        backgroundColor: analysis.bigrams.slice(0, 15).map(
                          (_, i) => CLUSTER_COLOURS[i % CLUSTER_COLOURS.length] + 'cc'
                        ),
                        borderRadius: 4,
                      }],
                    }}
                    options={{
                      indexAxis: 'y',
                      responsive: true,
                      plugins: {
                        legend: { display: false },
                        title: { display: false },
                      },
                      scales: {
                        x: { ticks: { color: '#1f2937' }, grid: { color: '#e5e7eb' } },
                        y: { ticks: { color: '#1f2937', font: { size: 12 } } },
                      },
                    }}
                  />
                </div>
              </section>

              {/* Trigrams */}
              {analysis.trigrams.length > 0 && (
                <section className="oe-nlp-section">
                  <h3>Top trigramy</h3>
                  <div className="oe-ngram-grid">
                    {analysis.trigrams.slice(0, 10).map(t => (
                      <div key={t.ngram} className="oe-ngram-pill">
                        <span className="oe-ngram-text">{t.ngram}</span>
                        <span className="oe-ngram-count">{t.count}×</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Similarity heatmap */}
              {analysis.similarity_matrix.matrix.length > 1 && (
                <section className="oe-nlp-section">
                  <h3>Macierz podobieństwa cosinusowego</h3>
                  <p className="oe-nlp-desc">
                    Każda komórka (i, j) pokazuje podobieństwo cosinusowe między wektorem
                    TF-IDF efektu i oraz efektu j. Wartość bliska 1 oznacza identyczne
                    słownictwo, 0 — brak wspólnych terminów. Wyświetlone pierwsze{' '}
                    {analysis.similarity_matrix.labels.length} efektów.
                  </p>
                  <SimilarityHeatmap
                    labels={analysis.similarity_matrix.labels}
                    matrix={analysis.similarity_matrix.matrix}
                  />
                </section>
              )}
            </div>
          )}

          {/* ── Tab: Search / Reverse lookup ──────────────────────────────── */}
          {activeTab === 'search' && (
            <div className="oe-search-panel">
              <div className="oe-search-intro">
                <h3>Wyszukiwanie odwrotne: umiejętności → programy</h3>
                <p>
                  Wpisz kompetencje, które Cię interesują (po polsku lub angielsku) —
                  system dopasuje je do efektów kształcenia na podstawie podobieństwa
                  TF-IDF i pokaże, które przedmioty i kierunki je rozwijają.
                </p>
              </div>

              <div className="oe-search-row">
                <input
                  className="oe-search-input"
                  type="text"
                  placeholder="np. analiza danych, machine learning, programowanie Python…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
                <button
                  className="oe-search-btn"
                  onClick={handleSearch}
                  disabled={searching || !searchQuery.trim()}
                >
                  {searching ? '⏳' : '🔍'} Szukaj
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="oe-search-results">
                  <div className="oe-results-header">
                    Znaleziono {searchResults.length} pasujących efektów
                  </div>
                  {searchResults.map((r, i) => (
                    <div key={i} className="oe-result-card">
                      <div className="oe-result-top">
                        <span className={`oe-code oe-code-${r.outcome.category}`}>
                          {r.outcome.code}
                        </span>
                        <ScoreBar score={r.score} />
                        {r.outcome.source_title && (
                          <span className="oe-source">{r.outcome.source_title}</span>
                        )}
                      </div>
                      <p className="oe-outcome-desc">{r.outcome.description}</p>
                      {r.outcome.program_codes?.length > 0 && (
                        <div className="oe-prog-codes">
                          {r.outcome.program_codes.map(c => (
                            <span key={c} className="oe-prog-code">{c}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {searchResults.length === 0 && searchQuery && !searching && (
                <div className="oe-no-results">
                  Brak wyników dla zapytania "<strong>{searchQuery}</strong>".
                  Spróbuj innych słów kluczowych lub najpierw załaduj więcej syllabusów.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Similarity heatmap (SVG-based) ────────────────────────────────────────────

function SimilarityHeatmap({ labels, matrix }: { labels: string[]; matrix: number[][] }) {
  const n = labels.length
  const cellSize = Math.max(18, Math.min(36, Math.floor(480 / n)))
  const labelWidth = 120
  const width = labelWidth + n * cellSize
  const height = labelWidth + n * cellSize

  return (
    <div className="oe-heatmap-wrap">
      <svg width={width} height={height} className="oe-heatmap">
        {/* Column labels */}
        {labels.map((lbl, j) => (
          <text
            key={`col-${j}`}
            x={labelWidth + j * cellSize + cellSize / 2}
            y={labelWidth - 4}
            textAnchor="end"
            fontSize={10}
            fill="#374151"
            transform={`rotate(-45, ${labelWidth + j * cellSize + cellSize / 2}, ${labelWidth - 4})`}
          >
            {lbl.length > 8 ? lbl.slice(0, 8) : lbl}
          </text>
        ))}
        {/* Row labels */}
        {labels.map((lbl, i) => (
          <text
            key={`row-${i}`}
            x={labelWidth - 4}
            y={labelWidth + i * cellSize + cellSize / 2 + 4}
            textAnchor="end"
            fontSize={10}
            fill="#374151"
          >
            {lbl.length > 10 ? lbl.slice(0, 10) : lbl}
          </text>
        ))}
        {/* Cells */}
        {matrix.map((row, i) =>
          row.map((val, j) => {
            const intensity = Math.min(1, Math.max(0, val))
            // Colour: dark teal (low) → cyan (high)
            const R = Math.round(6 + intensity * (56 - 6))
            const G = Math.round(78 + intensity * (189 - 78))
            const B = Math.round(59 + intensity * (248 - 59))
            const fill = i === j ? '#4ade80' : `rgb(${R},${G},${B})`
            return (
              <rect
                key={`${i}-${j}`}
                x={labelWidth + j * cellSize}
                y={labelWidth + i * cellSize}
                width={cellSize - 1}
                height={cellSize - 1}
                fill={fill}
                opacity={i === j ? 0.8 : 0.2 + intensity * 0.8}
              >
                <title>{`${labels[i]} ↔ ${labels[j]}: ${val.toFixed(3)}`}</title>
              </rect>
            )
          })
        )}
      </svg>
      <p className="oe-heatmap-legend">
        <span style={{ background: 'rgb(6,78,59)', display: 'inline-block', width: 12, height: 12, marginRight: 4 }} />
        niskie podobieństwo
        <span style={{ background: 'rgb(56,189,248)', display: 'inline-block', width: 12, height: 12, margin: '0 4px 0 16px' }} />
        wysokie podobieństwo
        <span style={{ background: '#4ade80', display: 'inline-block', width: 12, height: 12, margin: '0 4px 0 16px' }} />
        identyczny efekt (przekątna)
      </p>
    </div>
  )
}

// ── Score bar for search results ─────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  return (
    <div className="oe-score-bar" title={`Podobieństwo: ${pct}%`}>
      <div className="oe-score-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
      <span className="oe-score-label">{pct}%</span>
    </div>
  )
}
