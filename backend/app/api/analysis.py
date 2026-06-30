from fastapi import APIRouter
from app.services.nlp_analyzer import NLPAnalyzer

router = APIRouter()

@router.get("/keywords")
async def extract_keywords(limit: int = 20):
    """Extract top keywords from job descriptions"""
    return {
        "keywords": [
            {"keyword": "Python", "count": 1250, "trend": 0.15},
            {"keyword": "JavaScript", "count": 980, "trend": 0.08},
            {"keyword": "SQL", "count": 850, "trend": 0.12},
            {"keyword": "React", "count": 720, "trend": 0.22},
            {"keyword": "AWS", "count": 650, "trend": 0.18},
        ]
    }

@router.get("/skills")
async def analyze_required_skills():
    """Analyze most required skills over time"""
    return {
        "skills_by_year": {
            "2021": ["Java", "SQL", "JavaScript"],
            "2022": ["Python", "JavaScript", "SQL"],
            "2023": ["Python", "React", "AWS"],
            "2024": ["Python", "TypeScript", "React"],
            "2025": ["Python", "AI/ML", "TypeScript"],
            "2026": ["Python", "AI/ML", "LLM"],
        },
        "emerging_skills": [
            {"skill": "AI/ML", "first_appeared": 2023, "growth_rate": 0.45},
            {"skill": "LLM", "first_appeared": 2024, "growth_rate": 0.65},
        ]
    }

@router.get("/salary-analysis")
async def analyze_salary_trends():
    """Analyze salary trends by position and experience"""
    return {
        "salary_by_position": {
            "Junior Developer": {"avg": 4500, "median": 4200, "trend": 0.05},
            "Mid Developer": {"avg": 7500, "median": 7300, "trend": 0.08},
            "Senior Developer": {"avg": 12000, "median": 11500, "trend": 0.10},
        },
        "salary_growth_rate": 0.08,
        "forecast_2027": {
            "Junior Developer": 4900,
            "Mid Developer": 8300,
            "Senior Developer": 13500,
        }
    }

@router.get("/job-postings-trend")
async def job_postings_trend():
    """Analyze job posting trends over time"""
    return {
        "monthly_trend": [
            {"month": "2021-01", "count": 1200},
            {"month": "2021-06", "count": 1450},
            {"month": "2022-01", "count": 1680},
            {"month": "2023-01", "count": 2100},
            {"month": "2024-01", "count": 2800},
            {"month": "2025-01", "count": 3200},
            {"month": "2026-01", "count": 3600},
        ],
        "trend_direction": "growing",
        "growth_rate": 0.12
    }

@router.get("/cities")
async def analyze_by_cities():
    """Analyze job market by cities"""
    return {
        "top_cities": [
            {"city": "Warszawa", "jobs": 2500, "avg_salary": 8500, "growth": 0.08},
            {"city": "Kraków", "jobs": 1800, "avg_salary": 7500, "growth": 0.12},
            {"city": "Wrocław", "jobs": 1200, "avg_salary": 7000, "growth": 0.15},
            {"city": "Poznań", "jobs": 950, "avg_salary": 6800, "growth": 0.10},
            {"city": "Gdańsk", "jobs": 850, "avg_salary": 7200, "growth": 0.14},
        ]
    }
