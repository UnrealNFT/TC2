import axios from 'axios'

export interface KimiResponse {
  text: string
}

export async function callWaveSpeed(question: string): Promise<KimiResponse> {
  const res = await axios.post(
    'http://localhost:8000/kimi',
    { question: question.slice(0, 4000) },
    {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 60_000,
    }
  )
  const text = String(res.data.text || '').trim()
  return { text }
}

export function needsKimi(text: string) {
  const lower = text.toLowerCase()
  const doubt = [
    'doute', 'incertain', 'bloqué', 'erreur', 'impossible', 'incorrect',
    'cassé', 'bug', 'ne fonctionne pas', 'ne marche pas', 'peux pas', 'fail',
    'je ne sais pas', 'manque', 'besoin de', 'correction', 'corrige',
  ]
  return doubt.some((d) => lower.includes(d))
}
