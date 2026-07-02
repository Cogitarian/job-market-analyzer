from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import os
import requests

router = APIRouter()

# Server-side OpenAI-compatible providers, tried in order until one is configured.
# PCSS HPC LLM gateway (https://llm.hpc.psnc.pl) has a tight per-key quota;
# Groq (https://console.groq.com, free, no card) is a higher-limit fallback —
# both speak the same /chat/completions shape so one code path covers both.
_PROVIDERS = [
    {
        "name": "pcss",
        "base_url": os.environ.get("PCSS_LLM_BASE_URL", "https://llm.hpc.psnc.pl/api/chat/completions"),
        "api_key": os.environ.get("PCSS_LLM_API_KEY", ""),
        "model": os.environ.get("PCSS_LLM_MODEL", "Bielik-11B-v2.3-Instruct"),
    },
    {
        "name": "groq",
        "base_url": os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1/chat/completions"),
        "api_key": os.environ.get("GROQ_API_KEY", ""),
        "model": os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile"),
    },
]

# Per-session history stored by client (key = session_id)
_sessions: dict[str, list] = {}

SYSTEM_PROMPT = """Jesteś ekspertem od polskiego rynku pracy w sektorze IT.
Analizujesz dane z lat 2021-2026 i tworzysz prognozy na 2026-2031.
Masz dostęp do danych o:
- Trendach ofert pracy i wynagrodzeniach (Warszawa, Kraków, Wrocław, Poznań, Gdańsk)
- Wymaganych umiejętnościach (Python, JavaScript, SQL, React, AWS, AI/ML, LLM)
- Dynamice rynku: wzrost ~12% r/r, boom AI/ML od 2023
- Prognozach: 3800 ofert/miesiąc w 2026, 5800 w 2031
- Pensjach: Junior 4-6k PLN, Mid 6-10k PLN, Senior 10-18k PLN (B2B wyżej)

Odpowiadaj rzeczowo, po polsku lub angielsku (zależnie od języka pytania).
Powołuj się na konkretne dane. Bądź zwięzły."""


