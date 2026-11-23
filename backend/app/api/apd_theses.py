from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Any

from app.services.thesis_text_classification import METHODS, classify

router = APIRouter()

class ClassifyRequest(BaseModel):
    records: list[dict[str, Any]] = Field(min_length=1)
    method: str
    labels: list[Any] | None = None
    label_names: list[str] | None = None

@router.get("/methods")
async def methods():
    return {"methods": list(METHODS), "note": "Supervised approaches require gold labels; optional models/providers need separate installation and configuration."}

@router.post("/classify")
async def classify_theses(req: ClassifyRequest):
    try:
        result = classify(req.records, req.method, req.labels, label_names=req.label_names)
        result.pop("model", None)
        return result
    except (ValueError, ImportError, NotImplementedError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
