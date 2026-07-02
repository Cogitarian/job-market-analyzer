#!/bin/bash
set -e

echo "=== Job Market Analyzer ==="

# Backend
if [ ! -d "backend/venv" ]; then
  echo "Tworzę virtualenv..."
  python3 -m venv backend/venv
fi
echo "Instaluję zależności backendu..."
backend/venv/bin/pip install -q fastapi uvicorn python-multipart pydantic pandas numpy anthropic pdfplumber

echo "Startuję backend (port 8000)..."
(cd backend && ../venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000) &

# Frontend
if [ ! -d "frontend/node_modules" ]; then
  echo "Instaluję zależności frontendu..."
  npm install --prefix frontend
fi

echo "Startuję frontend (port 3000)..."
npm run dev --prefix frontend &

wait -n
echo "Serwery zatrzymane."
