import { useState, useCallback, useEffect, useRef } from 'react'
import axios from 'axios'
import {
  createFile,
  parseRepoFullName,
  listFiles,
  readFile,
  patchFile,
} from '../services/github'
import { marked } from 'marked'
import { PrismHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface ChatProps {
  selectedAgent: 'groq' | 'kimi' | 'claude' | 'kimi-wavespeed' | 'trappist-local'
  githubToken?: string
  isTokenValid?: boolean
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  isStreaming?: boolean
}

export default function Chat({ selectedAgent, githubToken, isTokenValid }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return

    setIsLoading(true)
    setError(null)

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')

    try {
      let assistantContent = ''
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      }

      setMessages((prev) => [...prev, assistantMessage])

      // Simulate API call - replace with actual API integration
      // For now, we'll simulate a response
      const response = await simulateAgentResponse(input, selectedAgent, githubToken)
      
      // Stream the response
      setIsStreaming(true)
      for (const chunk of response) {
        assistantContent += chunk
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? { ...msg, content: assistantContent, isStreaming: false }
              : msg
          )
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id
            ? { ...msg, content: 'Erreur lors de la génération de la réponse', isStreaming: false }
            : msg
        )
      )
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
    }
  }, [input, isLoading, selectedAgent, githubToken])

  const simulateAgentResponse = async (query: string, agent: string, token?: string): Promise<string[]> => {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Simulate streaming response
    const responses: string[] = []
    const baseResponses = {
      groq: 'Voici une réponse basée sur Groq...',
      kimi: 'Voici une réponse basée sur Kimi...',
      claude: 'Voici une réponse basée sur Claude...',
      'kimi-wavespeed': 'Voici une réponse basée sur Kimi Wavespeed...',
      'trappist-local': 'Voici une réponse basée sur Trappist Local...',
    }

    const base = baseResponses[agent] || 'Voici une réponse générique...'
    
    // Simulate streaming chunks
    const chunks = base.split(' ').map(word => word + ' ') // Simple chunking
    
    for (const chunk of chunks) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      responses.push(chunk)
    }

    return responses
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleClear = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>Chat avec {selectedAgent}</h2>
        {isTokenValid && (
          <span className="status-indicator" title="Token valide">✓</span>
        )}
        {!isTokenValid && (
          <span className="status-indicator error" title="Token invalide">✗</span>
        )}
      </div>

      <div className="chat-messages">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message ${msg.role} ${msg.isStreaming ? 'streaming' : ''}`}
          >
            <div className="message-role">{msg.role === 'user' ? 'Vous' : 'Assistant'}</div>
            <div className="message-content">
              {msg.role === 'assistant' ? (
                <div className="markdown-content">
                  {msg.content.split('\n').map((line, i) => {
                    // Simple markdown rendering
                    const parts = line.split(/(`[^`]*`)/g)
                    return (
                      <div key={i} className="markdown-line">
                        {parts.map((part, j) => {
                          if (part.startsWith('`') && part.endsWith('`')) {
                            const code = part.slice(1, -1)
                            return (
                              <code key={j} className="code-block">
                                {code}
                              </code>
                            )
                          } else if (part.startsWith('**') && part.endsWith('**')) {
                            return <strong key={j}>{part.slice(2, -2)}</strong>
                          } else if (part.startsWith('*') && part.endsWith('*')) {
                            return <em key={j}>{part.slice(1, -1)}</em>
                          } else {
                            return <span key={j}>{part}</span>
                          }
                        })}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p>{msg.content}</p>
              )}
              {msg.isStreaming && (
                <span className="streaming-indicator">⌛</span>
              )}
            </div>
            <div className="message-timestamp">
              {msg.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))}
        {error && <div className="error-message">{error}</div>}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        {isLoading && (
          <div className="loading-indicator">Traitement en cours...</div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); handleSend() }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Écrivez votre message..."
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading || !input.trim()}>
            Envoyer
          </button>
        </form>
        <button onClick={handleClear} disabled={isLoading}>
          Effacer
        </button>
      </div>
    </div>
  )
}