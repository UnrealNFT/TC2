import axios from 'axios'

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface KimiResponse {
  text: string
}

export async function callKimi(messages: ModelMessage[], timeout = 300_000): Promise<KimiResponse> {
  const res = await axios.post(
    'https://api.moonshot.cn/v1/chat/completions',
    {
      model: 'kimi-k2-0711-preview',
      messages,
      max_tokens: 4096,
      temperature: 0.4,
    },
    {
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_KIMI_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout,
    }
  )
  const text = String(res.data.choices?.[0]?.message?.content || '').trim()
  return { text }
}

export function needsKimi(text: string) {
  const lower = text.toLowerCase()
  const doubt = [
    'doute', 'incertain', 'bloqué', 'erreur', 'impossible', 'impossible', 'incorrect',
    'cassé', 'bug', 'ne fonctionne pas', 'ne marche pas', 'peux pas', 'fail',
    'je ne sais pas', 'manque', 'besoin de', 'correction', 'corrige',
  ]
  return doubt.some((d) => lower.includes(d))
}
