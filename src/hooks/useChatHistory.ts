import { useState, useEffect, useCallback } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'agent' | 'kimi' | 'system' | 'error'
  text: string
  createdAt: number
  meta?: Record<string, any>
}

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
    localStorage.setItem(getStorageKey(workspace), JSON.stringify(messages.slice(-200)))
  }, [messages, workspace, loaded])

  const push = useCallback((msg: Omit<ChatMessage, 'id' | 'createdAt'>) => {
    const full: ChatMessage = { ...msg, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: Date.now() }
    setMessages((prev) => [...prev, full])
  }, [])

  const clear = useCallback(() => {
    setMessages([])
  }, [])

  const updateLast = useCallback((role: ChatMessage['role'], patch: Partial<ChatMessage>) => {
    setMessages((prev) => {
      const idx = [...prev].reverse().findIndex((m) => m.role === role)
      if (idx < 0) return prev
      const realIdx = prev.length - 1 - idx
      const next = [...prev]
      next[realIdx] = { ...next[realIdx], ...patch }
      return next
    })
  }, [])

  return { messages, push, clear, updateLast, loaded }
}
