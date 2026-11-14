import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { localApi } from '../services/localApi'
import { buildWorkspaceSnapshot } from '../services/localSnapshot'
import { callKimi, needsKimi, type ModelMessage } from '../services/agentModels'
import {
  createFile as githubCreateFile,
  parseRepoFullName,
  listFiles as githubListFiles,
  readFile as githubReadFile,
  patchFile as githubPatchFile,
  getRepoTree,
} from '../services/github'

interface AgentPanelProps {
  githubToken: string
  isTokenValid: boolean
  selectedRepo: string | null
  openPath: string | null
  fileContent: string
  onApplyEdit: (content: string) => void
  workspace: string
  kimiEnabled: boolean
}

interface AgentLog {
  tour: number
  agent: string
  role: 'worker' | 'reviewer' | 'kimi'
  summary: string
  raw: string
}

const ASK_URL = 'http://localhost:8000/ask'
const MAX_CONTENT_CHARS = 6000
const MAX_AUTO_STEPS = 10_000

function truncate(content: string) {
  if (content.length <= MAX_CONTENT_CHARS) return content
  return content.slice(0, MAX_CONTENT_CHARS) + '\n\n…[tronqué]'
}

function extractAction(text: string) {
  const match = text.match(/```(?:edit_file|edit_buffer|set_buffer|create_file|read_file|search)\s*([\s\S]*?)```/)
  if (!match) return null
  try {
    return JSON.parse(match[1].trim())
  } catch {
    return null
  }
}

