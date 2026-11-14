import axios from 'axios'

export type AgentModelKey = 'gemma' | 'deepseek' | 'kimi' | 'kimi-wavespeed' | 'trappist-local'

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ModelResponse {
  text: string
  truncated: boolean
}

const WAVE_SPEED_MODELS: Record<string, string> = {
  gemma: 'google/gemma-3-27b-it',
  deepseek: 'deepseek/deepseek-v4-flash',
  kimi: 'moonshotai/kimi-k3',
  'kimi-wavespeed': 'moonshotai/kimi-k3',
}

export async function callAgentModel(
  key: AgentModelKey,
  messages: ModelMessage[],
  options: { timeout?: number; fileContent?: string; filePath?: string } = {}
): Promise<ModelResponse> {
  if (key === 'trappist-local') {
    const user = messages.filter((m) => m.role === 'user').pop()?.content || ''
    const system = messages.find((m) => m.role === 'system')?.content || ''
    const res = await axios.post('http://localhost:8000/ask', {
      question: user,
      system,
      file_content: options.fileContent || '',
      file_path: options.filePath || '',
    })
    const text = res.data.final || res.data.reasoning || res.data.response || '(vide)'
    return { text, truncated: false }
  }

  if (key === 'kimi') {
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
        timeout: options.timeout || 300_000,
      }
    )
    const text = String(res.data.choices?.[0]?.message?.content || '').trim()
    return { text, truncated: false }
  }

  const model = WAVE_SPEED_MODELS[key] ?? WAVE_SPEED_MODELS.deepseek
  const res = await axios.post(
    '/api/wavespeed/chat/completions',
    { model, messages, max_tokens: 4096 },
    {
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_WAVESPEED_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: options.timeout || 180_000,
    }
  )
  const text = String(res.data.choices?.[0]?.message?.content || '').trim()
  return { text, truncated: false }
}

export function extractAction(text: string) {
  const match = text.match(/```(?:github-action|action|edit_file|edit_buffer|set_buffer)\s*([\s\S]*?)```/)
  if (!match) return null
  try {
    return JSON.parse(match[1].trim())
  } catch {
    return null
  }
}
