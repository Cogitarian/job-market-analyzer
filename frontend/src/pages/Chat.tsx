import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import './Chat.css'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim()) return

    const userMessage = input
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)
    setError('')

    try {
      const response = await axios.post('/api/chat/send', {
        message: userMessage
      })

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response.data.message
      }])
    } catch (err) {
      setError('Failed to get response from AI. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const resetChat = async () => {
    try {
      await axios.post('/api/chat/reset')
      setMessages([])
      setError('')
    } catch (err) {
      console.error('Failed to reset chat', err)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const suggestedQuestions = [
    "What are the most in-demand skills for 2027?",
    "How will AI impact junior developer salaries?",
    "Which cities have the best job growth prospects?",
    "What skills should I learn for career progression?",
    "How competitive is the job market becoming?",
  ]

  return (
    <div className="chat">
      <div className="chat-container">
        <div className="chat-header">
          <h2>💬 Job Market AI Assistant</h2>
          <p>Ask questions about job market trends, predictions, and advice</p>
        </div>

        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="chat-welcome">
              <h3>Welcome! 👋</h3>
              <p>Ask me anything about the job market, skill trends, salary predictions, or career advice.</p>
              <div className="suggested-questions">
                <p className="suggestions-label">Example questions:</p>
                {suggestedQuestions.map((question, idx) => (
                  <button
                    key={idx}
                    className="suggestion-btn"
                    onClick={() => {
                      setInput(question)
                    }}
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => (
                <div key={idx} className={`message message-${msg.role}`}>
                  <div className="message-avatar">
                    {msg.role === 'user' ? '👤' : '🤖'}
                  </div>
                  <div className="message-content">
                    <div className="message-text">{msg.content}</div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="message message-assistant">
                  <div className="message-avatar">🤖</div>
                  <div className="message-content">
                    <div className="typing-indicator">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="error">{error}</div>
        )}

        <div className="chat-input-area">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me about job market trends, skills, salaries, or career advice..."
            disabled={loading}
            rows={3}
          />
          <div className="chat-actions">
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="primary send-btn"
            >
              {loading ? 'Sending...' : 'Send'}
            </button>
            {messages.length > 0 && (
              <button
                onClick={resetChat}
                className="reset-btn"
              >
                Clear Chat
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
