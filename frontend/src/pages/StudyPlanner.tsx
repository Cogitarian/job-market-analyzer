import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import './EfektyAnalysis.css'
import './StudyPlanner.css'

import { API_BASE as API } from '../config'

type Criterion = 'kierunkowe' | 'przedmiotowe' | 'tresci'
type Poziom = 'LIC' | 'MGR' | 'MIXED'
type Forma = 'STACJ' | 'NIESTACJ' | 'MIXED'
type Method = 'tfidf' | 'lsa' | 'lda' | 'cluster' | 'embeddings'

interface Item {
  id: string
  kod?: string
  kierunek: string
  kierunki_list?: string[]
  category?: string
  stopien?: string
  opis: string
  title?: string
  przedmiot?: string
}

interface KierunekMatch {
  kierunek: string
  n_matches: number
}

type ViewMode = 'lista' | 'drzewo' | 'struktura'

interface TreeNode {
  word: string
  count: number
  children: TreeNode[]
  n_items: number
  sample_ids: string[]
}

interface FacetOption { value: string; count: number }
interface StructureFacets {
  orzeczenie: FacetOption[]
  zakres: FacetOption[]
  umiejetnosc: FacetOption[]
  dziedzina: FacetOption[]
}

interface Przedmiot {
  uuid: string
  title: string
  kierunki: string[]
  semestr: number | null
  rok: number | null
  zajecia: { forma: string; godziny: number }[]
  total_godziny: number
  forma_zaliczenia: string
  ects: number | null
}

interface ConstraintViolation {
  semestr: number
  godziny: number
  ects: number
  przekroczone_godziny: boolean
  niewystarczajace_ects: boolean
}

interface Plan {
  przedmioty: Przedmiot[]
  n_przedmioty: number
  hours_by_rok: Record<string, number>
  hours_by_semester: Record<string, number>
  ects_by_semester: Record<string, number>
  assessments_by_semester: Record<string, { egzamin: number; zaliczenie: number }>
  kierunki_unmatched: string[]
  constraint_violations: ConstraintViolation[]
}

const CATEGORY_LABELS: Record<string, string> = { knowledge: 'Wiedza', skills: 'Umiejętności', competences: 'Kompetencje' }
const CRITERION_LABELS: Record<Criterion, string> = {
  kierunkowe: 'efekty kierunkowe', przedmiotowe: 'efekty przedmiotów', tresci: 'treści przedmiotów',
}

