import { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE } from '../config'
import './Predictions.css'

export default function Predictions() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [demand, skills, salary, insights] = await Promise.all([
          axios.get(`${API_BASE}/api/predictions/demand-forecast`),
          axios.get(`${API_BASE}/api/predictions/skills-forecast`),
          axios.get(`${API_BASE}/api/predictions/salary-forecast`),
          axios.get(`${API_BASE}/api/predictions/market-insights`),
        ])

        setData({
          demand: demand.data,
          skills: skills.data,
          salary: salary.data,
          insights: insights.data,
        })
      } catch (error) {
        console.error('Failed to fetch predictions', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return <div className="loading">🔮 Wczytywanie prognoz...</div>
  }

  return (
    <div className="predictions">
      <h2>Prognozy rynku pracy (2026-2031)</h2>

      {/* Key Insights */}
      <div className="card">
        <h3>💡 Kluczowe wnioski</h3>
        <div className="insights-grid">
          {data?.insights?.key_insights?.map((insight: any, idx: number) => (
            <div key={idx} className={`insight-card impact-${insight.impact}`}>
              <div className="insight-title">{insight.title}</div>
              <div className="insight-description">{insight.description}</div>
              <div className="insight-confidence">
                Pewność: <strong>{(insight.confidence * 100).toFixed(0)}%</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Demand Forecast */}
      <div className="card">
        <h3>📊 Prognoza zapotrzebowania na pracowników</h3>
        <div className="forecast-grid">
          {Object.entries(data?.demand?.forecast || {}).map(([year, forecast]: any) => (
            <div key={year} className="forecast-item">
              <div className="year">{year}</div>
              <div className="value">{forecast.total_positions.toLocaleString()}</div>
              <div className="positions">stanowisk</div>
              <div className="confidence">
                pewność {(forecast.confidence * 100).toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
        <div className="forecast-info">
          <p>Średnie tempo wzrostu: <strong>{(data?.demand?.growth_rate * 100).toFixed(1)}%</strong> rocznie</p>
          <p>Metoda: {data?.demand?.method}</p>
        </div>
      </div>

      {/* Salary Forecast */}
      <div className="card">
        <h3>💰 Prognoza wynagrodzeń według poziomu doświadczenia</h3>
        <div className="salary-forecast-grid">
          {Object.entries(data?.salary?.salary_forecast || {}).map(([level, forecast]: any) => (
            <div key={level} className="salary-level">
              <div className="level-name">Poziom {level}</div>
              <div className="salary-timeline">
                {Object.entries(forecast as Record<string, number>).map(([year, salary]: any) => (
                  <div key={year} className="salary-year">
                    <div className="year">{year}</div>
                    <div className="salary-bar">
                      <div className="bar" style={{
                        width: `${(salary / 20000) * 100}%`,
                        minWidth: '100%'
                      }}></div>
                    </div>
                    <div className="salary-value">{(salary).toLocaleString()} PLN</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="salary-info">
          <p>Średnie tempo wzrostu: <strong>{(data?.salary?.average_growth_rate * 100).toFixed(1)}%</strong> rocznie</p>
        </div>
      </div>

      {/* Skills Forecast */}
      <div className="card">
        <h3>🚀 Prognoza zapotrzebowania na umiejętności</h3>

        {Object.entries(data?.skills?.skill_forecast || {}).map(([period, skills]: any) => (
          <div key={period} className="skills-forecast-period">
            <h4>{period}</h4>
            <div className="skills-list">
              {(skills as any[]).map((skill: any, idx: number) => (
                <div key={idx} className="skill-forecast-item">
                  <div className="rank">#{skill.rank || (idx + 1)}</div>
                  <div className="skill-name">{skill.skill}</div>
                  <div className="probability">
                    <div className="prob-bar">
                      <div className="prob-fill" style={{
                        width: `${(skill.probability || 0) * 100}%`,
                      }}></div>
                    </div>
                    <span>{((skill.probability || 0) * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Methodology */}
      <div className="card info-box">
        <h3>📋 Metodologia</h3>
        <ul>
          <li><strong>Prognoza zapotrzebowania:</strong> model hybrydowy Prophet + ARIMA trenowany na historycznych danych o liczbie ofert pracy</li>
          <li><strong>Prognozy wynagrodzeń:</strong> regresja liniowa z korektą sezonową</li>
          <li><strong>Prognoza umiejętności:</strong> analiza NLP opisów stanowisk z ekstrapolacją trendu</li>
          <li><strong>Wskaźniki pewności:</strong> oparte na spójności danych i dokładności modelu na danych historycznych</li>
        </ul>
      </div>
    </div>
  )
}
