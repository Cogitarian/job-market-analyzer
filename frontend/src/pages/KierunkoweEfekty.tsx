import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import './KierunkoweEfekty.css'

import { API_BASE as API } from '../config'

interface KierunekSummary {
  key: string
  kierunek: string
  uchwala_nr: string
  n_efekty: number
  categories: { knowledge?: number; skills?: number; competences?: number }
  by_stopien: { I: number; II: number; III: number; '': number }
}

interface Efekt {
  kod: string
  opis: string
  prk: string[]
  category: 'knowledge' | 'skills' | 'competences' | 'unknown'
  stopien: string
  source_url: string
}

interface KierunekDetail {
  kierunek: string
  uchwala_nr: string
  efekty: Efekt[]
}

interface SearchResult {
  score: number
  efekt: Efekt & { kierunek: string }
}

const CATEGORY_LABELS: Record<string, string> = {
  knowledge: 'Wiedza',
  skills: 'Umiejętności',
  competences: 'Kompetencje społeczne',
}
const CATEGORY_ICONS: Record<string, string> = {
  knowledge: '📚',
  skills: '🛠',
  competences: '🧠',
}

export default function KierunkoweEfekty() {
  const [kierunki, setKierunki] = useState<KierunekSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [detail, setDetail] = useState<KierunekDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [stopienFilter, setStopienFilter] = useState<'' | 'I' | 'II' | 'III'>('')

  const [mode, setMode] = useState<'browse' | 'search'>('browse')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    axios.get(`${API}/api/kierunkowe-efekty/kierunki`)
      .then(r => setKierunki(r.data.kierunki || []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedKey) return
    setLoadingDetail(true)
    setDetail(null)
    setStopienFilter('')
    axios.get(`${API}/api/kierunkowe-efekty/kierunki/${encodeURIComponent(selectedKey)}`)
      .then(r => setDetail(r.data))
      .finally(() => setLoadingDetail(false))
  }, [selectedKey])

  const selectedSummary = useMemo(
    () => kierunki.find(k => k.key === selectedKey) || null,
    [kierunki, selectedKey],
  )
  const availableStopnie = useMemo(() => {
    if (!selectedSummary) return []
    return (['I', 'II', 'III'] as const).filter(s => selectedSummary.by_stopien[s] > 0)
  }, [selectedSummary])

  const filteredKierunki = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return kierunki
    return kierunki.filter(k => k.kierunek.toLowerCase().includes(q))
  }, [kierunki, filter])

  const [searchStopien, setSearchStopien] = useState<'' | 'I' | 'II' | 'III'>('')

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const r = await axios.post(`${API}/api/kierunkowe-efekty/search`, {
        query: searchQuery, top_k: 25, stopien: searchStopien || undefined,
      })
      setSearchResults(r.data.results || [])
    } finally {
      setSearching(false)
    }
  }

  const groupedDetail = useMemo(() => {
    if (!detail) return {}
    const groups: Record<string, Efekt[]> = {}
    for (const e of detail.efekty) {
      if (!e.kod) continue
      if (stopienFilter && e.stopien !== stopienFilter) continue
      const key = e.category
      if (!groups[key]) groups[key] = []
      groups[key].push(e)
    }
    return groups
  }, [detail, stopienFilter])

  return (
    <div className="ke-page">
      <div className="ke-header">
        <div>
          <h2>🏛 Rejestr efektów wg kierunków — pełny rejestr UAM</h2>
          <p className="ke-subtitle">
            Oficjalne, pełne definicje efektów kierunkowych (nie tylko kody) — pozyskane z uchwał
            Senatu UAM publikowanych na <code>bip.amu.edu.pl</code>. To uzupełnienie danych z
            sylabusów przedmiotów (zakładka „Efekty kształcenia"), które podają tylko kody
            (np. FFR_K1_U01) bez pełnej treści.
          </p>
        </div>
        <div className="ke-mode-toggle">
          <button className={mode === 'browse' ? 'active' : ''} onClick={() => setMode('browse')}>
            📋 Przeglądaj kierunki
          </button>
          <button className={mode === 'search' ? 'active' : ''} onClick={() => setMode('search')}>
            🔎 Szukaj we wszystkich
          </button>
        </div>
      </div>

      {loading && <div className="ke-loading">Wczytywanie rejestru kierunków…</div>}

      {!loading && mode === 'browse' && (
        <div className="ke-browse-layout">
          <div className="ke-list-panel">
            <input
              className="ke-filter-input"
              placeholder={`Filtruj wśród ${kierunki.length} kierunków…`}
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
            <div className="ke-kierunek-list">
              {filteredKierunki.map(k => (
                <button
                  key={k.key}
                  className={`ke-kierunek-item ${selectedKey === k.key ? 'active' : ''}`}
                  onClick={() => setSelectedKey(k.key)}
                >
                  <span className="ke-kierunek-name">{k.kierunek}</span>
                  <span className="ke-kierunek-meta">
                    {k.n_efekty} efektów · uchwała {k.uchwala_nr}
                    {k.by_stopien.I > 0 && k.by_stopien.II > 0 && (
                      <span className="ke-mixed-badge"> · I+II stopień</span>
                    )}
                  </span>
                </button>
              ))}
              {filteredKierunki.length === 0 && (
                <div className="ke-empty-note">Brak kierunków pasujących do filtra.</div>
              )}
            </div>
          </div>

          <div className="ke-detail-panel">
            {!selectedKey && (
              <div className="ke-empty-note ke-empty-center">
                ← wybierz kierunek z listy, aby zobaczyć pełne efekty kierunkowe
              </div>
            )}
            {selectedKey && loadingDetail && <div className="ke-loading">Wczytywanie…</div>}
            {selectedKey && detail && !loadingDetail && (
              <>
                <h3>{detail.kierunek}</h3>
                <p className="ke-source-note">
                  Źródło: uchwała nr {detail.uchwala_nr} Senatu UAM (bip.amu.edu.pl)
                </p>
                {availableStopnie.length > 1 && (
                  <div className="ke-stopien-toggle">
                    <button className={stopienFilter === '' ? 'active' : ''} onClick={() => setStopienFilter('')}>
                      Oba stopnie
                    </button>
                    {availableStopnie.map(s => (
                      <button key={s} className={stopienFilter === s ? 'active' : ''} onClick={() => setStopienFilter(s)}>
                        {s} stopień ({selectedSummary?.by_stopien[s]})
                      </button>
                    ))}
                  </div>
                )}
                {(['knowledge', 'skills', 'competences'] as const).map(cat => {
                  const items = groupedDetail[cat]
                  if (!items?.length) return null
                  return (
                    <div key={cat} className="ke-category-block">
                      <h4 className={`ke-cat-${cat}`}>{CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}</h4>
                      <div className="ke-efekty-list">
                        {items.map(e => (
                          <div key={e.kod} className="ke-efekt-card">
                            <div className="ke-efekt-top">
                              <span className={`ke-kod ke-kod-${cat}`}>{e.kod}</span>
                              {e.stopien && <span className="ke-stopien">st. {e.stopien}</span>}
                              {e.prk?.length > 0 && (
                                <span className="ke-prk">{e.prk.join(', ')}</span>
                              )}
                            </div>
                            <p className="ke-efekt-opis">{e.opis}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
      )}

      {!loading && mode === 'search' && (
        <div className="ke-search-panel">
          <div className="ke-search-row">
            <input
              className="ke-search-input"
              placeholder="np. analiza danych, tłumaczenie ustne, zarządzanie projektem…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <select value={searchStopien} onChange={e => setSearchStopien(e.target.value as any)}>
              <option value="">Oba stopnie</option>
              <option value="I">I stopień</option>
              <option value="II">II stopień</option>
              <option value="III">III stopień</option>
            </select>
            <button className="ke-search-btn" onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
              {searching ? '⏳' : '🔍'} Szukaj
            </button>
          </div>
          <p className="ke-search-hint">
            Przeszukuje efekty kierunkowe wszystkich {kierunki.length} kierunków jednocześnie
            (podobieństwo TF-IDF) — pokazuje, które kierunki uczą danej kompetencji.
          </p>

          {searchResults.length > 0 && (
            <div className="ke-search-results">
              {searchResults.map((r, i) => (
                <div key={i} className="ke-efekt-card">
                  <div className="ke-efekt-top">
                    <span className={`ke-kod ke-kod-${r.efekt.category}`}>{r.efekt.kod}</span>
                    {r.efekt.stopien && <span className="ke-stopien">st. {r.efekt.stopien}</span>}
                    <span className="ke-result-kierunek">{r.efekt.kierunek}</span>
                    <span className="ke-score">{Math.round(r.score * 100)}%</span>
                  </div>
                  <p className="ke-efekt-opis">{r.efekt.opis}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
