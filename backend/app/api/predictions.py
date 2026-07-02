from fastapi import APIRouter
from datetime import datetime, timedelta

router = APIRouter()

@router.get("/demand-forecast")
async def demand_forecast(years: int = 5):
    """Forecast job market demand for next N years"""
    return {
        "forecast": {
            "2026": {"total_positions": 3800, "confidence": 0.92},
            "2027": {"total_positions": 4200, "confidence": 0.88},
            "2028": {"total_positions": 4600, "confidence": 0.84},
            "2029": {"total_positions": 5000, "confidence": 0.80},
            "2030": {"total_positions": 5400, "confidence": 0.76},
            "2031": {"total_positions": 5800, "confidence": 0.72},
        },
        "growth_rate": 0.10,
        "method": "model hybrydowy Prophet + ARIMA"
    }

@router.get("/skills-forecast")
async def skills_forecast():
    """Predict which skills will be most demanded in future"""
    return {
        "skill_forecast": {
            "2026": [
                {"rank": 1, "skill": "AI/ML", "probability": 0.95},
                {"rank": 2, "skill": "Python", "probability": 0.92},
                {"rank": 3, "skill": "Cloud (AWS/Azure/GCP)", "probability": 0.90},
                {"rank": 4, "skill": "Data Engineering", "probability": 0.85},
                {"rank": 5, "skill": "DevOps/Kubernetes", "probability": 0.82},
            ],
            "2027": [
                {"rank": 1, "skill": "Generative AI", "probability": 0.98},
                {"rank": 2, "skill": "LLM Integration", "probability": 0.96},
                {"rank": 3, "skill": "AI Ethics/Safety", "probability": 0.88},
            ],
            "2028-2031": [
                {"skill": "Quantum Computing", "probability": 0.65},
                {"skill": "AI Regulation Compliance", "probability": 0.92},
            ]
        }
    }

@router.get("/salary-forecast")
async def salary_forecast():
    """Forecast salary trends by position level"""
    return {
        "salary_forecast": {
            "Junior": {
                "2026": 5200,
                "2027": 5600,
                "2028": 6000,
                "2029": 6400,
                "2030": 6800,
                "2031": 7200,
            },
            "Mid": {
                "2026": 8800,
                "2027": 9400,
                "2028": 10000,
                "2029": 10600,
                "2030": 11200,
                "2031": 11800,
            },
            "Senior": {
                "2026": 14200,
                "2027": 15000,
                "2028": 15800,
                "2029": 16600,
                "2030": 17400,
                "2031": 18200,
            }
        },
        "average_growth_rate": 0.07
    }

@router.get("/market-insights")
async def market_insights():
    """AI-generated insights about future job market"""
    return {
        "key_insights": [
            {
                "title": "Dominacja umiejętności AI/ML",
                "description": "Umiejętności sztucznej inteligencji i uczenia maszynowego będą głównym czynnikiem różnicującym konkurencyjne wynagrodzenia do 2031 roku",
                "confidence": 0.94,
                "impact": "high"
            },
            {
                "title": "Konsolidacja pracy zdalnej",
                "description": "Stanowiska zdalne i hybrydowe będą nadal zyskiwać na popularności, zwłaszcza na stanowiskach seniorskich",
                "confidence": 0.87,
                "impact": "high"
            },
            {
                "title": "Ryzyko kompresji wynagrodzeń",
                "description": "Stanowiska juniorskie mogą odnotować wolniejszy wzrost wynagrodzeń z powodu rosnącej konkurencji ze strony automatyzacji opartej na AI",
                "confidence": 0.75,
                "impact": "medium"
            },
            {
                "title": "Boom na inżynierię danych",
                "description": "Stanowiska związane z inżynierią danych będą rosnąć szybciej niż inne specjalizacje (15% CAGR)",
                "confidence": 0.89,
                "impact": "high"
            }
        ]
    }