export default function StudyPlanner() {
  const [status, setStatus] = useState<{ available: boolean; message?: string; n_courses?: number } | null>(null)
  const [criterion, setCriterion] = useState<Criterion>('kierunkowe')
  const [poziom, setPoziom] = useState<Poziom>('MIXED')
  const [forma, setForma] = useState<Forma>('MIXED')
  const [method, setMethod] = useState<Method>('tfidf')
  const [topK, setTopK] = useState(100)
  const [nTopics, setNTopics] = useState(20)

  const [viewMode, setViewMode] = useState<ViewMode>('lista')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const addToSelected = (ids: string[]) => setSelected(prev => new Set([...prev, ...ids]))

  const [discovering, setDiscovering] = useState(false)
  const [discoverError, setDiscoverError] = useState('')
  const [matchedKierunki, setMatchedKierunki] = useState<KierunekMatch[]>([])
  const [selectedKierunki, setSelectedKierunki] = useState<Set<string>>(new Set())

  const [plan, setPlan] = useState<Plan | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState('')
  const [maxGodzinSemestr, setMaxGodzinSemestr] = useState<number | ''>('')
  const [minEctsSemestr, setMinEctsSemestr] = useState<number | ''>(30)

  useEffect(() => {
    axios.get(`${API}/api/university-corpus/status`).then(r => setStatus(r.data))
  }, [])

  useEffect(() => {
    setSelected(new Set())
    setItems([])
    setMatchedKierunki([])
    setSelectedKierunki(new Set())
    setPlan(null)
    setViewMode('lista')
  }, [criterion])

  // Kierunkowe efekty are few enough (~7500) to fetch in full and filter
  // client-side — filtered to the stopień implied by LIC/MGR/MIXED, since a
  // single BIP resolution frequently covers both stopnie at once.
  const stopienForPoziom = poziom === 'LIC' ? 'I' : poziom === 'MGR' ? 'II' : ''

  // All three criteria load their FULL corpus up front — no "search first"
  // requirement, since the whole point is browsing efekty/treści you don't
  // already know the wording of. Search is purely a client-side filter on
  // top of that, same as the "kierunkowe" list always worked.
  useEffect(() => {
    setItemsLoading(true)
    if (criterion === 'kierunkowe') {
      const params: any = {}
      if (stopienForPoziom) params.stopien = stopienForPoziom
      axios.get(`${API}/api/efekty-analysis/all`, { params })
        .then(r => setItems((r.data.efekty || []).map((e: any) => ({ ...e, title: e.kod }))))
        .finally(() => setItemsLoading(false))
    } else if (criterion === 'przedmiotowe') {
      axios.get(`${API}/api/university-corpus/outcomes/all`, { params: { limit: 200000 } })
        .then(r => setItems((r.data.efekty || []).map((e: any) => ({ ...e, title: `${e.przedmiot} — ${e.kod}` }))))
        .finally(() => setItemsLoading(false))
    } else {
      axios.get(`${API}/api/university-corpus/content/all`, { params: { limit: 20000 } })
        .then(r => setItems(r.data.courses || []))
        .finally(() => setItemsLoading(false))
    }
  }, [criterion, stopienForPoziom])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(it =>
      it.opis.toLowerCase().includes(q) || (it.kod || '').toLowerCase().includes(q) ||
      it.kierunek.toLowerCase().includes(q) || (it.przedmiot || '').toLowerCase().includes(q)
    )
  }, [items, search])

  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const selectAll = () => setSelected(new Set(filteredItems.map(i => i.id)))
  const selectNone = () => setSelected(new Set())
  const selectCategory = (cat: string) => setSelected(new Set(filteredItems.filter(i => i.category === cat).map(i => i.id)))

  const runDiscover = () => {
    if (selected.size === 0) return
    setDiscovering(true)
    setDiscoverError('')
    setPlan(null)
    axios.post(`${API}/api/university-corpus/discover-kierunki`, {
      criterion, selected_ids: Array.from(selected), method, top_k: topK, n_topics: nTopics,
    }).then(r => {
      const kierunki: KierunekMatch[] = r.data.kierunki || []
      setMatchedKierunki(kierunki)
      setSelectedKierunki(new Set(kierunki.map(k => k.kierunek)))
    }).catch(e => setDiscoverError(e.response?.data?.detail || 'Błąd wyszukiwania kierunków'))
      .finally(() => setDiscovering(false))
  }

  const toggleKierunek = (k: string) => setSelectedKierunki(prev => {
    const next = new Set(prev)
    next.has(k) ? next.delete(k) : next.add(k)
    return next
  })
  const selectAllKierunki = () => setSelectedKierunki(new Set(matchedKierunki.map(k => k.kierunek)))
  const selectNoneKierunki = () => setSelectedKierunki(new Set())

  const runPlan = () => {
    if (selectedKierunki.size === 0) return
    setPlanLoading(true)
    setPlanError('')
    axios.post(`${API}/api/university-corpus/plan`, {
      kierunki: Array.from(selectedKierunki), poziom, forma,
      max_godzin_semestr: maxGodzinSemestr === '' ? undefined : maxGodzinSemestr,
      min_ects_semestr: minEctsSemestr === '' ? undefined : minEctsSemestr,
    }).then(r => setPlan(r.data))
      .catch(e => setPlanError(e.response?.data?.detail || 'Błąd planowania'))
      .finally(() => setPlanLoading(false))
  }

  if (!status) return <div className="ea-page"><div className="ea-loading">Wczytywanie…</div></div>

  if (!status.available) {
    return (
      <div className="ea-page">
        <div className="ea-header">
          <h2>🗺 Zaplanuj swoje studia</h2>
        </div>
        <div className="ea-info-note">
          ⏳ {status.message || 'Baza sylabusów całego uniwersytetu jeszcze się buduje. Wróć później.'}
        </div>
      </div>
    )
  }

  return (
    <div className="ea-page">
      <div className="ea-header">
        <h2>🗺 Zaplanuj swoje studia</h2>
        <p className="ea-subtitle">
          Dwa etapy: (1) wybierz {CRITERION_LABELS[criterion]}, dopasuj metodą podobieństwa — dostaniesz listę
          KIERUNKÓW, które je oferują; (2) zaznacz kierunki, które Cię interesują — dostaniesz listę PRZEDMIOTÓW
          (z {status.n_courses?.toLocaleString('pl-PL')} przedmiotów całego uniwersytetu), które je realizują, z podziałem
          na rok, semestr, godziny i zaliczenia/egzaminy.
        </p>
      </div>

      <div className="ea-tab-content">
      <div className="sp-section">
        <h3>1. Kryterium doboru</h3>
        <div className="ea-mode-toggle">
          <button className={criterion === 'kierunkowe' ? 'active' : ''} onClick={() => setCriterion('kierunkowe')}>Efekty kierunkowe</button>
          <button className={criterion === 'przedmiotowe' ? 'active' : ''} onClick={() => setCriterion('przedmiotowe')}>Efekty przedmiotów</button>
          <button className={criterion === 'tresci' ? 'active' : ''} onClick={() => setCriterion('tresci')}>Treści przedmiotów</button>
        </div>
      </div>

      <div className="sp-section">
        <h3>2. Poziom i forma studiów</h3>
        <div className="ea-mode-toggle">
          <button className={poziom === 'LIC' ? 'active' : ''} onClick={() => setPoziom('LIC')}>LIC (I stopień)</button>
          <button className={poziom === 'MGR' ? 'active' : ''} onClick={() => setPoziom('MGR')}>MGR (II stopień)</button>
          <button className={poziom === 'MIXED' ? 'active' : ''} onClick={() => setPoziom('MIXED')}>MIXED (LIC & MGR)</button>
        </div>
        <div className="ea-mode-toggle">
          <button className={forma === 'STACJ' ? 'active' : ''} onClick={() => setForma('STACJ')}>Stacjonarne</button>
          <button className={forma === 'NIESTACJ' ? 'active' : ''} onClick={() => setForma('NIESTACJ')}>Niestacjonarne</button
          ><button className={forma === 'MIXED' ? 'active' : ''} onClick={() => setForma('MIXED')}>MIESZANE</button>
        </div>
        {criterion === 'kierunkowe' && (
          <p className="ea-tab-intro">
            Lista efektów poniżej jest już zawężona do trybu wybranego powyżej — LIC pokazuje tylko efekty I stopnia,
            MGR tylko II stopnia, MIXED oba naraz. STACJ/NIESTACJ dotyczy dopiero etapu 4 (dobór przedmiotów).
          </p>
        )}
      </div>

      <div className="sp-section">
        <h3>3. Wybierz {CRITERION_LABELS[criterion]}</h3>

        <div className="ea-mode-toggle">
          <button className={viewMode === 'lista' ? 'active' : ''} onClick={() => setViewMode('lista')}>📋 Lista</button>
          <button className={viewMode === 'drzewo' ? 'active' : ''} onClick={() => setViewMode('drzewo')}>🌳 Drzewo poziome</button>
          {criterion === 'kierunkowe' && (
            <button className={viewMode === 'struktura' ? 'active' : ''} onClick={() => setViewMode('struktura')}>🧩 Filtruj wg struktury</button>
          )}
          <span className="ea-count-badge">{selected.size} wybranych łącznie</span>
        </div>

        {viewMode === 'lista' && (
          <>
            <p className="ea-tab-intro">
              To pełny surowy korpus (przed jakąkolwiek klasyfikacją) — wyszukaj i zaznacz te, które Cię interesują.
              Klasyfikacja/podobieństwo (TF-IDF, LSA, LDA, klastrowanie, embeddingi) następuje dopiero w kroku 4, gdy
              klikniesz „Znajdź kierunki".
            </p>

            {itemsLoading && (
              <div className="ea-loading">
                ⏳ Wczytywanie {criterion === 'przedmiotowe' ? 'wszystkich ~87 000 efektów przedmiotów' : criterion === 'tresci' ? 'wszystkich ~10 700 treści' : 'efektów'}…
              </div>
            )}

            {!itemsLoading && (
              <div className="ea-controls-row">
                <input
                  className="ea-search-input"
                  placeholder={`Filtruj wśród ${items.length.toLocaleString('pl-PL')} pozycji (opcjonalnie)…`}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <span className="ea-count-badge">{filteredItems.length.toLocaleString('pl-PL')} widocznych</span>
              </div>
            )}

            {!itemsLoading && filteredItems.length > 0 && (
              <>
                <div className="ea-mode-toggle">
                  <button onClick={selectAll}>✅ Zaznacz widoczne ({filteredItems.length})</button>
                  <button onClick={selectNone}>◻️ Odznacz wszystkie</button>
                  {criterion !== 'tresci' && (
                    <>
                      <button onClick={() => selectCategory('knowledge')}>📚 Wszystkie W</button>
                      <button onClick={() => selectCategory('skills')}>🛠 Wszystkie U</button>
                      <button onClick={() => selectCategory('competences')}>🧠 Wszystkie K</button>
                    </>
                  )}
                </div>
                <div className="ea-select-list">
                  {filteredItems.slice(0, 300).map(it => (
                    <label key={it.id} className="ea-select-item">
                      <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggleSelect(it.id)} />
                      <span className="ea-tag ea-tag-kod">{it.title || it.kod}</span>
                      {it.stopien && <span className="ea-tag ea-tag-stopien">st. {it.stopien}</span>}
                      {it.kierunek && <span className="ea-tag ea-tag-stopien">{it.kierunek}</span>}
                      {it.category && <span className={`ea-tag ea-tag-cat-${it.category}`}>{CATEGORY_LABELS[it.category]}</span>}
                      <span className="ea-select-opis">{it.opis.slice(0, 160)}</span>
                    </label>
                  ))}
                </div>
                {filteredItems.length > 300 && (
                  <p className="ea-empty-note">Pokazano pierwsze 300 z {filteredItems.length.toLocaleString('pl-PL')} — zawęź wyszukiwanie, by zobaczyć resztę.</p>
                )}
              </>
            )}
          </>
        )}

        {viewMode === 'drzewo' && <PhraseTreeBrowser criterion={criterion} onAddSelection={addToSelected} />}
        {viewMode === 'struktura' && criterion === 'kierunkowe' && <StructureFilterBrowser onAddSelection={addToSelected} />}
      </div>

      <div className="sp-section">
        <h3>4. Metoda podobieństwa i wyszukanie kierunków</h3>
        <div className="ea-param-grid">
          <label>Metoda
            <select value={method} onChange={e => setMethod(e.target.value as Method)}>
              <option value="tfidf">TF-IDF + cosinus</option>
              <option value="lsa">LSA</option>
              <option value="lda">LDA</option>
              <option value="cluster">Klastrowanie</option>
              <option value="embeddings">Embeddingi transformerowe</option>
            </select>
          </label>
          {(method === 'lsa' || method === 'lda' || method === 'cluster') && (
            <label>Liczba tematów/klastrów
              <input type="number" min={2} max={50} value={nTopics} onChange={e => setNTopics(+e.target.value)} />
            </label>
          )}
          <label>Liczba dopasowań
            <input type="number" min={10} max={1000} value={topK} onChange={e => setTopK(+e.target.value)} />
          </label>
          <button className="ea-run-btn" onClick={runDiscover} disabled={discovering || selected.size === 0}>
            {discovering ? '⏳ (embeddingi mogą potrwać do minuty przy pierwszym użyciu)' : '🔎 Znajdź kierunki'}
          </button>
        </div>
        {discoverError && <div className="ea-info-note">{discoverError}</div>}
      </div>

      {matchedKierunki.length > 0 && (
        <div className="sp-section">
          <h3>5. Kierunki z podobnymi {CRITERION_LABELS[criterion]} — wybierz, które planować</h3>
          <div className="ea-mode-toggle">
            <button onClick={selectAllKierunki}>✅ Zaznacz wszystkie ({matchedKierunki.length})</button>
            <button onClick={selectNoneKierunki}>◻️ Odznacz wszystkie</button>
          </div>
          <div className="ea-select-list">
            {matchedKierunki.map(k => (
              <label key={k.kierunek} className="ea-select-item">
                <input type="checkbox" checked={selectedKierunki.has(k.kierunek)} onChange={() => toggleKierunek(k.kierunek)} />
                <span className="ea-select-opis">{k.kierunek}</span>
                <span className="ea-score-tag">{k.n_matches} dopasowań</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {matchedKierunki.length > 0 && (
        <div className="sp-section">
          <h3>6. Zaplanuj studia</h3>
          <p className="ea-tab-intro">
            Ograniczenia dotyczą planowania — nie odrzucają przedmiotów, tylko oznaczają, które semestry
            przekraczają maks. godzin lub nie osiągają min. ECTS w zagregowanym planie (standardowo pełny etat to
            30 ECTS/semestr — zostaw puste pole, by pominąć dane ograniczenie).
          </p>
          <div className="ea-param-grid">
            <label>Maks. godzin/semestr (opcjonalnie)
              <input
                type="number" min={1} placeholder="bez limitu" value={maxGodzinSemestr}
                onChange={e => setMaxGodzinSemestr(e.target.value === '' ? '' : +e.target.value)}
              />
            </label>
            <label>Min. ECTS/semestr (opcjonalnie)
              <input
                type="number" min={0} placeholder="bez limitu" value={minEctsSemestr}
                onChange={e => setMinEctsSemestr(e.target.value === '' ? '' : +e.target.value)}
              />
            </label>
          </div>
          <button className="ea-run-btn sp-plan-btn" onClick={runPlan} disabled={planLoading || selectedKierunki.size === 0}>
            {planLoading ? '⏳ Planowanie…' : `🗺 Zaplanuj studia dla ${selectedKierunki.size} kierunków`}
          </button>
          {planError && <div className="ea-info-note">{planError}</div>}
        </div>
      )}

      {plan && <PlanResults plan={plan} />}
      </div>
    </div>
  )
}

function PlanResults({ plan }: { plan: Plan }) {
  const rokEntries = Object.entries(plan.hours_by_rok)
  const semEntries = Object.entries(plan.assessments_by_semester)
  const maxHours = Math.max(...rokEntries.map(([, h]) => h), 1)

  return (
    <div className="sp-results">
      <h3>Wynik: {plan.n_przedmioty} przedmiotów</h3>

      {plan.kierunki_unmatched.length > 0 && (
        <div className="ea-info-note">
          ⚠️ Nie znaleziono w bazie sylabusów odpowiednika dla: {plan.kierunki_unmatched.join(', ')}
          {' '}(inna nazwa kierunku w rejestrze BIP niż w sylabusie, albo kierunek nie ma jeszcze zeskanowanych przedmiotów).
        </div>
      )}

      {rokEntries.length > 0 && (
        <div className="sp-subsection">
          <h4>Godziny na rok</h4>
          <div className="sp-bars">
            {rokEntries.map(([rok, hours]) => (
              <div key={rok} className="sp-bar-row">
                <span className="sp-bar-label">Rok {rok}</span>
                <div className="sp-bar-track">
                  <div className="sp-bar-fill" style={{ width: `${(hours / maxHours) * 100}%` }} />
                </div>
                <span className="sp-bar-value">{hours} h</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {plan.constraint_violations.length > 0 && (
        <div className="ea-info-note">
          ⚠️ {plan.constraint_violations.length} semestr(y) naruszają ograniczenia:{' '}
          {plan.constraint_violations.map(v => (
            <span key={v.semestr}>
              sem. {v.semestr} ({v.godziny} h, {v.ects} ECTS
              {v.przekroczone_godziny ? ' — za dużo godzin' : ''}
              {v.niewystarczajace_ects ? ' — za mało ECTS' : ''})
              {' '}
            </span>
          ))}
        </div>
      )}

      {semEntries.length > 0 && (
        <div className="sp-subsection">
          <h4>Zaliczenia, egzaminy, godziny i ECTS na semestr</h4>
          <table className="sp-table">
            <thead><tr><th>Semestr</th><th>Egzaminy</th><th>Zaliczenia</th><th>Godziny</th><th>ECTS</th></tr></thead>
            <tbody>
              {semEntries.map(([sem, a]) => {
                const violation = plan.constraint_violations.find(v => String(v.semestr) === sem)
                return (
                  <tr key={sem} className={violation ? 'sp-row-violation' : ''}>
                    <td>{sem}</td>
                    <td>{a.egzamin}</td>
                    <td>{a.zaliczenie}</td>
                    <td>{plan.hours_by_semester[sem] ?? '—'}</td>
                    <td>{plan.ects_by_semester[sem] ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
                {p.forma_zaliczenia && <span className="ea-tag ea-tag-stopien">{p.forma_zaliczenia}</span>}
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
  )
}

// ── Drzewo poziome: horizontal list-based drill-down (verb/opening-word by
// frequency -> click -> next-word list -> click -> ... until the phrase
// ends), as an alternative to browsing the flat list. Reuses the same
// lemmatized-phrase trie as "Drzewo czasownikowe" in Analiza porównawcza,
// generalized to whichever corpus the active criterion needs. ─────────────

const CATEGORY_ICONS: Record<string, string> = { knowledge: '📚', skills: '🛠', competences: '🧠' }

function PhraseTreeBrowser({ criterion, onAddSelection }: { criterion: Criterion; onAddSelection: (ids: string[]) => void }) {
  const hasCategories = criterion !== 'tresci'
  const [maxWords, setMaxWords] = useState(6)
  const [minFreq, setMinFreq] = useState(criterion === 'przedmiotowe' ? 20 : criterion === 'tresci' ? 8 : 5)
  const [maxBranches, setMaxBranches] = useState(8)
  const [maxDepth, setMaxDepth] = useState(5)
  const [category, setCategory] = useState<'knowledge' | 'skills' | 'competences'>('knowledge')
  const [trees, setTrees] = useState<Record<string, TreeNode[]>>({})
  const [loading, setLoading] = useState(false)
  const [path, setPath] = useState<TreeNode[]>([])
  const [resolving, setResolving] = useState(false)
  const [lastAdded, setLastAdded] = useState<number | null>(null)

  const run = () => {
    setLoading(true)
    setPath([])
    axios.post(`${API}/api/university-corpus/phrase-tree`, {
      criterion, max_words: maxWords, min_freq: minFreq, max_branches: maxBranches, max_depth: maxDepth,
    }).then(r => setTrees(r.data.trees || {})).finally(() => setLoading(false))
  }

  useEffect(() => { run() }, [criterion]) // eslint-disable-line

  const groupKey = hasCategories ? category : 'all'
  const currentNodes = path.length === 0 ? (trees[groupKey] || []) : path[path.length - 1].children

  const selectBranch = () => {
    if (path.length === 0) return
    setResolving(true)
    setLastAdded(null)
    axios.post(`${API}/api/university-corpus/phrase-tree/resolve`, {
      criterion, path: path.map(p => p.word), category: hasCategories ? groupKey : undefined, max_words: maxWords,
    }).then(r => {
      onAddSelection(r.data.ids || [])
      setLastAdded(r.data.count)
    }).finally(() => setResolving(false))
  }

  return (
    <div className="sp-tree-browser">
      <p className="ea-tab-intro">
        Najpierw lista czasowników/otwierających słów wg częstości — kliknij dowolny, by zobaczyć jakie wyrazy
        (dopełnienie) po nim następują, i tak dalej aż do końca frazy. W dowolnym momencie możesz zaznaczyć całą
        gałąź, dodając wszystkie pasujące pozycje do wyboru.
      </p>

      {hasCategories && (
        <div className="ea-mode-toggle">
          {(['knowledge', 'skills', 'competences'] as const).map(cat => (
            <button key={cat} className={category === cat ? 'active' : ''} onClick={() => { setCategory(cat); setPath([]) }}>
              {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      )}

      <div className="ea-param-grid">
        <label>Maks. długość frazy
          <input type="number" min={2} max={10} value={maxWords} onChange={e => setMaxWords(+e.target.value)} />
        </label>
        <label>Min. częstość gałęzi
          <input type="number" min={1} value={minFreq} onChange={e => setMinFreq(+e.target.value)} />
        </label>
        <label>Maks. gałęzi na węzeł
          <input type="number" min={2} max={20} value={maxBranches} onChange={e => setMaxBranches(+e.target.value)} />
        </label>
        <label>Maks. głębokość
          <input type="number" min={1} max={10} value={maxDepth} onChange={e => setMaxDepth(+e.target.value)} />
        </label>
        <button className="ea-run-btn" onClick={run} disabled={loading}>{loading ? '⏳' : '▶ Zbuduj drzewo'}</button>
      </div>

      {loading && (
        <div className="ea-loading">
          ⏳ Budowanie drzewa — pierwsze użycie tego kryterium lemmatyzuje cały korpus (może potrwać do kilkunastu
          minut dla dużych korpusów jak efekty przedmiotów), kolejne razy są natychmiastowe (wynik zapisywany na dysku).
        </div>
      )}

      {!loading && (
        <>
          <div className="sp-tree-breadcrumb">
            <button onClick={() => setPath([])} disabled={path.length === 0}>⌂ początek</button>
            {path.map((p, i) => (
              <span key={i}>
                {' → '}
                <button onClick={() => setPath(path.slice(0, i + 1))}>{p.word}</button>
              </span>
            ))}
            {path.length > 0 && (
              <button className="ea-run-btn" onClick={selectBranch} disabled={resolving}>
                {resolving ? '⏳' : `✅ Zaznacz tę gałąź (${path[path.length - 1].n_items} poz.)`}
              </button>
            )}
          </div>

          {lastAdded !== null && <div className="ea-info-note">Dodano {lastAdded} pozycji do wyboru.</div>}

          {currentNodes.length === 0 && (
            <div className="ea-empty-note">
              {path.length === 0 ? 'Brak gałęzi — obniż min. częstość.' : 'To już koniec frazy w tej gałęzi (albo obniż min. częstość, by zobaczyć dalsze rozgałęzienia).'}
            </div>
          )}

          <div className="sp-tree-list">
            {currentNodes.map((n, i) => (
              <button key={i} className="sp-tree-node" onClick={() => setPath([...path, n])}>
                <span className="sp-tree-word">{n.word}</span>
                <span className="sp-tree-count">{n.count}× · {n.n_items} poz.</span>
                {n.children.length > 0 && <span className="sp-tree-arrow">→</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Filtruj wg struktury: [orzeczenie] + [określenie zakresu]? +
// [umiejętność]? + [dziedzina] — every slot optional/skippable. Only wired
// up for "kierunkowe" efekty, since the decomposition (phrase_structure.py)
// is built around how that specific corpus stores text (verb injected from
// the category, not present in the raw description). ───────────────────────

function StructureFilterBrowser({ onAddSelection }: { onAddSelection: (ids: string[]) => void }) {
  const [facetsData, setFacetsData] = useState<StructureFacets | null>(null)
  const [category, setCategory] = useState('')
  const [orzeczenie, setOrzeczenie] = useState('')
  const [zakres, setZakres] = useState('')
  const [umiejetnosc, setUmiejetnosc] = useState('')
  const [dziedzina, setDziedzina] = useState<string[]>([])
  const [results, setResults] = useState<Item[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    axios.get(`${API}/api/efekty-analysis/structure-facets`).then(r => setFacetsData(r.data))
  }, [])

  const run = () => {
    setLoading(true)
    axios.post(`${API}/api/efekty-analysis/structure-filter`, {
      category: category || undefined, orzeczenie: orzeczenie || undefined, zakres: zakres || undefined,
      umiejetnosc: umiejetnosc || undefined, dziedzina: dziedzina.length ? dziedzina : undefined, limit: 300,
    }).then(r => { setResults(r.data.efekty || []); setTotal(r.data.total) })
      .finally(() => setLoading(false))
  }

  const toggleDziedzina = (v: string) => setDziedzina(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])

  if (!facetsData) return <div className="ea-loading">⏳</div>

  return (
    <div className="sp-structure-browser">
      <p className="ea-tab-intro">
        Każdy efekt kierunkowy da się w uproszczeniu rozłożyć na: <strong>[orzeczenie]</strong> + <strong>[określenie
        zakresu]</strong>? + <strong>[umiejętność]</strong>? + <strong>[dziedzina]</strong> — np. "potrafi" + "w
        pogłębionym stopniu" + "scharakteryzować" + "główne nurty przekładoznawstwa". Sprawdzone empirycznie na całym
        korpusie: umiejętności (U) mają czasownik-umiejętność w 99,97% przypadków, ale wiedza (W) i kompetencje (K)
        tylko w 10-14% — więc [umiejętność] realnie dotyczy głównie U. [Określenie zakresu] występuje tylko w 22%
        wszystkich efektów. Każde pole poniżej jest opcjonalne — zostaw „dowolne", by je pominąć.
      </p>

      <div className="ea-param-grid">
        <label>Kategoria
          <select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">dowolna</option>
            <option value="knowledge">Wiedza</option>
            <option value="skills">Umiejętności</option>
            <option value="competences">Kompetencje</option>
          </select>
        </label>
        <label>Orzeczenie (synonimy zgrupowane)
          <select value={orzeczenie} onChange={e => setOrzeczenie(e.target.value)}>
            <option value="">dowolne</option>
            {facetsData.orzeczenie.map(f => <option key={f.value} value={f.value}>{f.value} ({f.count})</option>)}
          </select>
        </label>
        <label>Określenie zakresu
          <select value={zakres} onChange={e => setZakres(e.target.value)}>
            <option value="">dowolne / brak</option>
            {facetsData.zakres.map(f => <option key={f.value} value={f.value}>{f.value} ({f.count})</option>)}
          </select>
        </label>
        <label>Umiejętność (czasownik)
          <select value={umiejetnosc} onChange={e => setUmiejetnosc(e.target.value)}>
            <option value="">dowolna / brak</option>
            {facetsData.umiejetnosc.map(f => <option key={f.value} value={f.value}>{f.value} ({f.count})</option>)}
          </select>
        </label>
        <button className="ea-run-btn" onClick={run} disabled={loading}>{loading ? '⏳' : '🔎 Filtruj'}</button>
      </div>

      <div className="sp-domain-block">
        <h4>Dziedzina — najciekawsze, wybierz dowolną liczbę (dopasowanie: którykolwiek z zaznaczonych)</h4>
        <div className="sp-domain-pills">
          {facetsData.dziedzina.slice(0, 100).map(f => (
            <button
              key={f.value}
              className={`sp-domain-pill ${dziedzina.includes(f.value) ? 'active' : ''}`}
              onClick={() => toggleDziedzina(f.value)}
            >
              {f.value} <span>{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {total !== null && (
        <div className="ea-controls-row">
          <span className="ea-count-badge">{total.toLocaleString('pl-PL')} pasujących efektów</span>
          <button className="ea-run-btn" onClick={() => onAddSelection(results.map(r => r.id))}>
            ✅ Dodaj {results.length < (total || 0) ? `pokazane (${results.length})` : 'wszystkie'} do wyboru
          </button>
        </div>
      )}

      {results.length > 0 && (
        <div className="ea-select-list">
          {results.map(r => (
            <div key={r.id} className="ea-select-item">
              <span className="ea-tag ea-tag-kod">{r.kod}</span>
              <span className="ea-tag ea-tag-stopien">{r.kierunek}</span>
              {r.category && <span className={`ea-tag ea-tag-cat-${r.category}`}>{CATEGORY_LABELS[r.category]}</span>}
              <span className="ea-select-opis">{r.opis.slice(0, 160)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
