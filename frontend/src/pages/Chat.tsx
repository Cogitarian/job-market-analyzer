import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import './Chat.css'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  mode?: 'demo' | 'live' | 'error'
}

const SESSION_ID = `session_${Math.random().toString(36).slice(2, 9)}`

const SUGGESTED = [
  "Jakie umiejętności będą najcenniejsze w 2027?",
  "Jak AI wpłynie na zarobki juniorów?",
  "Które miasto oferuje najlepsze perspektywy?",
  "Co powinienem się uczyć, żeby awansować?",
  "Jaki jest trend remote work w IT?",
]

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>')
    .replace(/#{1,4} (.+)/g, '<strong style="font-size:1.05em">$1</strong>')
    .replace(/- (.+)/g, '• $1')
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('anthropic_key') || '')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isLive = apiKey.startsWith('sk-ant-')

  const saveKey = () => {
    localStorage.setItem('anthropic_key', keyDraft)
    setApiKey(keyDraft)
    setShowKeyInput(false)
    setKeyDraft('')
  }

  const clearKey = () => {
    localStorage.removeItem('anthropic_key')
    setApiKey('')
    setShowKeyInput(false)
  }

  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim()
    if (!msg) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)

    try {
      const { data } = await axios.post('/api/chat/send', {
        message: msg,
        api_key: isLive ? apiKey : null,
        session_id: SESSION_ID,
      })

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message,
        mode: data.mode,
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Błąd połączenia z serwerem. Sprawdź czy backend działa.',
        mode: 'error',
      }])
    } finally {
      setLoading(false)
    }
  }

  const resetChat = async () => {
    await axios.post(`/api/chat/reset?session_id=${SESSION_ID}`)
    setMessages([])
  }

  return (
    <div className="chat">
      {/* Sidebar with API key config */}
      <div className="chat-sidebar">
        <div className="mode-badge" data-live={isLive}>
          {isLive ? '🟢 Live mode' : '🟡 Demo mode'}
        </div>

        {!isLive && (
          <div className="mode-info">
            Działasz na wbudowanych odpowiedziach. Podaj klucz API Anthropic, by rozmawiać z prawdziwym modelem.
          </div>
        )}
        {isLive && (
          <div className="mode-info live">
            Połączono z Claude. Klucz przechowywany lokalnie w przeglądarce, nie wysyłany na serwer poza czas rozmowy.
          </div>
        )}

        {!showKeyInput && (
          <button className="key-btn" onClick={() => { setShowKeyInput(true); setKeyDraft(apiKey) }}>
            {isLive ? '🔑 Zmień klucz' : '🔑 Dodaj klucz API'}
          </button>
        )}

        {showKeyInput && (
          <div className="key-form">
            <input
              type="password"
              value={keyDraft}
              onChange={e => setKeyDraft(e.target.value)}
              placeholder="sk-ant-api03-..."
              autoFocus
            />
            <div className="key-actions">
              <button className="primary" onClick={saveKey} disabled={!keyDraft.startsWith('sk-ant-')}>
                Zapisz
              </button>
              <button onClick={() => setShowKeyInput(false)}>Anuluj</button>
              {isLive && <button className="danger" onClick={clearKey}>Usuń</button>}
            </div>
            <div className="key-hint">
              Klucz zaczyna się od <code>sk-ant-api03-</code>.<br/>
              Pobierz na <a href="https://console.anthropic.com" target="_blank" rel="noreferrer">console.anthropic.com</a>
            </div>
          </div>
        )}

        <div className="sidebar-section">
          <div className="sidebar-label">Sugerowane pytania</div>
          {SUGGESTED.map((q, i) => (
            <button key={i} className="suggestion-btn" onClick={() => sendMessage(q)}>
              {q}
            </button>
          ))}
        </div>

        {messages.length > 0 && (
          <button className="reset-btn" onClick={resetChat}>
            🗑 Wyczyść rozmowę
          </button>
        )}
      </div>

      {/* Chat area */}
      <div className="chat-main">
        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-welcome">
              <div className="welcome-icon">💬</div>
              <h3>Asystent analizy rynku pracy</h3>
              <p>
                {isLive
                  ? 'Połączono z Claude. Zadaj pytanie o rynek IT w Polsce.'
                  : 'Tryb demo – wbudowane odpowiedzi na typowe pytania. Wybierz pytanie lub wpisz własne.'}
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`message message-${msg.role}`}>
              <div className="message-avatar">
                {msg.role === 'user' ? '👤' : msg.mode === 'live' ? '🤖' : '📊'}
              </div>
              <div className="message-bubble">
                {msg.role === 'assistant' ? (
                  <div
                    className="message-text"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                ) : (
                  <div className="message-text">{msg.content}</div>
                )}
                {msg.mode && msg.role === 'assistant' && (
                  <div className="message-mode">
                    {msg.mode === 'live' ? '🟢 Claude API' : msg.mode === 'error' ? '🔴 Error' : '🟡 Demo'}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="message message-assistant">
              <div className="message-avatar">📊</div>
              <div className="message-bubble">
                <div className="typing-indicator">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-area">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
            }}
            placeholder="Wpisz pytanie o rynek pracy... (Enter = wyślij, Shift+Enter = nowa linia)"
            disabled={loading}
            rows={3}
          />
          <button
            className="primary send-btn"
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
          >
            {loading ? '...' : 'Wyślij →'}
          </button>
        </div>
      </div>
    </div>
  )
}
