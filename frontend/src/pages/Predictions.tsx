import { useState, useEffect } from 'react'
import axios from 'axios'
import './Predictions.css'

export default function Predictions() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [demand, skills, salary, insights] = await Promise.all([
          axios.get('/api/predictions/demand-forecast'),
          axios.get('/api/predictions/skills-forecast'),
          axios.get('/api/predictions/salary-forecast'),
          axios.get('/api/predictions/market-insights'),
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
    return <div className="loading">🔮 Loading predictions...</div>
  }

  return (
    <div className="predictions">
      <h2>Job Market Predictions (2026-2031)</h2>

      {/* Key Insights */}
      <div className="card">
        <h3>💡 Key Insights</h3>
        <div className="insights-grid">
          {data?.insights?.key_insights?.map((insight: any, idx: number) => (
            <div key={idx} className={`insight-card impact-${insight.impact}`}>
              <div className="insight-title">{insight.title}</div>
              <div className="insight-description">{insight.description}</div>
              <div className="insight-confidence">
                Confidence: <strong>{(insight.confidence * 100).toFixed(0)}%</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Demand Forecast */}
      <div className="card">
        <h3>📊 Job Demand Forecast</h3>
        <div className="forecast-grid">
          {Object.entries(data?.demand?.forecast || {}).map(([year, forecast]: any) => (
            <div key={year} className="forecast-item">
              <div className="year">{year}</div>
              <div className="value">{forecast.total_positions.toLocaleString()}</div>
              <div className="positions">positions</div>
              <div className="confidence">
                {(forecast.confidence * 100).toFixed(0)}% confidence
              </div>
            </div>
          ))}
        </div>
        <div className="forecast-info">
          <p>Average growth rate: <strong>{(data?.demand?.growth_rate * 100).toFixed(1)}%</strong> per year</p>
          <p>Method: {data?.demand?.method}</p>
        </div>
      </div>

      {/* Salary Forecast */}
      <div className="card">
        <h3>💰 Salary Forecast by Experience Level</h3>
        <div className="salary-forecast-grid">
          {Object.entries(data?.salary?.salary_forecast || {}).map(([level, forecast]: any) => (
            <div key={level} className="salary-level">
              <div className="level-name">{level} Level</div>
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
          <p>Average growth rate: <strong>{(data?.salary?.average_growth_rate * 100).toFixed(1)}%</strong> per year</p>
        </div>
      </div>

      {/* Skills Forecast */}
      <div className="card">
        <h3>🚀 Skills Demand Forecast</h3>

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
        <h3>📋 Methodology</h3>
        <ul>
          <li><strong>Demand Forecast:</strong> Prophet + ARIMA hybrid model trained on historical job posting volumes</li>
          <li><strong>Salary Predictions:</strong> Linear regression with seasonal adjustments</li>
          <li><strong>Skills Forecast:</strong> NLP analysis of job descriptions with trend extrapolation</li>
          <li><strong>Confidence Scores:</strong> Based on data consistency and model accuracy on historical data</li>
        </ul>
      </div>
    </div>
  )
}