def demo_response(message: str) -> str:
    """Rule-based smart responses when no API key is configured."""
    msg = message.lower()

    if any(w in msg for w in ["python", "javascript", "skill", "umiejętność", "technolog", "język"]):
        return (
            "**Najbardziej poszukiwane technologie (2024-2025):**\n\n"
            "1. **Python** – lider od 2022, obowiązkowy dla AI/ML/Data\n"
            "2. **TypeScript** – wypiera vanilla JS, wzrost +22% r/r\n"
            "3. **SQL** – stabilnie wymagany w 80% ofert analitycznych\n"
            "4. **React** – dominant frontend, ale rośnie zagrożenie ze strony Next.js\n"
            "5. **AWS/Cloud** – wymagany w 65% ofert senior\n\n"
            "**Wschodzące (2025-2026):** AI/ML (+45% r/r), LLM integration (+65%), "
            "Kubernetes (+18%). Znajomość LLM API (Anthropic, OpenAI) staje się "
            "standardem dla senior devów.\n\n"
            "*To odpowiedź w trybie demo. Podaj klucz API by rozmawiać z prawdziwym modelem.*"
        )

    if any(w in msg for w in ["salary", "zarobki", "pensja", "wynagrodzenie", "ile"]):
        return (
            "**Widełki płacowe – rynek IT w Polsce (2025, brutto/netto B2B):**\n\n"
            "| Poziom | UoP (brutto) | B2B (netto) |\n"
            "|--------|-------------|-------------|\n"
            "| Junior | 4 000–6 000 PLN | 5 500–8 000 PLN |\n"
            "| Mid | 7 000–11 000 PLN | 9 000–14 000 PLN |\n"
            "| Senior | 12 000–18 000 PLN | 16 000–24 000 PLN |\n\n"
            "**Warszawa płaci ~15% więcej** niż mediana krajowa. Wzrost r/r: ~8%.\n\n"
            "**Prognoza 2027:** Junior +12%, Mid +15%, Senior +18% względem 2025 "
            "(napędzane niedoborem specjalistów AI/ML).\n\n"
            "*Tryb demo – podaj klucz API po lewej, by uzyskać pełną analizę.*"
        )

    if any(w in msg for w in ["city", "miasto", "warszawa", "kraków", "wrocław", "gdańsk"]):
        return (
            "**Rynek pracy IT według miast (2025):**\n\n"
            "🥇 **Warszawa** – 2500 ofert/mies., avg 8 500 PLN, wzrost +8% r/r\n"
            "🥈 **Kraków** – 1800 ofert/mies., avg 7 500 PLN, wzrost +12% r/r ⭐ najszybszy\n"
            "🥉 **Wrocław** – 1200 ofert/mies., avg 7 000 PLN, wzrost +15% r/r\n"
            "4️⃣ **Poznań** – 950 ofert/mies., avg 6 800 PLN\n"
            "5️⃣ **Gdańsk** – 850 ofert/mies., avg 7 200 PLN\n\n"
            "**Trend:** Wrocław i Kraków rosną szybciej niż Warszawa – tańsze biura "
            "przyciągają centra R&D. Remote work spłaszcza różnice między miastami.\n\n"
            "*Tryb demo.*"
        )

    if any(w in msg for w in ["predict", "prognoza", "forecast", "przyszłość", "2027", "2028", "2030", "2031"]):
        return (
            "**Prognoza rynku pracy IT 2026-2031:**\n\n"
            "📈 **Popyt na pracowników:**\n"
            "- 2026: ~3 800 nowych ofert/miesiąc (+12%)\n"
            "- 2028: ~4 600 (+21%)\n"
            "- 2031: ~5 800 (+53% vs 2025)\n\n"
            "🤖 **Kluczowe kierunki:**\n"
            "- AI/ML Engineer: brakuje 40 000 specjalistów w PL (2025), deficyt rośnie\n"
            "- Data Engineering: CAGR 15% do 2031\n"
            "- \"Klasyczne\" programowanie (CRUD apps): automatyzacja przez AI ograniczy "
            "wzrost o ~20%\n\n"
            "⚠️ **Ryzyko:** Junior devs bez AI skills będą mieć trudniej. "
            "Senior + AI = premum 30-50% względem seniorów bez AI.\n\n"
            "*Tryb demo – te dane są wbudowane w aplikację.*"
        )

    if any(w in msg for w in ["ai", "ml", "llm", "machine learning", "sztuczna inteligencja"]):
        return (
            "**AI/ML na polskim rynku pracy:**\n\n"
            "Najszybciej rosnący segment od 2023. Dane:\n\n"
            "- Oferty z wymaganiem AI/ML: 8% wszystkich (2023) → 23% (2025) → est. 40% (2027)\n"
            "- Premum płacowe za AI skills: +35-50% vs. porównywalny poziom bez AI\n"
            "- Najczęstsze kombinacje: Python + PyTorch/TF, Python + HuggingFace, "
            "Python + LangChain/LlamaIndex\n\n"
            "**LLM integration (od 2024):** nowa kategoria. Firmy szukają devów którzy "
            "umieją wdrożyć LLM w produkt (nie badać – wdrożyć). Stack: API calls, "
            "prompt engineering, RAG, evals.\n\n"
            "*Tryb demo.*"
        )

    if any(w in msg for w in ["junior", "początkujący", "start", "zacząć", "nauka"]):
        return (
            "**Rady dla juniorów wchodzących na rynek (2025-2026):**\n\n"
            "Rynek dla juniorów jest trudniejszy niż w 2021-2022 (boom post-COVID minął). "
            "Ale możliwości istnieją:\n\n"
            "✅ **Działające ścieżki:**\n"
            "1. Python + podstawy ML/AI → Data Analyst → Data Scientist\n"
            "2. TypeScript + React → Frontend/Fullstack\n"
            "3. DevOps/Cloud (AWS certs) → SRE/Platform Engineer\n\n"
            "❌ **Trudne bez wyróżnienia:**\n"
            "- Czysty CRUD w Javie bez czegokolwiek dodatkowego\n"
            "- Frontend bez TypeScripta\n\n"
            "**Kluczowe:** portfolio z realnym projektem (nie todo-app), "
            "aktywność na GitHubie, znajomość AI toolingu (Copilot, Cursor).\n\n"
            "*Tryb demo – podaj klucz API by uzyskać spersonalizowane porady.*"
        )

    if any(w in msg for w in ["remote", "zdalny", "hybrid", "hybrydowy"]):
        return (
            "**Remote work w polskim IT (2025):**\n\n"
            "Z naszych danych (5000+ ofert 2021-2026):\n"
            "- **Full remote:** 40% ofert (wzrost z 25% w 2021)\n"
            "- **Hybrid:** 40% ofert\n"
            "- **On-site only:** 20% ofert (głównie fintech, gaming, duże korpo)\n\n"
            "**Trend:** Post-COVID firmy wróciły do 3 dni/tydzień w biurze, "
            "ale senior roles mają większą elastyczność. Startupy = więcej remote, "
            "banki/ubezpieczyciele = więcej on-site.\n\n"
            "**Prognoza 2027:** Stable ~35-40% full remote. "
            "Wzrost remote to już nie trend – to nowa norma.\n\n"
            "*Tryb demo.*"
        )

    # Generic fallback
    return (
        "Jestem analitykiem rynku pracy IT w Polsce (dane 2021-2026). "
        "Mogę odpowiedzieć na pytania o:\n\n"
        "- 📊 **Trendy** – jakie technologie rosną / maleją\n"
        "- 💰 **Wynagrodzenia** – widełki płacowe, wzrosty\n"
        "- 🌍 **Miasta** – Warszawa vs inne aglomeracje\n"
        "- 🔮 **Prognozy** – rynek 2026-2031\n"
        "- 🤖 **AI/ML** – wpływ na rynek\n"
        "- 👶 **Junior** – jak wejść na rynek\n\n"
        "Zadaj konkretne pytanie po polsku lub angielsku!\n\n"
        "*Działam w trybie demo (wbudowane odpowiedzi). "
        "Podaj klucz API w panelu po lewej, by rozmawiać z prawdziwym modelem AI.*"
    )


