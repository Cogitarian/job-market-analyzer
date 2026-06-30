from fastapi import APIRouter
from pydantic import BaseModel
from typing import List
import os
from anthropic import Anthropic

router = APIRouter()

client = Anthropic()
conversation_history = []

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str

@router.post("/send")
async def send_message(request: ChatRequest):
    """Send message to Claude and get analysis"""
    global conversation_history

    conversation_history.append({
        "role": "user",
        "content": request.message
    })

    system_prompt = """You are an expert job market analyst with deep knowledge of technology careers,
    salary trends, and future predictions. You're analyzing job market data from 2021-2026 and making
    predictions for 2026-2031. You have access to real job market analytics including skill requirements,
    salary trends, job posting volume, and geographic data. Provide insightful, data-driven analysis
    and discuss the results with the user in a conversational but professional manner. Reference specific
    data points and trends when available."""

    try:
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            system=system_prompt,
            messages=conversation_history
        )

        assistant_message = response.content[0].text
        conversation_history.append({
            "role": "assistant",
            "content": assistant_message
        })

        return {
            "message": assistant_message,
            "conversation_length": len(conversation_history)
        }
    except Exception as e:
        return {"error": str(e)}

@router.get("/history")
async def get_chat_history():
    """Get chat conversation history"""
    return {"messages": conversation_history}

@router.post("/reset")
async def reset_chat():
    """Reset chat history"""
    global conversation_history
    conversation_history = []
    return {"status": "cleared"}

@router.post("/analyze-data")
async def analyze_data_request(request: ChatRequest):
    """Request AI analysis of currently loaded data"""
    return await send_message(request)
