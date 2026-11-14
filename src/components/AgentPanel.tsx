import { useState, useEffect, useRef } from 'react'
import { localApi } from '../services/localApi'
import { buildWorkspaceSnapshot } from '../services/localSnapshot'
import { callAgentModel, extractAction } from '../services/agentModels'
import { searchWeb, searchGitHub } from '../services/agentSearch'
import {
  createFile as githubCreateFile,
  parseRepoFullName,
  listFiles as githubListFiles,
  readFile as githubReadFile,
  patchFile as githubPatchFile,
  getRepoTree,
} from '../services/github'
import type { AgentModelKey } from '../services/agentModels'

interface AgentPanelProps {
  selectedAgent: AgentModelKey
  githubToken: string
  isTokenValid: boolean
  selectedRepo: string | null
  openPath: string | null
  fileContent: string
  onApplyEdit: (content: string) => void
  workspace: string
}

interface AgentLog {
  tour: number
  agent: string
  role: 'worker' | 'reviewer' | 'fallback'
  summary: string
  raw: string
}

const MAX_CONTENT_CHARS = 6000
const MAX_AUTO_STEPS = 10_000

function truncate(content: string) {
  if (content.length <= MAX_CONTENT_CHARS) return content
  return content.slice(0, MAX_CONTENT_CHARS) + '\n\n…[tronqué]'
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
  const [messages, setMessages] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [tour, setTour] = useState(0)
  const [kimiReviewer, setKimiReviewer] = useState(true)
  const [gemmaFallback, setGemmaFallback] = useState(false)
  const [intervalSeconds, setIntervalSeconds] = useState(0)
  const [logs, setLogs] = useState<AgentLog[]>([])
  const cancelRef = useRef(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (intervalSeconds > 0) {
      intervalRef.current = setInterval(() => {
        if (!running && input.trim() && !cancelRef.current) void runMission()
      }, intervalSeconds * 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [intervalSeconds, running, input, selectedAgent, workspace, openPath])

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

  const doSearch = async (query: string) => {
    try {
      const [web, gh] = await Promise.all([
        searchWeb(query).catch(() => null),
        searchGitHub(query).catch(() => null),
      ])
      return `WEB:\n${web?.snippet || 'N/A'}\n\nGITHUB:\n${gh ? gh.repos.map((r) => `${r.name} ★${r.stars} — ${r.description || ''} — ${r.url}`).slice(0, 3).join('\n') : 'N/A'}`
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

  const workerTurn = async (currentTour: number, userMission: string, previousFeedback: string): Promise<{ output: string; actionResult: string }> => {
    const context = await buildContext('local')
    const system = `Tu es un agent worker dans TrappistCode IDE. Mission : ${userMission}

CONTEXTE LOCAL:
${context}

INSTRUCTIONS:
- Fais UNE SEULE modification par tour.
- Explique brièvement ce que tu fais.
- Termine toujours par un bloc action JSON valide :
  { "action": "edit_file" | "create_file" | "edit_buffer" | "search", ... }
- Pour rechercher sur le web/GitHub : { "action": "search", "query": "..." }
- Ne réécris PAS un fichier entier sauf nécessaire.
- Si mission terminée => action { "action": "done" }
- Réponds en français.`

    const { text: output } = await callAgentModel(selectedAgent, [
      { role: 'system', content: system },
      { role: 'user', content: previousFeedback || 'Exécute la mission.' },
    ], { fileContent, filePath: openPath || '' })

    const action = extractAction(output)
    const actionResult = action ? await runAction(action) : '〔pas d\'action〕'
    addLog(currentTour, selectedAgent, 'worker', action?.action || 'chat', output)
    return { output, actionResult }
  }

  const reviewTurn = async (currentTour: number, mission: string, lastWorkerOutput: string, lastActionResult: string, model: AgentModelKey): Promise<string> => {
    const context = await buildContext(isTokenValid && selectedRepo ? 'github' : 'local')
    const system = `Tu es Kimi, reviewer senior dans TrappistCode IDE. Tu interviens pour vérifier le travail d'un agent worker.

CONTEXTE:
${context}

MISSION: ${mission}

Dernière action worker:
${lastWorkerOutput}

Résultat:
${lastActionResult}

INSTRUCTIONS:
1. Vérifie qualité, sécurité, bugs, cohérence.
2. Si OK exactement : REVIEW_OK
3. Sinon REVIEW_NEEDED puis liste corrections concrètes pour le worker.
4. Tu peux commander des recherches web/GitHub si besoin via une action { "action": "search", "query": "..." }.
5. Sois chirurgical.`

    const { text: out } = await callAgentModel(model, [
      { role: 'system', content: system },
      { role: 'user', content: 'Vérifie le travail du dernier tour.' },
    ], { timeout: 300_000, fileContent, filePath: openPath || '' })

    addLog(currentTour, model, 'reviewer', out.startsWith('REVIEW_OK') ? 'OK' : 'NEEDED', out)
    return out
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
        setMessages((prev) => [...prev, `— Tour ${currentTour} — Worker: ${selectedAgent}`])

        const { output, actionResult } = await workerTurn(currentTour, mission, feedback)
        setMessages((prev) => [...prev, `🛠 ${actionResult}`, output])

        if (output.toLowerCase().includes('"action": "done"') || output.includes('{ "action": "done" }')) {
          setMessages((prev) => [...prev, `🏁 Mission terminée au tour ${currentTour}`])
          break
        }

        const shouldReview = kimiReviewer && currentTour % 10 === 0
        if (shouldReview) {
          setMessages((prev) => [...prev, `— Review Kimi tour ${currentTour}`])
          const review = await reviewTurn(currentTour, mission, output, actionResult, 'kimi')
          setMessages((prev) => [...prev, `👁 Kimi: ${review.slice(0, 500)}${review.length > 500 ? '…' : ''}`])
          if (review.includes('REVIEW_NEEDED') && !cancelRef.current) {
            feedback = `Corrections demandées par Kimi au tour ${currentTour}:\n${review}`
            continue
          }
        }

        if (gemmaFallback && !shouldReview && currentTour % 5 === 0) {
          const fallbackReview = await reviewTurn(currentTour, mission, output, actionResult, 'gemma')
          if (fallbackReview.includes('REVIEW_NEEDED')) {
            setMessages((prev) => [...prev, `👁 Gemma signale : ${fallbackReview.slice(0, 300)}…`])
            if (kimiReviewer) {
              feedback = `Gemma a signalé un problème au tour ${currentTour}. Kimi vérifiera au prochain multiple de 10. En attendant, corrige si possible.`
            } else {
              feedback = `Corrections suggérées par Gemma au tour ${currentTour}:\n${fallbackReview}`
              continue
            }
          }
        }

        feedback = `Tour précédent ${currentTour} exécuté. Continue la mission : ${mission}`
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
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ color: 'var(--tc-primary)', fontWeight: 600 }}>TrappistAI Multi-Agent</span>
          <label style={styles.check}>
            <input type="checkbox" checked={kimiReviewer} onChange={(e) => setKimiReviewer(e.target.checked)} />
            Kimi /10
          </label>
          <label style={styles.check}>
            <input type="checkbox" checked={gemmaFallback} onChange={(e) => setGemmaFallback(e.target.checked)} />
            Gemma /5
          </label>
        </div>
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
          <div style={styles.welcome}>Missionne le trio. Ex: "Crée un portfolio HTML/CSS/JS"</div>
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

      {logs.length > 0 && (
        <div style={styles.logs}>
          <div style={{ color: 'var(--tc-primary)', fontSize: 10, marginBottom: 4 }}>LOGS AGENTS</div>
          {logs.slice(-5).map((l, i) => (
            <div key={i} style={{ fontSize: 10, color: 'var(--tc-text-muted)' }}>
              T{l.tour} [{l.agent} / {l.role}] {l.summary}
            </div>
          ))}
        </div>
      )}
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
  check: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color: 'var(--tc-text-muted)',
    fontSize: '11px',
    cursor: 'pointer',
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
    fontFamily: "'Courier New', Consolas, monospace',
  },
  stopBtn: {
    backgroundColor: 'var(--tc-danger)',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '0 14px',
    cursor: 'pointer',
    fontFamily: "'Courier New', Consolas, monospace',
  },
  logs: {
    maxHeight: '90px',
    overflow: 'auto',
    padding: '6px 12px',
    borderTop: '1px solid var(--tc-border)',
    backgroundColor: 'var(--tc-bg)',
  },
}
