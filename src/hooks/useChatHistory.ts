import { useState, useEffect, useCallback } from 'react'

export type ChatRole = 'user' | 'agent' | 'kimi' | 'system' | 'error'

export interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  createdAt: number
  meta?: Record<string, any>
}

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

const MAX_HISTORY = 50

function getStorageKey(workspace: string) {
  return `trappistcode-chat::${workspace || '__global__'}`
}

export function useChatHistory(workspace: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getStorageKey(workspace))
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[]
        setMessages(parsed)
      } else {
        setMessages([])
      }
    } catch {
      setMessages([])
    }
    setLoaded(true)
  }, [workspace])

  useEffect(() => {
    if (!loaded) return
    localStorage.setItem(getStorageKey(workspace), JSON.stringify(messages.slice(-MAX_HISTORY)))
  }, [messages, workspace, loaded])

  const push = useCallback((msg: Omit<ChatMessage, 'id' | 'createdAt'>) => {
    const full: ChatMessage = {
      ...msg,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
    }
    setMessages((prev) => [...prev.slice(-(MAX_HISTORY - 1)), full])
  }, [])

  const clear = useCallback(() => {
    setMessages([])
  }, [])

  const updateLast = useCallback((role: ChatMessage['role'], patch: Partial<ChatMessage>) => {
    setMessages((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === role) {
          const next = [...prev]
          next[i] = { ...next[i], ...patch }
          return next
        }
      }
      return prev
    })
  }, [])

  // Historique conversationnel au format LLM (user/assistant)
  const historyForLLM = useCallback((): HistoryMessage[] => {
    const out: HistoryMessage[] = []
    for (const m of messages.slice(-20)) {
      if (m.role === 'user') out.push({ role: 'user', content: m.text })
      else if (m.role === 'agent' || m.role === 'kimi') out.push({ role: 'assistant', content: m.text })
    }
    return out
  }, [messages])

  return { messages, push, clear, updateLast, loaded, historyForLLM }
}
