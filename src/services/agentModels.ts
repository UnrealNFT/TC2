import axios from 'axios'

export interface KimiResponse {
  text: string
}

export async function callWaveSpeed(question: string): Promise<KimiResponse> {
  const res = await axios.post(
    'https://llm.wavespeed.ai/v1/chat/completions',
    {
      model: 'moonshotai/kimi-k2.7-code',
      messages: [
        {
          role: 'system',
          content: 'Tu es un architecte senior. Réponds en français avec un plan court et des étapes concrètes. Pas de code complet.',
        },
        { role: 'user', content: question.slice(0, 4000) },
      ],
      max_tokens: 800,
      temperature: 0.4,
    },
    {
      headers: {
        Authorization: `Bearer ${import.meta.env.WAVESPEED_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 60_000,
    }
  )
  const text = String(res.data.choices?.[0]?.message?.content || '').trim()
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
