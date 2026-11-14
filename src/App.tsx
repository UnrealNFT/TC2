import { useState, useCallback, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { FileExplorer } from './components/FileExplorer'
import { GitPanel } from './components/GitPanel'
import { TabbedEditor } from './components/TabbedEditor'
import { PreviewPanel } from './components/PreviewPanel'
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
  const [showPreview, setShowPreview] = useState(true)
  const [showBottom, setShowBottom] = useState(true)
  const [bottomTab, setBottomTab] = useState<BottomTab>('agent')
  const [backendOk, setBackendOk] = useState<boolean | null>(null)

  const [selectedAgent, setSelectedAgent] = useState<any>('groq')
  const [githubToken, setGithubToken] = useState('')
  const [isTokenValid, setIsTokenValid] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)

  useEffect(() => {
    localApi.health().then(() => setBackendOk(true)).catch(() => setBackendOk(false))
  }, [])

  useEffect(() => {
    if (activePath && sidebarView === 'projects') {
      setSidebarView('files')
    }
  }, [activePath, sidebarView])

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
    } catch (e) {
      console.error(e)
    }
  }, [openFiles])

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
  }, [])

  const handleAddWorkspace = async () => {
    const input = window.prompt('Chemin absolu du dossier projet :')
    if (!input) return
    try {
      localApi.setWorkspace(input)
      await localApi.listFiles('')
      addWorkspace(input)
      setRefreshKey((k) => k + 1)
    } catch (e: any) {
      alert('Impossible d\'ouvrir : ' + e.message)
    }
  }

  const handleNewProject = async () => {
    const name = window.prompt('Nom du nouveau projet :')
    if (!name || !activePath) return
    const template = window.prompt('Template ? (vanilla, react, node)', 'vanilla') || 'vanilla'
    try {
      await localApi.createProject(name, template)
      setRefreshKey((k) => k + 1)
    } catch (e: any) {
      alert('Erreur création : ' + e.message)
    }
  }

  const handleSelectWorkspace = (path: string) => {
    setActive(path)
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
      <label style={{ fontSize: '12px', color: 'var(--tc-text-muted)' }}>Agent Worker</label>
      <select
        value={selectedAgent}
        onChange={(e) => setSelectedAgent(e.target.value)}
        style={styles.input}
      >
        <option value="groq">Groq</option>
        <option value="kimi">Kimi</option>
        <option value="claude">Claude</option>
        <option value="kimi-wavespeed">Kimi WaveSpeed</option>
        <option value="trappist-local">Trappist Local</option>
      </select>

      <label style={{ fontSize: '12px', color: 'var(--tc-text-muted)' }}>GitHub Token</label>
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

  return (
    <div style={styles.app}>
      <div style={styles.titleBar}>
        <span style={{ color: 'var(--tc-primary)', textShadow: '0 0 10px rgba(0,255,65,0.5)', fontWeight: 600 }}>
          TrappistCode IDE
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', color: backendOk ? 'var(--tc-primary)' : 'var(--tc-danger)' }}>
            {backendOk ? 'backend ok' : 'backend OFF — lance node server/index.js'}
          </span>
          <button onClick={() => setShowPreview(!showPreview)} style={styles.topBtn}>
            {showPreview ? '✕ Preview' : 'Preview'}
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
            {showPreview && <PreviewPanel workspace={activePath} activeFile={activeFilePath} />}
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
                  selectedAgent={selectedAgent}
                  githubToken={githubToken}
                  isTokenValid={isTokenValid}
                  selectedRepo={selectedRepo}
                  openPath={activeFilePath}
                  fileContent={activeContent}
                  onApplyEdit={applyEdit}
                  workspace={activePath}
                />
              ) : (
                <TerminalPanel />
              )}
            </div>
          )}
        </div>
      </div>

      <div style={styles.statusBar}>
        <span>{activePath ? activePath : 'Aucun workspace'}</span>
        <span style={{ marginLeft: 'auto' }}>{selectedAgent}</span>
        {selectedRepo && <span>{selectedRepo}</span>}
        {activeFilePath && <span>{activeFilePath}</span>}
      </div>
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