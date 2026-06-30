from fastapi import APIRouter, UploadFile, File
from typing import List
import pandas as pd
from io import BytesIO

router = APIRouter()

# Store loaded data in memory for now
_loaded_data = None

@router.get("/")
async def list_data_sources():
    return {
        "sources": [
            {"id": "demo", "name": "Demo Dataset (2021-2026)", "rows": 5000},
            {"id": "kaggle", "name": "Kaggle Job Market Data", "status": "available"},
            {"id": "pracuj", "name": "Pracuj.pl Historical Data", "status": "coming_soon"},
        ]
    }

@router.get("/demo")
async def load_demo_data():
    """Load sample dataset for demonstration"""
    from app.services.data_generator import generate_demo_data
    global _loaded_data
    _loaded_data = generate_demo_data()
    return {
        "status": "loaded",
        "rows": len(_loaded_data),
        "columns": list(_loaded_data.columns),
        "date_range": {
            "from": str(_loaded_data['date'].min()),
            "to": str(_loaded_data['date'].max())
        }
    }

@router.post("/upload")
async def upload_data(file: UploadFile = File(...)):
    """Upload CSV or Excel file with job market data"""
    global _loaded_data
    try:
        content = await file.read()
        if file.filename.endswith('.csv'):
            _loaded_data = pd.read_csv(BytesIO(content))
        elif file.filename.endswith(('.xlsx', '.xls')):
            _loaded_data = pd.read_excel(BytesIO(content))
        else:
            return {"error": "Unsupported file format"}

        return {
            "status": "uploaded",
            "filename": file.filename,
            "rows": len(_loaded_data),
            "columns": list(_loaded_data.columns)
        }
    except Exception as e:
        return {"error": str(e)}

@router.get("/current")
async def get_current_data(limit: int = 100):
    """Get currently loaded data"""
    global _loaded_data
    if _loaded_data is None:
        return {"error": "No data loaded"}
    return {
        "rows": _loaded_data.head(limit).to_dict('records'),
        "total": len(_loaded_data),
        "columns": list(_loaded_data.columns)
    }

@router.get("/summary")
async def get_data_summary():
    """Get summary statistics of loaded data"""
    global _loaded_data
    if _loaded_data is None:
        return {"error": "No data loaded"}

    return {
        "total_jobs": len(_loaded_data),
        "date_range": {
            "from": str(_loaded_data['date'].min()),
            "to": str(_loaded_data['date'].max())
        },
        "unique_positions": _loaded_data['position'].nunique() if 'position' in _loaded_data else 0,
        "unique_cities": _loaded_data['city'].nunique() if 'city' in _loaded_data else 0,
        "salary_stats": {
            "min": float(_loaded_data['salary_min'].min()) if 'salary_min' in _loaded_data else 0,
            "max": float(_loaded_data['salary_max'].max()) if 'salary_max' in _loaded_data else 0,
            "avg": float(_loaded_data['salary_min'].mean()) if 'salary_min' in _loaded_data else 0,
        }
    }
