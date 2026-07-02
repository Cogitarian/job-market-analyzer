import { useState, useEffect } from 'react'
import axios from 'axios'
import './EfektyAnalysis.css'
import './StudyPlanner.css'

import { API_BASE as API } from '../config'

type EntryPoint = 'stanowiska' | 'wymagania'
type Poziom = 'LIC' | 'MGR' | 'MIXED'
type Forma = 'STACJ' | 'NIESTACJ' | 'MIXED'

interface Stanowisko { stanowisko: string; n_ofert?: number; n_matches?: number }
interface NgramItem { ngram: string; n: number; count: number }
interface FacetItem { value: string; count: number }
interface Efekt { id: string; kod: string; kierunek: string; kierunek_skrot?: string; category: string; opis: string; similarity?: number }
interface KierunekMatch { kierunek: string; n_matches: number }

interface Przedmiot {
  uuid: string; title: string; kierunki: string[]; semestr: number | null; rok: number | null
  zajecia: { forma: string; godziny: number }[]; total_godziny: number; forma_zaliczenia: string; ects: number | null
}
interface ConstraintViolation { semestr: number; godziny: number; ects: number; przekroczone_godziny: boolean; niewystarczajace_ects: boolean }
interface Plan {
  przedmioty: Przedmiot[]; n_przedmioty: number; hours_by_semester: Record<string, number>
  ects_by_semester: Record<string, number>; assessments_by_semester: Record<string, { egzamin: number; zaliczenie: number }>
  kierunki_unmatched: string[]; constraint_violations: ConstraintViolation[]
}

const CATEGORY_LABELS: Record<string, string> = { knowledge: 'Wiedza', skills: 'Umiejętności', competences: 'Kompetencje' }

