import { useState, useEffect } from 'react'
import axios from 'axios'
import { localApi } from '../services/localApi'
import {
  createFile,
  parseRepoFullName,
  listFiles,
  readFile,
  patchFile,
} from '../services/github'

interface AgentPanelProps {
  selectedAgent: 'groq' | 'kimi' | 'claude' | 'kimi-wavespeed' | 'trappist-local'
  githubToken: string
  isTokenValid: boolean
  selectedRepo: string | null
  openPath: string | null
  fileContent: string
  onApplyEdit: (content: string) => void
  workspace: string
}

const MAX_HISTORY = 12
const MAX_CONTENT_CHARS = 4000
const MAX_AUTO_STEPS = 20
const BUFFER_PREVIEW = 6000

function truncateContent(content: string): string {
  if (content.length <= MAX_CONTENT_CHARS) return content
  return content.slice(0, MAX_CONTENT_CHARS) + '\n\n…[tronqué]'
}

function extractResponseText(message: any): string {
  const content = message?.content?.trim?.() || ''
  const reasoning = message?.reasoning_content?.trim?.() || ''
  return content || reasoning || '(réponse vide)'
}

function displayContent(text: string): string {
  return text
    .replace(/```github-action\s*[\s\S]*?```/g, '⟦action⟧')
    .replace(/```edit_buffer\s*[\s\S]*?```/g, '⟦modif buffer⟧')
    .replace(/```set_buffer\s*[\s\S]*?```/g, '⟦remplacement⟧')
    .replace(/```edit_file\s*[\s\S]*?```/g, '⟦modif fichier local⟧')
    .trim()
}

