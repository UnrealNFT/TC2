import { useState, useCallback, useEffect, useRef } from 'react'
import axios from 'axios'
import {
  createFile,
  parseRepoFullName,
  listFiles,
  readFile,
  patchFile,
} from '../services/github'

interface ChatProps {
  selectedAgent: 'groq' | 'kimi' | 'claude' | 'kimi-wavespeed' | 'trappist-local'
  githubToken?: string
  isTokenValid?: boolean
  selectedRepo?: string | null
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  status?: 'sent' | 'delivered' | 'read' | 'error'
}

export default function Chat({
  selectedAgent,
  githubToken,
  isTokenValid,
  selectedRepo,
}: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isTyping) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content,
      timestamp: new Date(),
      status: 'sent',
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsTyping(true)
    setError(null)

    try {
      let responseContent = ''
      
      if (selectedAgent === 'trappist-local') {
        // Local agent - simulate response
        await new Promise((resolve) => setTimeout(resolve, 1000))
        responseContent = 'Réponse locale de l\'agent Trappist.'
      } else {
        // External API
        const url = selectedAgent === 'groq' 
          ? 'https://api.groq.com/v1/chat/completions'
          : selectedAgent === 'claude'
          ? 'https://api.anthropic.com/v1/messages'
          : 'https://api.kimi.ai/v1/chat'

        const payload = {
          model: selectedAgent,
          messages: [{ role: 'user', content }],
          temperature: 0.7,
          max_tokens: 1024,
        }

        const response = await axios.post(url, payload, {
          headers: {
            'Authorization': `Bearer ${githubToken || ''}`,
            'Content-Type': 'application/json',
          },
        })

        responseContent = response.data.choices?.[0]?.message?.content || 'Aucune réponse reçue.'
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseContent,
        timestamp: new Date(),
        status: 'delivered',
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (err: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'system',
        content: `Erreur: ${err?.message || 'Échec de la requête'}`,
        timestamp: new Date(),
        status: 'error',
      }
      setMessages((prev) => [...prev, errorMessage])
      setError(err?.message || 'Échec de la requête')
    } finally {
      setIsTyping(false)
    }
  }, [selectedAgent, githubToken, isTyping])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }, [input, sendMessage])

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>Chat avec {selectedAgent}</h2>
        {!isTokenValid && <span className="warning">⚠️ Token GitHub invalide</span>}
      </div>

      <div className="chat-messages">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message ${msg.role} ${msg.status}`}
          >
            <div className="message-content">
              {msg.role === 'user' && <span className="user-badge">Vous</span>}
              {msg.role === 'assistant' && <span className="assistant-badge">{selectedAgent}</span>}
              {msg.role === 'system' && <span className="system-badge">Système</span>}
              <p>{msg.content}</p>
              <span className={`timestamp ${msg.status}`}>{msg.timestamp.toLocaleTimeString()}</span>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="typing-indicator">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="error-banner">
          <p>⚠️ {error}</p>
        </div>
      )}

      <div className="chat-input-container">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(input) }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Écrivez votre message..."
            disabled={isTyping}
          />
          <button type="submit" disabled={isTyping || !input.trim()}>
            <svg viewBox="0 0 24 24">
              <path d="M2.01 21L23 12L2.01 3" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}