export function AgentPanel({
  githubToken,
  isTokenValid,
  selectedRepo,
  openPath,
  fileContent,
  onApplyEdit,
  workspace,
  kimiEnabled,
}: AgentPanelProps) {
  const [messages, setMessages] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [tour, setTour] = useState(0)
  const [intervalSeconds, setIntervalSeconds] = useState(0)
  const [logs, setLogs] = useState<AgentLog[]>([])
  const cancelRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (intervalSeconds > 0) {
      intervalRef.current = setInterval(() => {
        if (!running && input.trim() && !cancelRef.current) void runMission()
      }, intervalSeconds * 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [intervalSeconds, running, input, workspace, openPath])

  const addLog = (t: number, agent: string, role: AgentLog['role'], summary: string, raw: string) => {
    setLogs((prev) => [...prev.slice(-49), { tour: t, agent, role, summary, raw }])
  }

  const buildContext = async (mode: 'local' | 'github') => {
    const parts: string[] = []
    if (workspace) {
      const snapshot = await buildWorkspaceSnapshot(workspace)
      parts.push(snapshot)
    }
    if (mode === 'github' && isTokenValid && selectedRepo) {
      const { owner, repo } = parseRepoFullName(selectedRepo)
      try {
        const tree = await getRepoTree({ token: githubToken, owner, repo })
        parts.push(`\n\nGITHUB REPO ${selectedRepo} TREE:\n` + tree.map((t) => `${t.type === 'tree' ? '📁' : '📄'} ${t.path}`).join('\n'))
      } catch (e: any) {
        parts.push(`\n\n[Erreur GitHub tree: ${e.message}]`)
      }
    }
    return parts.join('\n')
  }

  const askLocalAgent = async (system: string, question: string) => {
    const res = await axios.post(ASK_URL, {
      system,
      question,
      file_content: fileContent || '',
      file_path: openPath || '',
    })
    return {
      reasoning: res.data.reasoning || '',
      final: res.data.final || res.data.response || '',
      loops: res.data.loops || 1,
    }
  }

  const doSearch = async (query: string) => {
    try {
      const [web, gh] = await Promise.all([
        axios.get(`http://localhost:4269/api/search/web?q=${encodeURIComponent(query)}`, { timeout: 20000 }).catch(() => null),
        axios.get(`http://localhost:4269/api/search/github?q=${encodeURIComponent(query)}`, { timeout: 20000 }).catch(() => null),
      ])
      const webText = web?.data?.snippet || 'N/A'
      const ghText = gh?.data?.repos
        ? gh.data.repos.slice(0, 3).map((r: { name: string; stars: number; description?: string; url: string }) => `${r.name} ★${r.stars} — ${r.description || ''} — ${r.url}`).join('\n')
        : 'N/A'
      return `WEB:\n${webText}\n\nGITHUB:\n${ghText}`
    } catch (e: any) {
      return `Erreur recherche: ${e.message}`
    }
  }

  const runAction = async (action: any): Promise<string> => {
    if (!action || !action.action) return 'Aucune action'

    if (action.action === 'search') {
      const results = await doSearch(action.query || input)
      return `🔍 Recherche "${action.query || input}"\n${results}`
    }

    if (action.action === 'edit_buffer') {
      if (!openPath) return '❌ Aucun fichier ouvert'
      if (!fileContent.includes(action.oldText)) return '❌ oldText introuvable'
      onApplyEdit(fileContent.replace(action.oldText, action.newText))
      return `✅ Buffer modifié (${openPath})`
    }

    if (action.action === 'set_buffer') {
      if (!openPath) return '❌ Aucun fichier ouvert'
      onApplyEdit(action.content)
      return '✅ Buffer remplacé'
    }

    if (action.action === 'edit_file') {
      try {
        const file = await localApi.readFile(action.path)
        if (!file.content.includes(action.oldText)) return `❌ oldText introuvable dans ${action.path}`
        await localApi.writeFile(action.path, file.content.replace(action.oldText, action.newText))
        return `✅ Modifié local : ${action.path}`
      } catch (e: any) {
        return `❌ ${e.message}`
      }
    }

    if (action.action === 'create_file') {
      try {
        await localApi.writeFile(action.path, action.content || '')
        return `✅ Créé local : ${action.path}`
      } catch (e: any) {
        return `❌ ${e.message}`
      }
    }

    if (action.action === 'read_file') {
      try {
        const file = await localApi.readFile(action.path)
        return `📄 ${file.path} (${file.content.length} car.)\n\`\`\`\n${truncate(file.content)}\n\`\`\``
      } catch (e: any) {
        return `❌ ${e.message}`
      }
    }

    if (!isTokenValid || !selectedRepo) return '❌ GitHub non connecté'
    const { owner, repo } = parseRepoFullName(selectedRepo)
    if (action.action === 'list_files') {
      const files = await githubListFiles({ token: githubToken, owner, repo, path: action.path || '' })
      return files.map((f) => `${f.type === 'dir' ? '📁' : '📄'} ${f.path}`).join('\n')
    }
    if (action.action === 'read_file') {
      const file = await githubReadFile({ token: githubToken, owner, repo, path: action.path })
      return `📄 ${file.path}\n\`\`\`\n${truncate(file.content)}\n\`\`\``
    }
    if (action.action === 'create_file') {
      await githubCreateFile({ token: githubToken, owner, repo, path: action.path, content: action.content, message: action.message })
      return `✅ GitHub : ${action.path}`
    }
    if (action.action === 'patch_file') {
      await githubPatchFile({ token: githubToken, owner, repo, path: action.path, oldText: action.oldText, newText: action.newText, message: action.message })
      return `✅ Patch GitHub : ${action.path}`
    }
    return `❌ Action inconnue : ${action.action}`
  }

  const kimiIntervention = async (currentTour: number, mission: string, workerOutput: string, actionResult: string): Promise<{ review: string; corrections: string }> => {
    const context = await buildContext(isTokenValid && selectedRepo ? 'github' : 'local')
    const system = `Tu es Kimi, expert senior dans TrappistCode IDE. Tu interviens uniquement quand l'agent local est en difficulté.

CONTEXTE:
${context}

MISSION: ${mission}

Dernière action du worker local:
${workerOutput}

Résultat de l'action:
${actionResult}

INSTRUCTIONS:
1. Diagnostique le problème.
2. Donne un RE-PROMPT très précis (instructions concrètes) au worker local pour débloquer la situation.
3. Si tu peux corriger directement, fournis un bloc \+\`\`\`edit_buffer ou \+\`\`\`edit_file. Tu peux aussi proposer search.
4. Si c'est bon, réponds OK.`

    const messages: ModelMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: 'Le worker local est bloqué ou a un doute. Aide-le.' },
    ]
    const { text: review } = await callKimi(messages, 300_000)
    addLog(currentTour, 'kimi', 'kimi', needsKimi(review) ? 'aide' : 'ok', review)

    const action = extractAction(review)
    const corrections = action ? await runAction(action) : 'Aucune action directe'
    return { review, corrections }
  }

  const localWorkerTurn = async (currentTour: number, userMission: string, previousFeedback: string): Promise<{ output: string; actionResult: string }> => {
    const context = await buildContext('local')
    const system = `Tu es un agent worker local (Gemma + DeepSeek-V4 + Qwen relecteur) dans TrappistCode IDE. Mission : ${userMission}

CONTEXTE LOCAL:
${context}

INSTRUCTIONS:
- Fais UNE SEULE modification par tour.
- Explique ce que tu fais.
- Pour modifier : bloc \+\`\`\`edit_buffer
{ "action": "edit_buffer", "oldText": "...", "newText": "..." }
\`\`\`
- Pour créer : \+\`\`\`create_file
{ "action": "create_file", "path": "...", "content": "..." }
\`\`\`
- Pour chercher : \+\`\`\`search
{ "action": "search", "query": "..." }
\`\`\`
- Si tu as un doute, explique clairement le problème pour que Kimi puisse t'aider.
- Réponds en français.
- Mission terminée => TERMINÉ.`

    const { final: output } = await askLocalAgent(system, previousFeedback || userMission)
    const action = extractAction(output)
    const actionResult = action ? await runAction(action) : '〔pas d\'action〕'
    addLog(currentTour, 'local-gemma', 'worker', action?.action || 'chat', output)
    return { output, actionResult }
  }

  const runMission = async () => {
    if (!input.trim() || running) return
    const mission = input
    cancelRef.current = false
    setMessages([])
    setLogs([])
    setTour(0)
    setLoading(true)
    setRunning(true)

    let currentTour = 0
    let feedback = ''

    try {
      while (currentTour < MAX_AUTO_STEPS && !cancelRef.current) {
        currentTour++
        setTour(currentTour)
        setMessages((prev) => [...prev, `— Tour ${currentTour} — agent local`])

        const { output, actionResult } = await localWorkerTurn(currentTour, mission, feedback)
        setMessages((prev) => [...prev, `🛠 ${actionResult}`, output])

        if (output.includes('TERMINÉ') || output.toLowerCase().includes('"action": "done"')) {
          setMessages((prev) => [...prev, `🏁 Mission terminée au tour ${currentTour}`])
          break
        }

        const kimiEvery10 = kimiEnabled && currentTour % 10 === 0
        const localStuck = needsKimi(output) || actionResult.startsWith('❌')

        if ((kimiEvery10 || localStuck) && !cancelRef.current) {
          setMessages((prev) => [...prev, `— Kimi intervient (tour ${currentTour}${localStuck ? ' : blocage détecté' : ' : review /10'})`])
          const { review, corrections } = await kimiIntervention(currentTour, mission, output, actionResult)
          setMessages((prev) => [...prev, `🧠 Kimi: ${review.slice(0, 500)}${review.length > 500 ? '…' : ''}`, `🛠 Correction: ${corrections.slice(0, 300)}${corrections.length > 300 ? '…' : ''}`])
          feedback = `Intervention de Kimi au tour ${currentTour}:\n${review}\n\nRésultat action Kimi: ${corrections}\n\nContinue la mission: ${mission}`
          continue
        }

        feedback = `Tour précédent ${currentTour} exécuté. Résultat : ${actionResult}. Continue la mission : ${mission}`
      }
    } catch (e: any) {
      setMessages((prev) => [...prev, `❌ Erreur: ${e.message}`])
    } finally {
      setLoading(false)
      setRunning(false)
      cancelRef.current = false
    }
  }

  const stop = () => {
    cancelRef.current = true
    setRunning(false)
    setLoading(false)
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={{ color: 'var(--tc-primary)', fontWeight: 600 }}>TrappistAI Trio</span>
        <span style={{ fontSize: '11px', color: 'var(--tc-text-muted)' }}>Tour {tour}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: '1px solid var(--tc-border)' }}>
        <span style={{ fontSize: '11px', color: 'var(--tc-text-muted)' }}>Auto (sec)</span>
        <input
          type="number"
          min={0}
          value={intervalSeconds}
          onChange={(e) => setIntervalSeconds(Number(e.target.value))}
          style={{ width: 70, background: 'var(--tc-bg-elevated)', border: '1px solid var(--tc-border)', color: 'var(--tc-text)', borderRadius: 3, padding: 4, fontSize: 12 }}
        />
      </div>

      <div style={styles.messages}>
        {messages.length === 0 && (
          <div style={styles.welcome}>Missionne le trio local. Kimi peut intervenir si activé.</div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={styles.message}>{msg}</div>
        ))}
        {loading && <div style={{ color: 'var(--tc-primary)', fontSize: 12 }}>TrappistAI tour {tour} en cours…</div>}
      </div>

      <div style={styles.inputBar}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void runMission()}
          placeholder="Mission : crée/refactor/améliore…"
          style={styles.input}
        />
        <button onClick={() => void runMission()} disabled={loading || !input.trim()} style={styles.sendBtn}>
          {running ? 'En cours…' : 'Lancer'}
        </button>
        {running && <button onClick={stop} style={styles.stopBtn}>Stop</button>}
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
    height: '36px',
    borderBottom: '1px solid var(--tc-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    fontSize: '12px',
    flexShrink: 0,
  },
  messages: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  welcome: {
    textAlign: 'center',
    color: 'var(--tc-text-dim)',
    marginTop: '40px',
  },
  message: {
    padding: '6px 8px',
    borderRadius: '4px',
    backgroundColor: 'var(--tc-bg-elevated)',
    border: '1px solid var(--tc-border)',
    color: 'var(--tc-text)',
    fontSize: '11px',
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
  stopBtn: {
    backgroundColor: 'var(--tc-danger)',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '0 14px',
    cursor: 'pointer',
    fontFamily: "'Courier New', Consolas, monospace",
  },
}