export function AgentPanel({
  selectedAgent,
  githubToken,
  isTokenValid,
  selectedRepo,
  openPath,
  fileContent,
  onApplyEdit,
  workspace,
}: AgentPanelProps) {
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [autonomous, setAutonomous] = useState(false)
  const [tours, setTours] = useState<string[]>([])

  useEffect(() => {
    if (!loading || selectedAgent !== 'trappist-local') return
    let stop = false
    const tick = async () => {
      try {
        const res = await axios.get('http://localhost:8000/agent/status')
        const lines = (res.data.tours || []).map(
          (t: { tour: number; pensee?: string; action?: string }) =>
            `[Tour ${t.tour}] ${t.pensee || t.action || ''}`
        )
        if (!stop) setTours(lines)
      } catch {
        // agent status absent
      }
    }
    tick()
    const id = setInterval(tick, 2000)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [loading, selectedAgent])

  const extractAction = (text: string) => {
    const match = text.match(/```github-action\s*([\s\S]*?)```/)
    if (!match) return null
    const raw = match[1].trim()
    try {
      return JSON.parse(raw)
    } catch {
      return { __parseError: true as const, raw: raw.slice(0, 200) }
    }
  }

  const extractLocalEdit = (text: string) => {
    const match = text.match(/```edit_file\s*([\s\S]*?)```/)
    if (!match) return null
    const raw = match[1].trim()
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  const buildSystemPrompt = () => {
    const bufferInfo = openPath
      ? `\nFichier OUVERT dans l'éditeur : ${openPath}\nContenu (tronqué) :\n\`\`\`\n${fileContent.slice(0, BUFFER_PREVIEW)}${fileContent.length > BUFFER_PREVIEW ? '\n…[tronqué]' : ''}\n\`\`\`\n\nActions LOCALES (prioritaires, modifient l'éditeur) :\n- {\"action\":\"edit_buffer\",\"oldText\":\"...\",\"newText\":\"...\"}\n- {\"action\":\"set_buffer\",\"content\":\"...\"}\n\nActions FICHIER LOCAL (workspace ${workspace}) :\n- {\"action\":\"edit_file\",\"path\":\"...\",\"oldText\":\"...\",\"newText\":\"...\"}\n- {\"action\":\"read_file\",\"path\":\"...\"}\n- {\"action\":\"create_file\",\"path\":\"...\",\"content\":\"...\"}\n`
      : `\nAucun fichier ouvert. Workspace actif : ${workspace || 'aucun'}`

    let prompt = `Tu es TrappistAI Agent, assistant de code dans l'IDE TrappistCode.\n${bufferInfo}\n`

    if (isTokenValid && selectedRepo) {
      prompt += `\nRepo GitHub connecté : ${selectedRepo}\nActions GitHub : {\"action\":\"list_files\"|\"read_file\"|\"patch_file\"|\"create_file\"}\n`
    }

    if (autonomous) {
      prompt += `\nMode autonome : une action par réponse, continue jusqu'à résolution.`
    }

    if (selectedAgent === 'trappist-local') {
      prompt += `\nFormat local : \`\`\`edit_file\n{\"path\":\"...\",\"oldText\":\"...\",\"newText\":\"...\"}\n\`\`\``
    }

    return prompt
  }

  const callLLM = async (apiMessages: Array<{ role: string; content: string }>): Promise<string> => {
    if (selectedAgent === 'trappist-local') {
      try {
        const res = await axios.post('http://localhost:8000/ask', {
          question: apiMessages.filter((m) => m.role === 'user').pop()?.content || '',
          system: buildSystemPrompt(),
          file_content: fileContent || '',
          file_path: openPath || '',
        })
        return res.data.final || res.data.reasoning || res.data.response || '(vide)'
      } catch (e: any) {
        return `❌ Agent local : ${e.message}`
      }
    }

    if (selectedAgent === 'groq') {
      const res = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        { model: 'llama-3.1-8b-instant', messages: apiMessages, max_tokens: autonomous ? 3072 : 2048 },
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_GROQ_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      )
      return extractResponseText(res.data.choices?.[0]?.message)
    }

    const modelMap: Record<string, string> = {
      kimi: 'moonshotai/kimi-k3',
      'kimi-wavespeed': 'moonshotai/kimi-k3',
      claude: 'anthropic/claude-sonnet-4.5',
    }
    const model = modelMap[selectedAgent] ?? 'deepseek/deepseek-v4-flash'
    const res = await axios.post(
      '/api/wavespeed/chat/completions',
      { model, messages: apiMessages, max_tokens: autonomous ? 3072 : 2048 },
      {
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_WAVESPEED_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 180000,
      }
    )
    return extractResponseText(res.data.choices?.[0]?.message)
  }

  const formatError = (e: any) => {
    if (e?.response?.status === 401) return '❌ Clé API invalide'
    if (e?.response?.status === 413) return '❌ Historique trop long'
    if (e?.code === 'ECONNABORTED') return '❌ Timeout'
    return `❌ ${e.message}`
  }

  const runAction = async (action: any): Promise<string> => {
    if (action.action === 'edit_buffer') {
      if (!openPath) return '❌ Aucun fichier ouvert'
      if (!fileContent.includes(action.oldText)) return '❌ oldText introuvable'
      onApplyEdit(fileContent.replace(action.oldText, action.newText))
      return `✅ Buffer modifié (${openPath}). Sauvegarde avec Ctrl+S.`
    }

    if (action.action === 'set_buffer') {
      if (!openPath) return '❌ Aucun fichier ouvert'
      onApplyEdit(action.content)
      return '✅ Buffer remplacé.'
    }

    if (action.action === 'edit_file') {
      try {
        const file = await localApi.readFile(action.path)
        if (!file.content.includes(action.oldText)) return `❌ oldText introuvable dans ${action.path}`
        await localApi.writeFile(action.path, file.content.replace(action.oldText, action.newText))
        return `✅ Fichier local modifié : ${action.path}`
      } catch (e: any) {
        return `❌ ${e.message}`
      }
    }

    if (action.action === 'read_file') {
      try {
        const file = await localApi.readFile(action.path)
        return `📄 ${file.path} (${file.content.length} chars)\n\`\`\`\n${truncateContent(file.content)}\n\`\`\``
      } catch (e: any) {
        return `❌ ${e.message}`
      }
    }

    if (action.action === 'create_file') {
      try {
        await localApi.writeFile(action.path, action.content || '')
        return `✅ Créé : ${action.path}`
      } catch (e: any) {
        return `❌ ${e.message}`
      }
    }

    if (!selectedRepo || !githubToken) return '❌ Token/repo GitHub manquant'
    const { owner, repo } = parseRepoFullName(selectedRepo)

    if (action.action === 'list_files') {
      const files = await listFiles({ token: githubToken, owner, repo, path: action.path || '' })
      return files.map((f) => `${f.type === 'dir' ? '📁' : '📄'} ${f.path}`).join('\n')
    }

    if (action.action === 'read_file') {
      const file = await readFile({ token: githubToken, owner, repo, path: action.path })
      return `📄 ${file.path}\n\`\`\`\n${truncateContent(file.content)}\n\`\`\``
    }

    if (action.action === 'create_file') {
      await createFile({ token: githubToken, owner, repo, path: action.path, content: action.content, message: action.message })
      return `✅ GitHub : ${action.path}`
    }

    if (action.action === 'patch_file') {
      await patchFile({ token: githubToken, owner, repo, path: action.path, oldText: action.oldText, newText: action.newText, message: action.message })
      return `✅ Patch GitHub : ${action.path}`
    }

    return `❌ Action inconnue : ${action.action}`
  }

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg = { role: 'user', content: input }
    let thread = [...messages, userMsg]
    setMessages(thread)
    setInput('')
    setTours([])
    setLoading(true)

    const system = { role: 'system', content: buildSystemPrompt() }
    let steps = 0

    try {
      while (steps < (autonomous ? MAX_AUTO_STEPS : 1)) {
        steps++
        const recent = thread.slice(-MAX_HISTORY).map((m) => ({
          role: m.role,
          content: truncateContent(m.content),
        }))

        let response = ''
        try {
          response = await callLLM([system, ...recent])
        } catch (e: any) {
          response = formatError(e)
          thread = [...thread, { role: 'assistant', content: response }]
          setMessages(thread)
          break
        }

        const localEdit = extractLocalEdit(response)
        if (localEdit && localEdit.path) {
          try {
            const file = await localApi.readFile(localEdit.path)
            if (file.content.includes(localEdit.oldText)) {
              await localApi.writeFile(localEdit.path, file.content.replace(localEdit.oldText, localEdit.newText))
              response += `\n\n✅ Fichier local modifié : ${localEdit.path}`
            } else {
              response += `\n\n❌ oldText introuvable dans ${localEdit.path}`
            }
          } catch (e: any) {
            response += `\n\n❌ ${e.message}`
          }
        }

        thread = [...thread, { role: 'assistant', content: response }]
        setMessages(thread)

        const action = extractAction(response)
        if (!action) break
        if (action.__parseError) {
          thread = [...thread, { role: 'assistant', content: '❌ Action JSON invalide' }]
          setMessages(thread)
          break
        }

        let result = ''
        try {
          result = await runAction(action)
        } catch (e: any) {
          result = `❌ ${e.response?.data?.message || e.message}`
        }
        thread = [...thread, { role: 'assistant', content: result }]
        setMessages(thread)

        if (!autonomous) break
      }
    } finally {
      setLoading(false)
    }
  }

  const clearChat = () => setMessages([])

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={clearChat} style={styles.miniBtn}>Vider</button>
          <label style={styles.autoLabel}>
            <input type="checkbox" checked={autonomous} onChange={(e) => setAutonomous(e.target.checked)} />
            Auto
          </label>
        </div>
        <span style={{ color: openPath ? 'var(--tc-primary)' : 'var(--tc-text-dim)', fontSize: '11px' }}>
          {openPath || 'aucun fichier'}
        </span>
      </div>

      <div style={styles.messages}>
        {messages.length === 0 && (
          <div style={styles.welcome}>Agent prêt. Ouvre un fichier et demande une modif.</div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            ...styles.bubble,
            backgroundColor: msg.role === 'user' ? 'var(--tc-selected)' : 'var(--tc-bg-elevated)',
            border: '1px solid var(--tc-border)',
          }}>
            {displayContent(msg.content)}
          </div>
        ))}
        {loading && (
          <div style={{ color: 'var(--tc-primary)', fontSize: '12px' }}>
            {tours.length ? tours.join('\n') : 'TrappistAI réfléchit...'}
          </div>
        )}
      </div>

      <div style={styles.inputBar}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Demande à l'agent..."
          style={styles.input}
        />
        <button onClick={send} disabled={loading || !input.trim()} style={styles.sendBtn}>
          Envoyer
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: 'var(--tc-bg-soft)',
  },
  header: {
    height: '32px',
    borderBottom: '1px solid var(--tc-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    fontSize: '12px',
    flexShrink: 0,
  },
  miniBtn: {
    background: 'transparent',
    border: '1px solid var(--tc-border)',
    color: 'var(--tc-text-muted)',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '11px',
    fontFamily: "'Courier New', Consolas, monospace",
  },
  autoLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color: 'var(--tc-text-muted)',
    cursor: 'pointer',
  },
  messages: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  welcome: {
    textAlign: 'center',
    color: 'var(--tc-text-dim)',
    marginTop: '40px',
  },
  bubble: {
    padding: '10px',
    borderRadius: '6px',
    color: 'var(--tc-text)',
    fontSize: '12px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  inputBar: {
    display: 'flex',
    gap: '8px',
    padding: '10px',
    borderTop: '1px solid var(--tc-border)',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    backgroundColor: 'var(--tc-bg-elevated)',
    border: '1px solid var(--tc-border)',
    borderRadius: '4px',
    padding: '8px',
    color: 'var(--tc-text)',
    fontFamily: "'Courier New', Consolas, monospace",
    outline: 'none',
  },
  sendBtn: {
    backgroundColor: 'var(--tc-primary)',
    color: 'var(--tc-bg)',
    border: 'none',
    borderRadius: '4px',
    padding: '0 16px',
    cursor: 'pointer',
    fontWeight: 600,
    fontFamily: "'Courier New', Consolas, monospace",
  },
}
