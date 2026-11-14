import type React from 'react'
import { useState, useCallback, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { FileExplorer } from './components/FileExplorer'
import { GitPanel } from './components/GitPanel'
import { TabbedEditor } from './components/TabbedEditor'
import { AgentPanel } from './components/AgentPanel'
import { TerminalPanel } from './components/TerminalPanel'
import { useWorkspace } from './hooks/useWorkspace'
import { useGitHubRepos } from './hooks/useGitHubRepos'
import { localApi } from './services/localApi'
import type { SidebarView, OpenFile } from './types/ide'

type BottomTab = 'agent' | 'terminal'

function App() {
  const { workspaces, activePath, addWorkspace, removeWorkspace, setActive } = useWorkspace()
  const { repos, fetchRepos } = useGitHubRepos()
  const [sidebarView, setSidebarView] = useState<SidebarView>('projects')
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showBottom, setShowBottom] = useState(true)
  const [bottomTab, setBottomTab] = useState<BottomTab>('agent')
  const [backendOk, setBackendOk] = useState<boolean | null>(null)
  const [previewFloating, setPreviewFloating] = useState<null | { x: number; y: number; w: number; h: number }>(null)
  const [previewKey, setPreviewKey] = useState(0)

  const [githubToken, setGithubToken] = useState('')
  const [isTokenValid, setIsTokenValid] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [kimiEnabled, setKimiEnabled] = useState(false)

  useEffect(() => {
    localApi.health().then(() => setBackendOk(true)).catch(() => setBackendOk(false))
  }, [])

  useEffect(() => {
    if (activePath && sidebarView === 'projects') {
      setSidebarView('files')
    }
  }, [activePath, sidebarView])

  const refreshPreview = useCallback(() => {
    setPreviewKey((k) => k + 1)
  }, [])

  const openFile = useCallback(async (path: string) => {
    try {
      const existing = openFiles.find((f) => f.path === path)
      if (existing) {
        setActiveFilePath(path)
        setBottomTab('agent')
        return
      }
      const data = await localApi.readFile(path)
      const file = { path: data.path, content: data.content, savedContent: data.content }
      setOpenFiles((prev) => [...prev, file])
      setActiveFilePath(path)
      setBottomTab('agent')
      if (['html', 'htm'].includes(path.split('.').pop() || '')) {
        refreshPreview()
      }
    } catch (e) {
      console.error(e)
    }
  }, [openFiles, refreshPreview])

  const closeFile = useCallback((path: string) => {
    setOpenFiles((prev) => {
      const next = prev.filter((f) => f.path !== path)
      if (activeFilePath === path) {
        setActiveFilePath(next.length > 0 ? next[next.length - 1].path : null)
      }
      return next
    })
  }, [activeFilePath])

  const changeFileContent = useCallback((path: string, content: string) => {
    setOpenFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content } : f)))
  }, [])

  const markSaved = useCallback((path: string) => {
    setOpenFiles((prev) => prev.map((f) => (f.path === path ? { ...f, savedContent: f.content } : f)))
    refreshPreview()
  }, [refreshPreview])

  const requestDirectory = async (fallbackName: string): Promise<string> => {
    if (!('showDirectoryPicker' in window)) {
      throw new Error('File System Access API non supportée. Utilise Chrome/Edge.')
    }
    const handle = await (window as any).showDirectoryPicker()
    const name = handle?.name || fallbackName || 'workspace'

    const absPath = window.prompt(`Chemin absolu du dossier « ${name} » :`, `C:\\Users\\Djaf\\${sanitizeName(name)}`)
    if (!absPath) throw new Error('Aucun chemin fourni')
    return absPath.trim()
  }

  function sanitizeName(n: string) {
    return (n || 'workspace').replace(/[<>:"/\\|?*]+/g, '_').slice(0, 60)
  }

  const handleAddWorkspace = async () => {
    try {
      const absPath = await requestDirectory('nouveau-projet')
      localApi.setWorkspace(absPath)
      await localApi.listFiles('')
      addWorkspace(absPath)
      setRefreshKey((k) => k + 1)
    } catch (e: any) {
      if (e.message?.includes('non supportée')) {
        const input = window.prompt('Chemin absolu du dossier projet :', 'C:\\Users\\Djaf\\MonProjet')
        if (!input) return
        localApi.setWorkspace(input.trim())
        await localApi.listFiles('')
        addWorkspace(input.trim())
        setRefreshKey((k) => k + 1)
      }
    }
  }

  const handleNewProject = async () => {
    const name = window.prompt('Nom du nouveau projet :')
    if (!name) return

    let base = activePath
    if (!base) {
      const input = window.prompt('Dossier parent (chemin absolu) :', 'C:\\Users\\Djaf\\')
      if (!input) return
      base = input.trim()
    }

    const template = window.prompt('Template ? (vanilla, react, node)', 'vanilla') || 'vanilla'

    try {
      localApi.setWorkspace(base)
      await localApi.createProject(name, template)
      if (!activePath) {
        addWorkspace(base)
      }
      setRefreshKey((k) => k + 1)
      setSidebarView('files')
    } catch (e: any) {
      alert('Erreur création : ' + e.message)
      console.error(e)
    }
  }

  const handleSelectWorkspace = (path: string) => {
    setActive(path)
    localApi.setWorkspace(path)
    setOpenFiles([])
    setActiveFilePath(null)
    setRefreshKey((k) => k + 1)
  }

  const connectGitHub = async () => {
    if (!githubToken) return
    try {
      await fetchRepos(githubToken)
      setIsTokenValid(true)
    } catch {
      setIsTokenValid(false)
    }
  }

  const applyEdit = useCallback((content: string) => {
    if (!activeFilePath) return
    changeFileContent(activeFilePath, content)
  }, [activeFilePath, changeFileContent])

  const sidebarExtra = sidebarView === 'files' ? (
    <FileExplorer activePath={activePath} onOpenFile={openFile} refreshKey={refreshKey} />
  ) : sidebarView === 'git' ? (
    <GitPanel activePath={activePath} refreshKey={refreshKey} />
  ) : sidebarView === 'settings' ? (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontSize: '13px', color: 'var(--tc-primary)', fontWeight: 600 }}>Agents</div>
      <div style={{ fontSize: '11px', color: 'var(--tc-text-dim)' }}>
        Local: Gemma (Ollama) via localhost:8000/ask
      </div>

      <label style={styles.check}>
        <input type="checkbox" checked={kimiEnabled} onChange={(e) => setKimiEnabled(e.target.checked)} />
        Activer Kimi (review /10 + secours si bloqué)
      </label>

      <label style={{ fontSize: '12px', color: 'var(--tc-text-muted)', marginTop: 8 }}>GitHub Token</label>
      <input
        type="password"
        value={githubToken}
        onChange={(e) => setGithubToken(e.target.value)}
        placeholder="ghp_..."
        style={styles.input}
      />
      <button onClick={connectGitHub} style={styles.btn}>Connecter GitHub</button>

      <label style={{ fontSize: '12px', color: 'var(--tc-text-muted)' }}>Repo actif</label>
      <select
        value={selectedRepo || ''}
        onChange={(e) => setSelectedRepo(e.target.value || null)}
        style={styles.input}
      >
        <option value="">— sélectionner —</option>
        {repos.map((r) => (
          <option key={r.id} value={r.full_name}>{r.private ? '🔒' : '🌐'} {r.full_name}</option>
        ))}
      </select>
    </div>
  ) : null

  const activeContent = activeFilePath ? openFiles.find((f) => f.path === activeFilePath)?.content || '' : ''

  const previewEntry = activeFilePath && ['html', 'htm'].includes(activeFilePath.split('.').pop() || '')
    ? activeFilePath
    : 'index.html'

  return (
    <div style={styles.app}>
      <div style={styles.titleBar}>
        <span style={{ color: 'var(--tc-primary)', textShadow: '0 0 10px rgba(0,255,65,0.5)', fontWeight: 600 }}>
          TrappistCode IDE
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', color: backendOk ? 'var(--tc-primary)' : 'var(--tc-danger)' }}>
            {backendOk ? 'backend ok' : 'backend OFF'}
          </span>
          <button onClick={() => setPreviewFloating({ x: 800, y: 80, w: 480, h: 320 })} style={styles.topBtn}>
            Preview flottante
          </button>
          <button onClick={() => setShowBottom(!showBottom)} style={styles.topBtn}>
            {showBottom ? '✕ Bottom' : 'Bottom'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Sidebar
          view={sidebarView}
          onChangeView={setSidebarView}
          workspaces={workspaces}
          activePath={activePath}
          onAddWorkspace={handleAddWorkspace}
          onNewProject={handleNewProject}
          onSelectWorkspace={handleSelectWorkspace}
          onRemoveWorkspace={removeWorkspace}
          extra={sidebarExtra}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <TabbedEditor
              files={openFiles}
              activePath={activeFilePath}
              onActivate={setActiveFilePath}
              onClose={closeFile}
              onChange={changeFileContent}
              onSave={markSaved}
              workspace={activePath}
            />
          </div>

          {showBottom && (
            <div style={{ height: '280px', borderTop: '1px solid var(--tc-border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <div style={{ display: 'flex', backgroundColor: 'var(--tc-bg-elevated)', borderBottom: '1px solid var(--tc-border)' }}>
                {(['agent', 'terminal'] as BottomTab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setBottomTab(t)}
                    style={{
                      padding: '6px 14px',
                      backgroundColor: bottomTab === t ? 'var(--tc-selected)' : 'transparent',
                      color: bottomTab === t ? 'var(--tc-primary)' : 'var(--tc-text-muted)',
                      border: 'none',
                      borderRight: '1px solid var(--tc-border)',
                      cursor: 'pointer',
                      fontFamily: "'Courier New', Consolas, monospace",
                      fontSize: '12px',
                    }}
                  >
                    {t === 'agent' ? '🤖 Agent' : '⌨ Terminal'}
                  </button>
                ))}
              </div>
              {bottomTab === 'agent' ? (
                <AgentPanel
                  githubToken={githubToken}
                  isTokenValid={isTokenValid}
                  selectedRepo={selectedRepo}
                  openPath={activeFilePath}
                  fileContent={activeContent}
                  onApplyEdit={applyEdit}
                  workspace={activePath}
                  kimiEnabled={kimiEnabled}
                />
              ) : (
                <TerminalPanel />
              )}
            </div>
          )}
        </div>
      </div>

      {previewFloating && (
        <FloatingPreview
          key={previewKey}
          workspace={activePath}
          entry={previewEntry}
          initial={previewFloating}
          onClose={() => setPreviewFloating(null)}
        />
      )}

      <div style={styles.statusBar}>
        <span>{activePath ? activePath : 'Aucun workspace'}</span>
        {kimiEnabled && <span>Kimi ON</span>}
        {selectedRepo && <span>{selectedRepo}</span>}
        {activeFilePath && <span>{activeFilePath}</span>}
      </div>
    </div>
  )
}

