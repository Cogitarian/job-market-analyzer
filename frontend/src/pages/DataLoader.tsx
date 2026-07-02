import { useState } from 'react'
import axios from 'axios'
import { API_BASE } from '../config'
import './DataLoader.css'

interface DataLoaderProps {
  onDataLoaded: () => void
}

export default function DataLoader({ onDataLoaded }: DataLoaderProps) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [dataInfo, setDataInfo] = useState<any>(null)

  const loadDemoData = async () => {
    setLoading(true)
    setMessage('Wczytywanie danych demo...')
    try {
      const response = await axios.get(`${API_BASE}/api/data/demo`)
      setDataInfo(response.data)
      setMessage('✅ Dane demo wczytane pomyślnie!')
      setTimeout(() => onDataLoaded(), 500)
    } catch (error) {
      setMessage('❌ Nie udało się wczytać danych demo')
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setMessage(`Przesyłanie pliku ${file.name}...`)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await axios.post(`${API_BASE}/api/data/upload`, formData)
      setDataInfo(response.data)
      setMessage('✅ Plik przesłany pomyślnie!')
      setTimeout(() => onDataLoaded(), 500)
    } catch (error) {
      setMessage('❌ Nie udało się przesłać pliku')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="data-loader">
      <div className="loader-card">
        <h2>Wczytaj dane o rynku pracy</h2>
        <p className="description">Wybierz źródło danych do analizy rynku pracy (2021-2026)</p>

        <div className="options">
          <div className="option-group">
            <h3>📊 Zbiór danych demo</h3>
            <p>Wygenerowane realistyczne dane rynku pracy z lat 2021-2026, ponad 5000 wpisów</p>
            <button
              onClick={loadDemoData}
              disabled={loading}
              className="primary"
            >
              {loading ? 'Wczytywanie...' : 'Wczytaj dane demo'}
            </button>
          </div>

          <div className="divider">LUB</div>

          <div className="option-group">
            <h3>📁 Prześlij własne dane</h3>
            <p>Prześlij plik CSV lub Excel z danymi o rynku pracy</p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              disabled={loading}
              className="file-input"
            />
          </div>
        </div>

        {message && (
          <div className={`message ${message.includes('✅') ? 'success' : message.includes('❌') ? 'error' : ''}`}>
            {message}
          </div>
        )}

        {dataInfo && (
          <div className="data-info card">
            <h3>📈 Informacje o wczytanych danych</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="label">Liczba wierszy:</span>
                <span className="value">{dataInfo.rows}</span>
              </div>
              <div className="info-item">
                <span className="label">Zakres dat:</span>
                <span className="value">{dataInfo.date_range?.from} – {dataInfo.date_range?.to}</span>
              </div>
              <div className="info-item">
                <span className="label">Liczba kolumn:</span>
                <span className="value">{dataInfo.columns?.length}</span>
              </div>
            </div>
          </div>
        )}

        <div className="info-box">
          <h4>Co otrzymasz?</h4>
          <ul>
            <li>📊 Interaktywne wykresy i statystyki</li>
            <li>🔮 Prognozy oparte na AI (2026-2031)</li>
            <li>💬 Czat do omawiania wyników z AI</li>
            <li>📉 Trendy zarobków i zapotrzebowanie na umiejętności</li>
            <li>🌍 Analiza geograficzna</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
