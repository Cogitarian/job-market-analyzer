import { useState, useEffect } from 'react'
import axios from 'axios'
import './Dashboard.css'

export default function Dashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [summary, keywords, skills, salaries, trend, cities] = await Promise.all([
          axios.get('/api/data/summary'),
          axios.get('/api/analysis/keywords'),
          axios.get('/api/analysis/skills'),
          axios.get('/api/analysis/salary-analysis'),
          axios.get('/api/analysis/job-postings-trend'),
          axios.get('/api/analysis/cities'),
        ])

        setData({
          summary: summary.data,
          keywords: keywords.data,
          skills: skills.data,
          salaries: salaries.data,
          trend: trend.data,
          cities: cities.data,
        })
      } catch (error) {
        console.error('Failed to fetch dashboard data', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return <div className="loading">📊 Loading dashboard...</div>
  }

  return (
    <div className="dashboard">
      <h2>Job Market Overview (2021-2026)</h2>

      {/* Summary Statistics */}
      <div className="grid grid-3">
        <div className="stat-card">
          <div className="stat-label">Total Job Postings</div>
          <div className="stat-value">{data?.summary?.total_jobs?.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Unique Positions</div>
          <div className="stat-value">{data?.summary?.unique_positions || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Average Salary</div>
          <div className="stat-value">{data?.summary?.salary_stats?.avg?.toLocaleString()} PLN</div>
        </div>
      </div>

      {/* Top Keywords */}
      <div className="card">
        <h3>📌 Top Required Skills</h3>
        <div className="keywords-grid">
          {data?.keywords?.keywords?.slice(0, 10).map((item: any, idx: number) => (
            <div key={idx} className="keyword-item">
              <div className="keyword-name">{item.keyword}</div>
              <div className="keyword-count">{item.count.toLocaleString()}</div>
              <div className={`keyword-trend ${item.trend > 0 ? 'positive' : 'negative'}`}>
                {item.trend > 0 ? '📈' : '📉'} {Math.abs(item.trend * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Skills by Year */}
      <div className="card">
        <h3>📊 Skill Evolution</h3>
        <div className="skills-timeline">
          {Object.entries(data?.skills?.skills_by_year || {}).map(([year, skills]: any) => (
            <div key={year} className="year-skills">
              <div className="year">{year}</div>
              <div className="skills">
                {skills.map((skill: string, idx: number) => (
                  <span key={idx} className="skill-tag">{skill}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {data?.skills?.emerging_skills?.length > 0 && (
          <div className="emerging">
            <h4>🚀 Emerging Skills</h4>
            {data.skills.emerging_skills.map((skill: any, idx: number) => (
              <div key={idx} className="emerging-item">
                <strong>{skill.skill}</strong> (appeared in {skill.first_appeared})
                <span className="growth">{(skill.growth_rate * 100).toFixed(0)}% growth</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Salary Analysis */}
      <div className="card">
        <h3>💰 Salary Analysis</h3>
        <div className="salary-grid">
          {Object.entries(data?.salaries?.salary_by_position || {}).map(([position, stats]: any) => (
            <div key={position} className="salary-item">
              <div className="position-name">{position}</div>
              <div className="salary-values">
                <div>Avg: <strong>{stats.avg.toLocaleString()} PLN</strong></div>
                <div>Median: <strong>{stats.median.toLocaleString()} PLN</strong></div>
                <div className="trend">Trend: <span className="positive">+{(stats.trend * 100).toFixed(1)}%</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Cities */}
      <div className="card">
        <h3>🌍 Job Market by Cities</h3>
        <div className="cities-grid">
          {data?.cities?.top_cities?.map((city: any, idx: number) => (
            <div key={idx} className="city-card">
              <div className="city-rank">#{idx + 1}</div>
              <div className="city-name">{city.city}</div>
              <div className="city-stat">
                <span className="label">Jobs:</span>
                <span className="value">{city.jobs}</span>
              </div>
              <div className="city-stat">
                <span className="label">Avg Salary:</span>
                <span className="value">{city.avg_salary.toLocaleString()} PLN</span>
              </div>
              <div className="city-stat">
                <span className="label">Growth:</span>
                <span className="value positive">+{(city.growth * 100).toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Job Postings Trend */}
      <div className="card">
        <h3>📈 Job Postings Trend</h3>
        <div className="trend-info">
          <p>Overall trend: <strong>{data?.trend?.trend_direction}</strong></p>
          <p>Growth rate: <strong>+{(data?.trend?.growth_rate * 100).toFixed(1)}%</strong> per period</p>
        </div>
        <div className="timeline">
          {data?.trend?.monthly_trend?.map((point: any, idx: number) => (
            <div key={idx} className="timeline-item">
              <div className="month">{point.month}</div>
              <div className="bar" style={{ height: `${(point.count / 4000) * 100}px` }}></div>
              <div className="count">{point.count}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
