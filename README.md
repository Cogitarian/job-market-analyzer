# 📊 Job Market Analyzer

AI-powered job market analysis and predictions with interactive dashboard, NLP analysis, and AI chat assistant.

## Features

- **📈 Interactive Dashboard** - Visualize job market trends (2021-2026)
  - Top skills and keywords
  - Salary analysis by position level
  - Geographic job market distribution
  - Job posting trends

- **🔮 AI-Powered Predictions** - Forecast market trends (2026-2031)
  - Job demand forecasting using Prophet + ARIMA
  - Salary trend predictions
  - Emerging skills identification
  - Market insights and recommendations

- **💬 AI Chat Assistant** - Discuss results with Claude
  - Ask questions about job market trends
  - Get career advice based on data
  - Explore salary expectations
  - Understand skill demand evolution

- **📊 NLP Analysis** - Understand job requirements
  - Extract technical skills from job descriptions
  - Identify skill trends and evolution
  - Detect emerging technologies

- **📁 Flexible Data Loading**
  - Load demo dataset (5,000+ job entries)
  - Upload your own CSV/Excel files
  - Live data sources (coming soon)

## Tech Stack

- **Backend**: Python 3.11 + FastAPI
  - NLP: spacy, transformers
  - ML: scikit-learn, statsmodels (Prophet)
  - LLM: Claude API (Anthropic)
  
- **Frontend**: React 18 + TypeScript
  - Visualization: Plotly
  - Styling: CSS Grid/Flexbox
  - State Management: Zustand

- **Infrastructure**: Docker + Docker Compose

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Python 3.11+ (for local development)
- Node.js 18+ (for local development)
- Anthropic API key (for chat features)

### Using Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/konrad/job-market-analyzer.git
cd job-market-analyzer

# Create .env file with your API key
echo "ANTHROPIC_API_KEY=your_key_here" > backend/.env

# Start services
docker-compose up

# App will be available at http://localhost:3000
```

### Local Development

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python app/main.py
# API available at http://localhost:8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
# App available at http://localhost:5173
```

## Usage

1. **Load Data**
   - Click "📥 Data Loader"
   - Choose between demo data or upload your CSV/Excel file
   - Review loaded data summary

2. **Explore Dashboard**
   - View key metrics and statistics
   - Analyze skill requirements and trends
   - Check salary analysis by position
   - See geographic distribution

3. **Check Predictions**
   - Review job demand forecasts (2026-2031)
   - Explore salary predictions by experience level
   - Learn about emerging skills
   - Read AI-generated market insights

4. **Chat with AI**
   - Ask questions about trends
   - Get personalized advice
   - Explore specific aspects of the market
   - Use suggested questions as starting points

## API Endpoints

### Data Management
- `GET /api/data/` - List available data sources
- `GET /api/data/demo` - Load demo dataset
- `POST /api/data/upload` - Upload file
- `GET /api/data/current` - Get loaded data
- `GET /api/data/summary` - Data summary stats

### Analysis
- `GET /api/analysis/keywords` - Top keywords
- `GET /api/analysis/skills` - Skill evolution
- `GET /api/analysis/salary-analysis` - Salary trends
- `GET /api/analysis/job-postings-trend` - Posting trends
- `GET /api/analysis/cities` - Geographic analysis

### Predictions
- `GET /api/predictions/demand-forecast` - Job demand forecast
- `GET /api/predictions/skills-forecast` - Skills prediction
- `GET /api/predictions/salary-forecast` - Salary forecast
- `GET /api/predictions/market-insights` - AI insights

### Chat
- `POST /api/chat/send` - Send message
- `GET /api/chat/history` - Get history
- `POST /api/chat/reset` - Clear history

## Data Sources

Currently supported:
- Demo dataset (5,000+ synthetic entries, 2021-2026)
- CSV/Excel file upload

Future sources:
- Pracuj.pl integration
- LinkedIn data (where available)
- GUS (Polish statistics) data
- Kaggle datasets

## Project Structure

```
job-market-analyzer/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── data.py
│   │   │   ├── analysis.py
│   │   │   ├── predictions.py
│   │   │   └── chat.py
│   │   ├── services/
│   │   │   ├── nlp_analyzer.py
│   │   │   ├── predictor.py
│   │   │   └── data_generator.py
│   │   └── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── DataLoader.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Predictions.tsx
│   │   │   └── Chat.tsx
│   │   ├── components/
│   │   │   ├── Header.tsx
│   │   │   └── Navigation.tsx
│   │   ├── App.tsx
│   │   └── index.css
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## Methodology

### Forecasting Models
- **Demand**: Prophet time series model + ARIMA for robustness
- **Salary**: Linear regression with seasonal adjustments
- **Skills**: NLP trend analysis with exponential smoothing

### Confidence Scoring
- Based on historical data consistency
- Model accuracy metrics
- Decreases over longer forecast periods

## Future Enhancements

- [ ] Real-time data integration from job boards
- [ ] Interactive trend comparison tools
- [ ] Export reports to PDF/XLSX
- [ ] More advanced ML models (neural networks)
- [ ] Multi-language support
- [ ] Personalized career recommendations
- [ ] Skill gap analysis tool
- [ ] Interview preparation based on trends

## Contributing

Feel free to fork, submit issues, and create pull requests!

## License

MIT License - see LICENSE file for details

## Contact

For questions or feedback, please open an issue on GitHub.

---

**Made with ❤️ for job seekers and career changers**

Last updated: 2026-06-30