function FloatingPreview({ workspace, entry, initial, onClose }: { workspace: string; entry: string; initial: { x: number; y: number; w: number; h: number }; onClose: () => void }) {
  const [pos, setPos] = useState(initial)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const url = `http://localhost:4269/api/preview/${entry}?base=${encodeURIComponent(workspace)}`

  const onMouseDown = (e: React.MouseEvent) => {
    setDragging(true)
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging || !dragRef.current) return
      const ref = dragRef.current
      setPos((p) => ({ ...p, x: e.clientX - ref.dx, y: e.clientY - ref.dy }))
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  const grow = () => setPos((p) => ({ ...p, w: p.w + 40, h: p.h + 40 }))
  const shrink = () => setPos((p) => ({ ...p, w: Math.max(200, p.w - 40), h: Math.max(150, p.h - 40) }))

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: pos.w,
        height: pos.h,
        backgroundColor: 'var(--tc-bg)',
        border: '1px solid var(--tc-border)',
        boxShadow: '0 0 20px rgba(0,255,65,0.2)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        onMouseDown={onMouseDown}
        style={{
          height: '28px',
          backgroundColor: 'var(--tc-bg-soft)',
          borderBottom: '1px solid var(--tc-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
          cursor: dragging ? 'grabbing' : 'grab',
          fontSize: '11px',
        }}
      >
        <span style={{ color: 'var(--tc-primary)' }}>{entry}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={grow} style={styles.ctlBtn}>+</button>
          <button onClick={shrink} style={styles.ctlBtn}>-</button>
          <button onClick={onClose} style={styles.ctlBtn}>✕</button>
        </div>
      </div>
      <iframe src={url} style={{ flex: 1, border: 'none', backgroundColor: '#fff' }} title="floating-preview" />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: 'var(--tc-bg)',
    color: 'var(--tc-text)',
    fontFamily: "'Courier New', Consolas, monospace",
    overflow: 'hidden',
  },
  titleBar: {
    height: '36px',
    backgroundColor: 'var(--tc-bg-soft)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    fontSize: '13px',
    flexShrink: 0,
    borderBottom: '1px solid var(--tc-border)',
    justifyContent: 'space-between',
  },
  topBtn: {
    backgroundColor: 'var(--tc-bg-elevated)',
    color: 'var(--tc-primary)',
    border: '1px solid var(--tc-border)',
    borderRadius: '4px',
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: '11px',
    fontFamily: "'Courier New', Consolas, monospace",
  },
  ctlBtn: {
    background: 'transparent',
    border: '1px solid var(--tc-border)',
    color: 'var(--tc-primary)',
    cursor: 'pointer',
    fontSize: '10px',
    padding: '2px 6px',
  },
  check: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: 'var(--tc-text)',
    cursor: 'pointer',
  },
  input: {
    backgroundColor: 'var(--tc-bg-elevated)',
    color: 'var(--tc-text)',
    border: '1px solid var(--tc-border)',
    borderRadius: '4px',
    padding: '6px',
    fontFamily: "'Courier New', Consolas, monospace",
  },
  btn: {
    backgroundColor: 'var(--tc-primary)',
    color: 'var(--tc-bg)',
    border: 'none',
    borderRadius: '4px',
    padding: '6px',
    cursor: 'pointer',
    fontWeight: 600,
    fontFamily: "'Courier New', Consolas, monospace",
  },
  statusBar: {
    height: '28px',
    backgroundColor: 'var(--tc-bg-elevated)',
    color: 'var(--tc-primary)',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: '16px',
    flexShrink: 0,
    borderTop: '1px solid var(--tc-border)',
  },
}

export default App
