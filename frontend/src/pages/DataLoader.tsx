import { useState } from 'react'
import axios from 'axios'
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
    setMessage('Loading demo data...')
    try {
      const response = await axios.get('/api/data/demo')
      setDataInfo(response.data)
      setMessage('✅ Demo data loaded successfully!')
      setTimeout(() => onDataLoaded(), 500)
    } catch (error) {
      setMessage('❌ Failed to load demo data')
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setMessage(`Uploading ${file.name}...`)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await axios.post('/api/data/upload', formData)
      setDataInfo(response.data)
      setMessage('✅ File uploaded successfully!')
      setTimeout(() => onDataLoaded(), 500)
    } catch (error) {
      setMessage('❌ Failed to upload file')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="data-loader">
      <div className="loader-card">
        <h2>Load Job Market Data</h2>
        <p className="description">Choose a data source to analyze the job market (2021-2026)</p>

        <div className="options">
          <div className="option-group">
            <h3>📊 Demo Dataset</h3>
            <p>Generated realistic job market data for 2021-2026 with 5,000+ entries</p>
            <button
              onClick={loadDemoData}
              disabled={loading}
              className="primary"
            >
              {loading ? 'Loading...' : 'Load Demo Data'}
            </button>
          </div>

          <div className="divider">OR</div>

          <div className="option-group">
            <h3>📁 Upload Your Data</h3>
            <p>Upload CSV or Excel file with job market data</p>
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
            <h3>📈 Loaded Data Info</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="label">Total Rows:</span>
                <span className="value">{dataInfo.rows}</span>
              </div>
              <div className="info-item">
                <span className="label">Date Range:</span>
                <span className="value">{dataInfo.date_range?.from} to {dataInfo.date_range?.to}</span>
              </div>
              <div className="info-item">
                <span className="label">Columns:</span>
                <span className="value">{dataInfo.columns?.length}</span>
              </div>
            </div>
          </div>
        )}

        <div className="info-box">
          <h4>What will you get?</h4>
          <ul>
            <li>📊 Interactive charts & statistics</li>
            <li>🔮 AI-powered predictions (2026-2031)</li>
            <li>💬 Chat to discuss insights with AI</li>
            <li>📉 Salary trends & skill demands</li>
            <li>🌍 Geographic analysis</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