export default function JobMarketPlanner() {
  const [status, setStatus] = useState<{ is_placeholder: boolean; n_offers: number; source?: string; message?: string } | null>(null)
  const [entryPoint, setEntryPoint] = useState<EntryPoint>('stanowiska')

  const [allStanowiska, setAllStanowiska] = useState<Stanowisko[]>([])
  const [selectedStanowiska, setSelectedStanowiska] = useState<Set<string>>(new Set())
  const [skipStanowiska, setSkipStanowiska] = useState(false)

  const [ngrams, setNgrams] = useState<NgramItem[]>([])
  const [facets, setFacets] = useState<Record<string, FacetItem[]>>({})
  const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set())
  const [wymaganiaLoading, setWymaganiaLoading] = useState(false)
  const [nMin, setNMin] = useState(1)
  const [nMax, setNMax] = useState(3)
  const [wymaganiaTopK, setWymaganiaTopK] = useState(50)
  const [wymaganiaMinFreq, setWymaganiaMinFreq] = useState(1)

  const [matchedStanowiska, setMatchedStanowiska] = useState<Stanowisko[]>([])

  const [matchedEfekty, setMatchedEfekty] = useState<Efekt[]>([])
  const [efektyKierunkiSummary, setEfektyKierunkiSummary] = useState<[string, number][]>([])
  const [selectedEfekty, setSelectedEfekty] = useState<Set<string>>(new Set())
  const [efektyLoading, setEfektyLoading] = useState(false)

  const [matchedKierunki, setMatchedKierunki] = useState<KierunekMatch[]>([])
  const [selectedKierunki, setSelectedKierunki] = useState<Set<string>>(new Set())
  const [discoverLoading, setDiscoverLoading] = useState(false)

  const [poziom, setPoziom] = useState<Poziom>('MIXED')
  const [forma, setForma] = useState<Forma>('MIXED')
  const [maxGodzinSemestr, setMaxGodzinSemestr] = useState<number | ''>('')
  const [minEctsSemestr, setMinEctsSemestr] = useState<number | ''>(30)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [planLoading, setPlanLoading] = useState(false)

  useEffect(() => {
    axios.get(`${API}/api/job-market/status`).then(r => setStatus(r.data))
    axios.get(`${API}/api/job-market/stanowiska`).then(r => setAllStanowiska(r.data.stanowiska || []))
  }, [])

  const toggleSet = (set: Set<string>, setSet: (s: Set<string>) => void, key: string) => {
    const next = new Set(set)
    next.has(key) ? next.delete(key) : next.add(key)
    setSet(next)
  }

  const runWymagania = () => {
    setWymaganiaLoading(true)
    const stanowiska = (entryPoint === 'stanowiska' && !skipStanowiska && selectedStanowiska.size > 0)
      ? Array.from(selectedStanowiska) : undefined
    axios.post(`${API}/api/job-market/wymagania`, {
      stanowiska, n_min: nMin, n_max: nMax, top_k: wymaganiaTopK, min_freq: wymaganiaMinFreq,
    })
      .then(r => { setNgrams(r.data.ngrams || []); setFacets(r.data.facets || {}) })
      .finally(() => setWymaganiaLoading(false))
  }

  useEffect(() => { runWymagania() }, [entryPoint, skipStanowiska]) // eslint-disable-line

  const runStanowiskaForWymagania = () => {
    if (selectedTerms.size === 0) { setMatchedStanowiska([]); return }
    axios.post(`${API}/api/job-market/stanowiska-for-wymagania`, { terms: Array.from(selectedTerms) })
      .then(r => setMatchedStanowiska(r.data.stanowiska || []))
  }

  const runEfekty = () => {
    if (selectedTerms.size === 0) return
    setEfektyLoading(true)
    axios.post(`${API}/api/job-market/efekty-for-wymagania`, { terms: Array.from(selectedTerms), top_k: 60 })
      .then(r => {
        setMatchedEfekty(r.data.efekty || [])
        setEfektyKierunkiSummary(r.data.kierunki_summary || [])
        setSelectedEfekty(new Set((r.data.efekty || []).map((e: Efekt) => e.id)))
      })
      .finally(() => setEfektyLoading(false))
  }

  const runDiscoverKierunki = () => {
    if (selectedEfekty.size === 0) return
    setDiscoverLoading(true)
    axios.post(`${API}/api/university-corpus/discover-kierunki`, {
      criterion: 'kierunkowe', selected_ids: Array.from(selectedEfekty), method: 'tfidf', top_k: 100,
    }).then(r => {
      const kierunki: KierunekMatch[] = r.data.kierunki || []
      setMatchedKierunki(kierunki)
      setSelectedKierunki(new Set(kierunki.map(k => k.kierunek)))
    }).finally(() => setDiscoverLoading(false))
  }

  const runPlan = () => {
    if (selectedKierunki.size === 0) return
    setPlanLoading(true)
    axios.post(`${API}/api/university-corpus/plan`, {
      kierunki: Array.from(selectedKierunki), poziom, forma,
      max_godzin_semestr: maxGodzinSemestr === '' ? undefined : maxGodzinSemestr,
      min_ects_semestr: minEctsSemestr === '' ? undefined : minEctsSemestr,
    }).then(r => setPlan(r.data)).finally(() => setPlanLoading(false))
  }

  if (!status) return <div className="ea-page"><div className="ea-loading">Wczytywanie…</div></div>

  return (
    <div className="ea-page">
      <div className="ea-header">
        <h2>💼 Rynek pracy → Program studiów</h2>
        <p className="ea-subtitle">
          STANOWISKA ↔ WYMAGANIA → EFEKTY → KIERUNKI → PRZEDMIOTY → PROGRAM STUDIÓW. Wybierz punkt startowy, każdy
          etap można pominąć.
        </p>
        <div className="ea-info-note">
          ℹ️ Źródło: <strong>{status.source}</strong> — {status.n_offers} prawdziwych profili zawodowych (nie
          syntetyczne).<br />{status.message}
        </div>
      </div>

      <div className="ea-tab-content">
        <div className="sp-section">
          <h3>1. Punkt startowy</h3>
          <div className="ea-mode-toggle">
            <button className={entryPoint === 'stanowiska' ? 'active' : ''} onClick={() => setEntryPoint('stanowiska')}>Stanowiska najpierw</button>
            <button className={entryPoint === 'wymagania' ? 'active' : ''} onClick={() => setEntryPoint('wymagania')}>Wymagania najpierw</button>
          </div>
        </div>

        {entryPoint === 'stanowiska' && (
          <div className="sp-section">
            <h3>2. Wybierz stanowiska</h3>
            <div className="ea-mode-toggle">
              <button className={!skipStanowiska ? 'active' : ''} onClick={() => setSkipStanowiska(false)}>Wybieram konkretne</button>
              <button className={skipStanowiska ? 'active' : ''} onClick={() => setSkipStanowiska(true)}>Pomiń (użyj wszystkich ofert)</button>
            </div>
            {!skipStanowiska && (
              <>
                <div className="ea-controls-row">
                  <span className="ea-count-badge">{selectedStanowiska.size} wybranych z {allStanowiska.length}</span>
                </div>
                <div className="ea-select-list">
                  {allStanowiska.map(s => (
                    <label key={s.stanowisko} className="ea-select-item">
                      <input type="checkbox" checked={selectedStanowiska.has(s.stanowisko)} onChange={() => toggleSet(selectedStanowiska, setSelectedStanowiska, s.stanowisko)} />
                      <span className="ea-select-opis">{s.stanowisko}</span>
                      <span className="ea-score-tag">{s.n_ofert} ofert</span>
                    </label>
                  ))}
                </div>
                <button className="ea-run-btn" onClick={runWymagania} disabled={wymaganiaLoading}>
                  {wymaganiaLoading ? '⏳' : '▶ Generalizuj wymagania dla wybranych'}
                </button>
              </>
            )}
          </div>
        )}

        <div className="sp-section">
          <h3>{entryPoint === 'stanowiska' ? '3' : '2'}. Wymagania (zgeneralizowane z ofert)</h3>
          <div className="ea-param-grid">
            <label>Min. długość frazy
              <input type="number" min={1} max={6} value={nMin} onChange={e => setNMin(+e.target.value)} />
            </label>
            <label>Maks. długość frazy
              <input type="number" min={1} max={6} value={nMax} onChange={e => setNMax(+e.target.value)} />
            </label>
            <label>Min. częstość
              <input type="number" min={1} value={wymaganiaMinFreq} onChange={e => setWymaganiaMinFreq(+e.target.value)} />
            </label>
            <label>Liczba fraz
              <input type="number" min={5} max={300} value={wymaganiaTopK} onChange={e => setWymaganiaTopK(+e.target.value)} />
            </label>
            <button className="ea-run-btn" onClick={runWymagania} disabled={wymaganiaLoading}>
              {wymaganiaLoading ? '⏳' : '▶ Odśwież frazy'}
            </button>
          </div>
          {wymaganiaLoading && <div className="ea-loading">⏳</div>}
          {!wymaganiaLoading && (
            <>
              <p className="ea-tab-intro">Frazy n-gramowe z pól wymagań (dowolne, opcjonalne, dowolna liczba):</p>
              <div className="ea-ngram-results">
                {ngrams.map((n, i) => (
                  <button
                    key={i} className="ea-ngram-pill"
                    style={{ cursor: 'pointer', border: selectedTerms.has(n.ngram) ? '2px solid var(--accent, #3b82f6)' : undefined }}
                    onClick={() => { toggleSet(selectedTerms, setSelectedTerms, n.ngram); }}
                  >
                    <span className="ea-ngram-text">{n.ngram}</span>
                    <span className="ea-ngram-count">{n.count}×</span>
                  </button>
                ))}
              </div>
              {Object.entries(facets).map(([facetName, items]) => items.length > 0 && (
                <div key={facetName}>
                  <h4>{facetName}</h4>
                  <div className="ea-ngram-results">
                    {items.map((f, i) => (
                      <button
                        key={i} className="ea-ngram-pill"
                        style={{ cursor: 'pointer', border: selectedTerms.has(f.value) ? '2px solid var(--accent, #3b82f6)' : undefined }}
                        onClick={() => toggleSet(selectedTerms, setSelectedTerms, f.value)}
                      >
                        <span className="ea-ngram-text">{f.value}</span>
                        <span className="ea-ngram-count">{f.count}×</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="ea-controls-row">
                <span className="ea-count-badge">{selectedTerms.size} wybranych wymagań</span>
                {entryPoint === 'wymagania' && (
                  <button className="ea-run-btn" onClick={runStanowiskaForWymagania} disabled={selectedTerms.size === 0}>
                    🔎 Pokaż pasujące stanowiska
                  </button>
                )}
                <button className="ea-run-btn" onClick={runEfekty} disabled={selectedTerms.size === 0 || efektyLoading}>
                  {efektyLoading ? '⏳' : '▶ Dopasuj efekty kierunkowe'}
                </button>
              </div>
              {matchedStanowiska.length > 0 && (
                <div className="sp-subsection">
                  <h4>Stanowiska pasujące do wybranych wymagań</h4>
                  <div className="ea-cluster-kierunki">
                    {matchedStanowiska.map(s => <span key={s.stanowisko} className="ea-kierunek-pill">{s.stanowisko} ({s.n_matches})</span>)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {matchedEfekty.length > 0 && (
          <div className="sp-section">
            <h3>{entryPoint === 'stanowiska' ? '4' : '3'}. Efekty kierunkowe dopasowane do wymagań</h3>
            <div className="ea-controls-row">
              <span className="ea-count-badge">{selectedEfekty.size} wybranych z {matchedEfekty.length}</span>
              <button className="ea-run-btn" onClick={runDiscoverKierunki} disabled={selectedEfekty.size === 0 || discoverLoading}>
                {discoverLoading ? '⏳' : '▶ Znajdź kierunki'}
              </button>
            </div>
            <div className="ea-select-list">
              {matchedEfekty.map(e => (
                <label key={e.id} className="ea-select-item">
                  <input type="checkbox" checked={selectedEfekty.has(e.id)} onChange={() => toggleSet(selectedEfekty, setSelectedEfekty, e.id)} />
                  <span className="ea-tag ea-tag-kod">{e.kod}</span>
                  <span className="ea-tag ea-tag-stopien">{e.kierunek}</span>
                  {e.category && <span className={`ea-tag ea-tag-cat-${e.category}`}>{CATEGORY_LABELS[e.category]}</span>}
                  {e.similarity !== undefined && <span className="ea-score-tag">{Math.round(e.similarity * 100)}%</span>}
                  <span className="ea-select-opis">{e.opis.slice(0, 140)}</span>
                </label>
              ))}
            </div>
            {efektyKierunkiSummary.length > 0 && (
              <div className="sp-subsection">
                <h4>Kierunki z podobnymi efektami (podgląd)</h4>
                <div className="ea-cluster-kierunki">
                  {efektyKierunkiSummary.map(([name, count]) => <span key={name} className="ea-kierunek-pill">{name} ({count})</span>)}
                </div>
              </div>
            )}
          </div>
        )}

        {matchedKierunki.length > 0 && (
          <div className="sp-section">
            <h3>{entryPoint === 'stanowiska' ? '5' : '4'}. Kierunki — wybierz, które planować</h3>
            <div className="ea-mode-toggle">
              <button onClick={() => setSelectedKierunki(new Set(matchedKierunki.map(k => k.kierunek)))}>✅ Zaznacz wszystkie ({matchedKierunki.length})</button>
              <button onClick={() => setSelectedKierunki(new Set())}>◻️ Odznacz wszystkie</button>
            </div>
            <div className="ea-select-list">
              {matchedKierunki.map(k => (
                <label key={k.kierunek} className="ea-select-item">
                  <input type="checkbox" checked={selectedKierunki.has(k.kierunek)} onChange={() => toggleSet(selectedKierunki, setSelectedKierunki, k.kierunek)} />
                  <span className="ea-select-opis">{k.kierunek}</span>
                  <span className="ea-score-tag">{k.n_matches} dopasowań</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {matchedKierunki.length > 0 && (
          <div className="sp-section">
            <h3>{entryPoint === 'stanowiska' ? '6' : '5'}. Zaplanuj studia</h3>
            <div className="ea-mode-toggle">
              <button className={poziom === 'LIC' ? 'active' : ''} onClick={() => setPoziom('LIC')}>LIC</button>
              <button className={poziom === 'MGR' ? 'active' : ''} onClick={() => setPoziom('MGR')}>MGR</button>
              <button className={poziom === 'MIXED' ? 'active' : ''} onClick={() => setPoziom('MIXED')}>MIXED</button>
              <button className={forma === 'STACJ' ? 'active' : ''} onClick={() => setForma('STACJ')}>Stacjonarne</button>
              <button className={forma === 'NIESTACJ' ? 'active' : ''} onClick={() => setForma('NIESTACJ')}>Niestacjonarne</button>
              <button className={forma === 'MIXED' ? 'active' : ''} onClick={() => setForma('MIXED')}>MIESZANE</button>
            </div>
            <div className="ea-param-grid">
              <label>Maks. godzin/semestr (opcjonalnie)
                <input type="number" min={1} placeholder="bez limitu" value={maxGodzinSemestr} onChange={e => setMaxGodzinSemestr(e.target.value === '' ? '' : +e.target.value)} />
              </label>
              <label>Min. ECTS/semestr (opcjonalnie)
                <input type="number" min={0} placeholder="bez limitu" value={minEctsSemestr} onChange={e => setMinEctsSemestr(e.target.value === '' ? '' : +e.target.value)} />
              </label>
              <button className="ea-run-btn sp-plan-btn" onClick={runPlan} disabled={planLoading || selectedKierunki.size === 0}>
                {planLoading ? '⏳ Planowanie…' : `🗺 Zaplanuj studia dla ${selectedKierunki.size} kierunków`}
              </button>
            </div>
          </div>
        )}

        {plan && (
          <div className="sp-results">
            <h3>Wynik: {plan.n_przedmioty} przedmiotów</h3>
            {plan.kierunki_unmatched.length > 0 && (
              <div className="ea-info-note">⚠️ Nie znaleziono odpowiednika dla: {plan.kierunki_unmatched.join(', ')}</div>
            )}
            {plan.constraint_violations.length > 0 && (
              <div className="ea-info-note">
                ⚠️ {plan.constraint_violations.length} semestr(y) naruszają ograniczenia:{' '}
                {plan.constraint_violations.map(v => (
                  <span key={v.semestr}>sem. {v.semestr} ({v.godziny} h, {v.ects} ECTS) </span>
                ))}
              </div>
            )}
            <div className="sp-subsection">
              <h4>Przedmioty</h4>
              <div className="ea-efekty-table">
                {plan.przedmioty.map(p => (
                  <div key={p.uuid} className="ea-efekt-row">
                    <div className="ea-efekt-tags">
                      <span className="ea-tag ea-tag-kod">{p.title}</span>
                      {p.rok && <span className="ea-tag ea-tag-stopien">rok {p.rok}, sem. {p.semestr}</span>}
                      {p.ects != null && <span className="ea-tag ea-tag-stopien">{p.ects} ECTS</span>}
                      <span className="ea-tag ea-tag-stopien">{p.total_godziny} h</span>
                    </div>
                    <div className="ea-cluster-kierunki">
                      {p.kierunki.map(k => <span key={k} className="ea-kierunek-pill">{k}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