# Presets for the "pick a provider, paste your own key" flow in the UI.
# 'custom' requires the client to also send base_url + model.
_USER_PROVIDER_PRESETS = {
    "pcss": {
        "base_url": "https://llm.hpc.psnc.pl/api/chat/completions",
        "model": "Bielik-11B-v2.3-Instruct",
    },
    "groq": {
        "base_url": "https://api.groq.com/openai/v1/chat/completions",
        "model": "llama-3.3-70b-versatile",
    },
}


class ChatRequest(BaseModel):
    message: str
    api_key: Optional[str] = None
    provider: Optional[str] = None  # "anthropic" | "pcss" | "groq" | "custom"
    base_url: Optional[str] = None  # required when provider == "custom"
    model: Optional[str] = None     # required when provider == "custom"
    session_id: str = "default"


@router.post("/send")
async def send_message(request: ChatRequest):
    sid = request.session_id
    if sid not in _sessions:
        _sessions[sid] = []

    _sessions[sid].append({"role": "user", "content": request.message})

    provider = request.provider or ("anthropic" if request.api_key and request.api_key.startswith("sk-ant-") else None)

    # Live mode 1: user provided their own Anthropic key
    if provider == "anthropic" and request.api_key:
        try:
            from anthropic import Anthropic
            client = Anthropic(api_key=request.api_key)
            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                messages=_sessions[sid],
            )
            reply = response.content[0].text
            mode = "live"
        except Exception as e:
            reply = f"Błąd API: {str(e)}\n\nSprawdź czy klucz API jest poprawny."
            mode = "error"
    # Live mode 2: user provided their own key for an OpenAI-compatible provider
    elif provider in ("pcss", "groq", "custom") and request.api_key:
        if provider == "custom":
            base_url, model = request.base_url, request.model
        else:
            preset = _USER_PROVIDER_PRESETS[provider]
            base_url, model = preset["base_url"], preset["model"]

        if not base_url or not model:
            reply = "Błąd konfiguracji: brak base_url lub model dla własnego dostawcy."
            mode = "error"
        else:
            try:
                resp = requests.post(
                    base_url,
                    headers={"Authorization": f"Bearer {request.api_key}"},
                    json={
                        "model": model,
                        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, *_sessions[sid]],
                        "max_tokens": 1024,
                    },
                    timeout=60,
                )
                resp.raise_for_status()
                reply = resp.json()["choices"][0]["message"]["content"]
                mode = "live"
            except Exception as e:
                reply = f"Błąd API ({provider}): {str(e)}"
                mode = "error"
    else:
        # Live mode 2: server-side OpenAI-compatible providers, tried in order
        configured = [p for p in _PROVIDERS if p["api_key"]]
        reply, mode = None, None
        for provider in configured:
            try:
                resp = requests.post(
                    provider["base_url"],
                    headers={"Authorization": f"Bearer {provider['api_key']}"},
                    json={
                        "model": provider["model"],
                        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, *_sessions[sid]],
                        "max_tokens": 1024,
                    },
                    timeout=60,
                )
                resp.raise_for_status()
                reply = resp.json()["choices"][0]["message"]["content"]
                mode = "live"
                break
            except Exception:
                continue  # try next provider (e.g. quota exhausted)

        if reply is None:
            if configured:
                reply = "Błąd API: żaden skonfigurowany dostawca LLM nie odpowiedział poprawnie."
                mode = "error"
            else:
                # Demo mode: pattern-matched responses
                reply = demo_response(request.message)
                mode = "demo"

    _sessions[sid].append({"role": "assistant", "content": reply})

    return {
        "message": reply,
        "mode": mode,
        "conversation_length": len(_sessions[sid]),
    }


@router.get("/history")
async def get_chat_history(session_id: str = "default"):
    return {"messages": _sessions.get(session_id, [])}


@router.post("/reset")
async def reset_chat(session_id: str = "default"):
    _sessions.pop(session_id, None)
    return {"status": "cleared"}
