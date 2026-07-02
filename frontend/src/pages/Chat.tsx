import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { API_BASE } from '../config'
import './Chat.css'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  mode?: 'demo' | 'live' | 'error'
}

type Provider = 'anthropic' | 'pcss' | 'groq' | 'custom'

const PROVIDER_INFO: Record<Provider, { label: string; keyHint: string; keyPrefix?: string; signupUrl: string; needsCustomFields?: boolean }> = {
  anthropic: {
    label: 'Anthropic (Claude)',
    keyHint: 'Klucz zaczyna się od sk-ant-api03-',
    keyPrefix: 'sk-ant-',
    signupUrl: 'https://console.anthropic.com',
  },
  pcss: {
    label: 'PCSS (llm.hpc.psnc.pl)',
    keyHint: 'Klucz z panelu PCSS HPC LLM',
    signupUrl: 'https://llm.hpc.psnc.pl',
  },
  groq: {
    label: 'Groq (darmowy, szybki)',
    keyHint: 'Darmowy klucz, bez karty płatniczej',
    signupUrl: 'https://console.groq.com/keys',
  },
  custom: {
    label: 'Inny (własny endpoint)',
    keyHint: 'Dowolny endpoint kompatybilny z OpenAI API',
    signupUrl: '',
    needsCustomFields: true,
  },
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
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('chat_api_key') || '')
  const [provider, setProvider] = useState<Provider>(() => (localStorage.getItem('chat_provider') as Provider) || 'anthropic')
  const [customBaseUrl, setCustomBaseUrl] = useState(() => localStorage.getItem('chat_custom_base_url') || '')
  const [customModel, setCustomModel] = useState(() => localStorage.getItem('chat_custom_model') || '')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [providerDraft, setProviderDraft] = useState<Provider>(provider)
  const [baseUrlDraft, setBaseUrlDraft] = useState(customBaseUrl)
  const [modelDraft, setModelDraft] = useState(customModel)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isLive = Boolean(apiKey) && (provider !== 'custom' || Boolean(customBaseUrl && customModel))

  const saveKey = () => {
    localStorage.setItem('chat_api_key', keyDraft)
    localStorage.setItem('chat_provider', providerDraft)
    if (providerDraft === 'custom') {
      localStorage.setItem('chat_custom_base_url', baseUrlDraft)
      localStorage.setItem('chat_custom_model', modelDraft)
      setCustomBaseUrl(baseUrlDraft)
      setCustomModel(modelDraft)
    }
    setApiKey(keyDraft)
    setProvider(providerDraft)
    setShowKeyInput(false)
    setKeyDraft('')
  }

  const clearKey = () => {
    localStorage.removeItem('chat_api_key')
    localStorage.removeItem('chat_provider')
    localStorage.removeItem('chat_custom_base_url')
    localStorage.removeItem('chat_custom_model')
    setApiKey('')
    setCustomBaseUrl('')
    setCustomModel('')
    setShowKeyInput(false)
  }

  const info = PROVIDER_INFO[providerDraft]
  const canSave = providerDraft === 'custom'
    ? Boolean(keyDraft && baseUrlDraft && modelDraft)
    : Boolean(keyDraft)

  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim()
    if (!msg) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)

    try {
      const { data } = await axios.post(`${API_BASE}/api/chat/send`, {
        message: msg,
        api_key: isLive ? apiKey : null,
        provider: isLive ? provider : null,
        base_url: isLive && provider === 'custom' ? customBaseUrl : null,
        model: isLive && provider === 'custom' ? customModel : null,
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
          {isLive ? '🟢 Tryb live' : '🟡 Tryb demo'}
        </div>

        {!isLive && (
          <div className="mode-info">
            Działasz na wbudowanych odpowiedziach. Podaj klucz API (Anthropic, PCSS, Groq lub inny), by rozmawiać z prawdziwym modelem.
          </div>
        )}
        {isLive && (
          <div className="mode-info live">
            Połączono z {PROVIDER_INFO[provider].label}. Klucz przechowywany lokalnie w przeglądarce, nie wysyłany nigdzie poza czas rozmowy.
          </div>
        )}

        {!showKeyInput && (
          <button className="key-btn" onClick={() => {
            setShowKeyInput(true)
            setProviderDraft(provider)
            setKeyDraft(apiKey)
            setBaseUrlDraft(customBaseUrl)
            setModelDraft(customModel)
          }}>
            {isLive ? '🔑 Zmień dostawcę / klucz' : '🔑 Dodaj klucz API'}
          </button>
        )}

        {showKeyInput && (
          <div className="key-form">
            <select
              value={providerDraft}
              onChange={e => setProviderDraft(e.target.value as Provider)}
            >
              {Object.entries(PROVIDER_INFO).map(([key, p]) => (
                <option key={key} value={key}>{p.label}</option>
              ))}
            </select>

            <input
              type="password"
              value={keyDraft}
              onChange={e => setKeyDraft(e.target.value)}
              placeholder={info.keyPrefix ? `${info.keyPrefix}...` : 'Klucz API...'}
              autoFocus
            />

            {info.needsCustomFields && (
              <>
                <input
                  type="text"
                  value={baseUrlDraft}
                  onChange={e => setBaseUrlDraft(e.target.value)}
                  placeholder="https://api.example.com/v1/chat/completions"
                />
                <input
                  type="text"
                  value={modelDraft}
                  onChange={e => setModelDraft(e.target.value)}
                  placeholder="nazwa-modelu"
                />
              </>
            )}

            <div className="key-actions">
              <button className="primary" onClick={saveKey} disabled={!canSave}>
                Zapisz
              </button>
              <button onClick={() => setShowKeyInput(false)}>Anuluj</button>
              {isLive && <button className="danger" onClick={clearKey}>Usuń</button>}
            </div>
            <div className="key-hint">
              {info.keyHint}.<br/>
              {info.signupUrl && (
                <>Pobierz na <a href={info.signupUrl} target="_blank" rel="noreferrer">{info.signupUrl.replace('https://', '')}</a></>
              )}
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
                  ? `Połączono z ${PROVIDER_INFO[provider].label}. Zadaj pytanie o rynek IT w Polsce.`
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
                    {msg.mode === 'live' ? `🟢 ${PROVIDER_INFO[provider].label}` : msg.mode === 'error' ? '🔴 Błąd' : '🟡 Demo'}
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
