import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { useChatHistory } from '../hooks/useChatHistory'
import type React from 'react'

interface AgentPanelProps {
  githubToken: string
  isTokenValid: boolean
  selectedRepo: string | null
  openPath: string | null
  fileContent: string
  onApplyEdit: (content: string) => void
  workspace: string
}

interface Tour {
  tour?: number
  action?: string
  pensee?: string
}

interface AgentStatus {
  running: boolean
  tours: Tour[]
}

interface ModelOption {
  key: string
  label: string
  type: string
  description: string
}

type Mode = 'agent' | 'ask'

// Backend unifié (FastAPI) : tout passe par le port 4269
const API_BASE = 'http://localhost:4269'
const STATUS_URL = `${API_BASE}/agent/status`
const RUN_URL = `${API_BASE}/agent/run`
const STOP_URL = `${API_BASE}/agent/stop`
const ASK_URL = `${API_BASE}/ask`
const MODELS_URL = `${API_BASE}/models`

// Extrait le plus long bloc de code d une reponse (souvent le fichier complet).
function extractCode(text: string): string | null {
  const blocks = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1])
  if (blocks.length === 0) return null
  return blocks.reduce((a, b) => (b.length > a.length ? b : a)).replace(/\n$/, '')
}

export function AgentPanel({ workspace, openPath, fileContent, onApplyEdit }: AgentPanelProps) {
  const { messages, push, clear, updateLast, historyForLLM } = useChatHistory(workspace || '__global__')
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<Mode>('ask')
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [tourCount, setTourCount] = useState(0)
  const [selectedModel, setSelectedModel] = useState('gemma')
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const cancelRef = useRef(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Récupère la liste des modèles disponibles
  useEffect(() => {
    axios.get<{ models: ModelOption[] }>(MODELS_URL, { timeout: 5000 })
      .then(({ data }) => setModelOptions(data.models || []))
      .catch(() => setModelOptions([]))
  }, [])

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  const startPoll = () => {
    stopPoll()
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await axios.get<AgentStatus>(STATUS_URL, { timeout: 5000 })
        setTourCount(data.tours?.length || 0)
        setRunning(data.running)
        if (data.tours && data.tours.length > 0) {
          const last = data.tours[data.tours.length - 1]
          const line = last.pensee || last.action || `tour ${last.tour}`
          updateLast('system', { text: `Tour ${data.tours.length}: ${line}`, meta: { status: data.running ? 'running' : 'done' } })
        }
        if (!data.running) {
          stopPoll()
          setLoading(false)
        }
      } catch { /* ignore */ }
    }, 1000)
  }

  const fetchStatus = async () => {
    try {
      const { data } = await axios.get<AgentStatus>(STATUS_URL, { timeout: 5000 })
      setRunning(data.running)
      setTourCount(data.tours?.length || 0)
    } catch { /* ignore */ }
  }

  // Récupère l'état réel au montage (utile si reload alors que l'agent tourne)
  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, 2000)
    return () => clearInterval(id)
  }, [])

  const runAgent = async () => {
    const mission = input.trim()
    if (!mission || running) return
    cancelRef.current = false
    setLoading(true)
    setRunning(true)
    setInput('')
    push({ role: 'user', text: mission })
    push({ role: 'system', text: `Agent ${selectedModel} démarré…` })
    startPoll()

    try {
      // On n'envoie plus d'extrait tronqué du fichier (coupé en plein milieu, l'agent le recopiait tel quel).
      // On donne seulement le chemin : l'agent lit le fichier complet lui-même avec read_file.
      const ctx = openPath
        ? `Fichier actuellement ouvert dans l'éditeur : ${openPath} (utilise read_file pour lire son contenu complet si nécessaire).`
        : ''
      const fullMission = ctx ? `${mission}\n\nCONTEXTE:\n${ctx}` : mission
      const { data } = await axios.post<{ resume: string; status: string; tours: Tour[] }>(
        RUN_URL,
        { objectif: fullMission, workspace: workspace || '', max_tours: 20, model: selectedModel },
        { timeout: 600_000 },
      )
      const nbTours = data.tours?.length || 0
      setTourCount(nbTours)

      // data.resume = vraie réponse de l'agent (args.resume du done), calculée par le backend.
      // On ne l'écrase plus avec le dernier tour (souvent le "summary" générique).
      const summary = (data.resume || '').trim() || 'Mission terminée (aucun résumé fourni).'
      const isError = data.status === 'error'

      // Ligne système = simple statut ; le texte complet n'est affiché qu'une fois (message agent).
      updateLast('system', {
        text: isError ? 'Erreur' : `Terminé en ${nbTours} tour${nbTours > 1 ? 's' : ''}`,
        meta: { status: data.status },
      })
      push({ role: isError ? 'error' : 'agent', text: summary })
    } catch (e: any) {
      const err = e?.response?.data?.detail || e?.response?.data?.error || e.message || 'Erreur inconnue'
      updateLast('system', { text: 'Erreur', meta: { status: 'error' } })
      push({ role: 'error', text: `Erreur agent: ${err}` })
    } finally {
      stopPoll()
      setLoading(false)
      setRunning(false)
      cancelRef.current = false
    }
  }

  const ask = async () => {
    const question = input.trim()
    if (!question) return
    setInput('')
    push({ role: 'user', text: question })
    push({ role: 'system', text: 'Réflexion…' })
    try {
      const history = historyForLLM()
      // on retire la dernière entrée user qu'on envoie explicitement
      const previous = history.slice(0, -1)
      const { data } = await axios.post<{ final: string }>(ASK_URL, {
        question,
        workspace: workspace || '__global__',
        history: previous,
        file_content: fileContent || '',
        file_path: openPath || '',
        model: selectedModel,
      }, { timeout: 120_000 })
      const answer = data.final || 'Pas de réponse'
      updateLast('system', { text: 'Réponse reçue', meta: { status: 'ok' } })
      push({ role: 'agent', text: answer })
    } catch (e: any) {
      const err = e?.response?.data?.detail || e?.response?.data?.error || e.message
      push({ role: 'error', text: `Erreur: ${err}` })
    }
  }

  const applyToFile = (code: string) => {
    if (!openPath) return
    if (!window.confirm(`Remplacer le contenu de ${openPath} par ce code ?`)) return
    onApplyEdit(code)
    push({ role: 'system', text: `Code appliqué à ${openPath}.` })
  }

  const submit = () => {
    if (mode === 'agent') {
      void runAgent()
    } else {
      void ask()
    }
  }

  const stop = async () => {
    cancelRef.current = true
    try {
      await axios.post(STOP_URL, {}, { timeout: 5000 })
    } catch (e: any) {
      // ignore
    }
    setRunning(false)
    setLoading(false)
    stopPoll()
    push({ role: 'system', text: "Arrêt demandé par l'utilisateur." })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const currentModelLabel = modelOptions.find(m => m.key === selectedModel)?.label || selectedModel

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--tc-primary)', fontWeight: 600 }}>Trappist Agent</span>
          <span style={{ ...styles.badge, backgroundColor: running ? 'var(--tc-primary)' : 'var(--tc-bg-elevated)', color: running ? 'var(--tc-bg)' : 'var(--tc-text-muted)' }}>
            {running ? `running t${tourCount}` : 'idle'}
          </span>
          <span style={{ ...styles.badge, backgroundColor: 'var(--tc-bg-elevated)', color: 'var(--tc-text-muted)' }} title={currentModelLabel}>
            {selectedModel}
          </span>
        </div>
        <button onClick={clear} style={styles.clearBtn} title="Effacer l'historique">🗑</button>
      </div>

      <div style={styles.messages}>
        {messages.length === 0 && (
          <div style={styles.welcome}>
            <strong>Trappist Agent</strong><br />
            <strong>Ask</strong> : discussion avec mémoire du workspace.<br />
            <strong>Agent</strong> : exécute des actions sur les fichiers.<br />
            Choisis un modèle ci-dessous, comme dans Copilot.
          </div>
        )}
        {messages.map((msg) => {
          const color = msg.role === 'user' ? 'var(--tc-text)' : msg.role === 'error' ? 'var(--tc-danger)' : 'var(--tc-text-muted)'
          const bg = msg.role === 'user' ? 'var(--tc-selected)' : 'var(--tc-bg-elevated)'
          const code = msg.role === 'agent' && openPath ? extractCode(msg.text) : null
          const label = msg.role === 'user' ? 'You' : msg.role === 'agent' ? 'Agent' : msg.role === 'error' ? 'Erreur' : '•'
          return (
            <div key={msg.id} style={{ ...styles.message, backgroundColor: bg, borderColor: msg.role === 'error' ? 'var(--tc-danger)' : 'var(--tc-border)' }}>
              <div style={{ ...styles.label, color }}>{label}</div>
              <div style={{ color: 'var(--tc-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.text}</div>
              {code && (
                <button onClick={() => applyToFile(code)} title={`Remplacer ${openPath}`} style={{ marginTop: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', backgroundColor: 'var(--tc-primary)', color: 'var(--tc-bg)', border: 'none', borderRadius: 4 }}>
                  Appliquer au fichier
                </button>
              )}
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <div style={styles.inputBar}>
        <div style={styles.modeToggle}>
          <button
            onClick={() => setMode('ask')}
            style={{ ...styles.modeBtn, ...(mode === 'ask' ? styles.modeActive : {}) }}
            title="Discussion avec mémoire"
          >
            Ask
          </button>
          <button
            onClick={() => setMode('agent')}
            style={{ ...styles.modeBtn, ...(mode === 'agent' ? styles.modeActive : {}) }}
            title="Lance l'agent autonome"
          >
            Agent
          </button>
        </div>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          style={styles.modelSelect}
          title="Choisir le modèle (solo, comme Copilot)"
          disabled={loading || running}
        >
          {modelOptions.length === 0 && <option value="gemma">Gemma 4 12B (local)</option>}
          {modelOptions.map((m) => (
            <option key={m.key} value={m.key} title={m.description}>
              {m.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={mode === 'agent' ? "Mission : crée une landing page pour Trappist…" : "Pose ta question…"}
          disabled={loading}
          style={styles.input}
        />
        <button onClick={submit} disabled={loading || !input.trim()} style={styles.sendBtn} title={mode === 'agent' ? "Lancer l'agent" : "Envoyer"}>
          {running ? '⏳' : '➤'}
        </button>
        {running && <button onClick={stop} style={styles.stopBtn}>■</button>}
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
  badge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '10px',
    border: '1px solid var(--tc-border)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  clearBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--tc-text-muted)',
    cursor: 'pointer',
    fontSize: '12px',
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
    fontSize: '12px',
    lineHeight: 1.5,
  },
  message: {
    padding: '8px 10px',
    borderRadius: '6px',
    border: '1px solid var(--tc-border)',
    color: 'var(--tc-text)',
    fontSize: '12px',
  },
  label: {
    fontSize: '10px',
    fontWeight: 600,
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  inputBar: {
    display: 'flex',
    gap: '8px',
    padding: '10px',
    borderTop: '1px solid var(--tc-border)',
    flexShrink: 0,
    alignItems: 'center',
  },
  modeToggle: {
    display: 'flex',
    gap: '4px',
    backgroundColor: 'var(--tc-bg-elevated)',
    border: '1px solid var(--tc-border)',
    borderRadius: '4px',
    padding: '2px',
  },
  modeBtn: {
    // backgroundColor (et pas "background") : évite le warning React avec modeActive
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--tc-text-muted)',
    cursor: 'pointer',
    fontSize: '11px',
    padding: '5px 9px',
    borderRadius: '3px',
    fontWeight: 600,
    fontFamily: "'Courier New', Consolas, monospace",
  },
  modeActive: {
    backgroundColor: 'var(--tc-primary)',
    color: 'var(--tc-bg)',
  },
  modelSelect: {
    backgroundColor: 'var(--tc-bg-elevated)',
    border: '1px solid var(--tc-border)',
    borderRadius: '4px',
    padding: '6px 8px',
    color: 'var(--tc-text)',
    fontFamily: "'Courier New', Consolas, monospace",
    fontSize: '11px',
    outline: 'none',
    maxWidth: '140px',
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
