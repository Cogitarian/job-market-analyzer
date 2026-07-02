from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

app = FastAPI(
    title="Job Market Analyzer",
    description="AI-powered job market analysis with NLP, predictions, and chat",
    version="1.0.0"
)

# CORS — always allow local dev; add production frontend origin(s) via
# ALLOWED_ORIGINS env var (comma-separated) once deployed, e.g.
# "https://job-market-analyzer.pages.dev".
_extra_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", *_extra_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
from app.api import data, analysis, predictions, chat, outcomes, kierunkowe_efekty, efekty_analysis, university_corpus, job_market

app.include_router(data.router, prefix="/api/data", tags=["data"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["analysis"])
app.include_router(predictions.router, prefix="/api/predictions", tags=["predictions"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(outcomes.router, prefix="/api/outcomes", tags=["outcomes"])
app.include_router(kierunkowe_efekty.router, prefix="/api/kierunkowe-efekty", tags=["kierunkowe-efekty"])
app.include_router(efekty_analysis.router, prefix="/api/efekty-analysis", tags=["efekty-analysis"])
app.include_router(university_corpus.router, prefix="/api/university-corpus", tags=["university-corpus"])
app.include_router(job_market.router, prefix="/api/job-market", tags=["job-market"])

@app.get("/")
async def root():
    return {"message": "Job Market Analyzer API", "version": "1.0.0"}

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
