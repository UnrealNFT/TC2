import type React from 'react'
import { useState, useCallback, useEffect, useMemo } from 'react'
import { MenuBar } from './components/MenuBar'
import { Sidebar } from './components/Sidebar'
import { ProjectExplorer } from './components/ProjectExplorer'
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

const FILES_KEY = 'trappistcode-openfiles'
const ACTIVE_FILE_KEY = 'trappistcode-activefile'

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
  const [showPreview, setShowPreview] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)
  const [githubToken, setGithubToken] = useState('')
  const [isTokenValid, setIsTokenValid] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [kimiEnabled, setKimiEnabled] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    localApi.health().then(() => setBackendOk(true)).catch(() => setBackendOk(false))
    const id = setInterval(() => {
      localApi.health().then(() => setBackendOk(true)).catch(() => setBackendOk(false))
    }, 10_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!activePath) return
    try {
      const raw = localStorage.getItem(`${FILES_KEY}::${activePath}`)
      const active = localStorage.getItem(`${ACTIVE_FILE_KEY}::${activePath}`)
      if (raw) {
        const parsed = JSON.parse(raw) as OpenFile[]
        setOpenFiles(parsed)
        if (active && parsed.find((f) => f.path === active)) {
          setActiveFilePath(active)
        } else if (parsed.length > 0) {
          setActiveFilePath(parsed[0].path)
        }
      }
    } catch { /* ignore */ }
  }, [activePath])

  useEffect(() => {
    if (!activePath) return
    localStorage.setItem(`${FILES_KEY}::${activePath}`, JSON.stringify(openFiles))
    if (activeFilePath) {
      localStorage.setItem(`${ACTIVE_FILE_KEY}::${activePath}`, activeFilePath)
    }
  }, [openFiles, activeFilePath, activePath])

  const refreshPreview = useCallback(() => {
    setPreviewKey((k) => k + 1)
  }, [])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }, [])

  const openFile = useCallback(async (path: string) => {
    try {
      const existing = openFiles.find((f) => f.path === path)
      if (existing) {
        setActiveFilePath(path)
        return
      }
      const data = await localApi.readFile(path)
      const file = { path: data.path, content: data.content, savedContent: data.content }
      setOpenFiles((prev) => [...prev, file])
      setActiveFilePath(path)
      if (['html', 'htm'].includes(path.split('.').pop() || '')) {
        refreshPreview()
      }
    } catch (e: any) {
      showToast(`Erreur ouverture fichier : ${e.message}`)
      console.error(e)
    }
  }, [openFiles, refreshPreview, showToast])

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

  const markSaved = useCallback(async (path: string) => {
    const file = openFiles.find((f) => f.path === path)
    if (!file) return
    try {
      await localApi.writeFile(path, file.content)
      setOpenFiles((prev) => prev.map((f) => (f.path === path ? { ...f, savedContent: f.content } : f)))
      refreshPreview()
      showToast('Fichier enregistré')
    } catch (e: any) {
      showToast(`Erreur sauvegarde : ${e.message}`)
    }
  }, [openFiles, refreshPreview, showToast])

  const requestDirectory = async (): Promise<string> => {
    let name = 'workspace'
    try {
      const handle = await (window as any).showDirectoryPicker()
      name = handle?.name || 'workspace'
    } catch { /* picker non supporté ou annulé */ }
    const defaultPath = `C:\\Users\\Djaf\\${sanitizeName(name)}`
    const absPath = window.prompt(`Chemin absolu du dossier « ${name} » :`, defaultPath)
    if (!absPath) throw new Error('Aucun chemin fourni')
    return absPath.trim()
  }

  function sanitizeName(n: string) {
    return (n || 'workspace').replace(/[<>:"\\/|?*]+/g, '_').slice(0, 60)
  }

  const handleAddWorkspace = async () => {
    try {
      const absPath = await requestDirectory()
      localApi.setWorkspace(absPath)
      await localApi.mkdir('')
      await localApi.listFiles('')
      addWorkspace(absPath)
      setActive(absPath)
      setSidebarView('files')
      setRefreshKey((k) => k + 1)
      showToast(`Workspace ouvert : ${absPath}`)
    } catch (e: any) {
      console.error(e)
      const fallback = window.prompt('Chemin absolu du dossier projet :', 'C:\\Users\\Djaf\\MonProjet')
      if (!fallback) return
      try {
        localApi.setWorkspace(fallback.trim())
        await localApi.listFiles('')
        addWorkspace(fallback.trim())
        setActive(fallback.trim())
        setSidebarView('files')
        setRefreshKey((k) => k + 1)
        showToast(`Workspace ouvert : ${fallback.trim()}`)
      } catch (e2: any) {
        showToast(`Impossible d'ouvrir : ${e2.message}`)
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
      if (!workspaces.find((w) => w.path === base)) {
        addWorkspace(base || '')
      }
      setRefreshKey((k) => k + 1)
      setSidebarView('files')
      showToast(`Projet « ${name} » créé`)
    } catch (e: any) {
      showToast(`Erreur création : ${e.message}`)
      console.error(e)
    }
  }

  const handleSelectWorkspace = (path: string) => {
    if (!/^[a-zA-Z]:[\\/]/.test(path) && !path.startsWith('/') && !path.startsWith('\\\\')) return
    setActive(path)
    localApi.setWorkspace(path)
    setOpenFiles([])
    setActiveFilePath(null)
    setSidebarView('files')
    setRefreshKey((k) => k + 1)
  }

  const handleSaveAll = useCallback(async () => {
    for (const f of openFiles) {
      if (f.content !== f.savedContent) {
        await markSaved(f.path)
      }
    }
  }, [openFiles, markSaved])

  const exportZip = async () => {
    if (!activePath) return showToast('Aucun workspace actif')
    try {
      const blob = await localApi.exportZip()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${activePath.split(/[/\\]/).pop() || 'trappist-export'}.zip`
      a.click()
      URL.revokeObjectURL(url)
      showToast('Export ZIP téléchargé')
    } catch (e: any) {
      showToast(`Erreur export : ${e.message}`)
    }
  }

  const importZip = async () => {
    if (!activePath) return showToast('Aucun workspace actif')
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        await localApi.importZip(file)
        setRefreshKey((k) => k + 1)
        showToast('Workspace importé')
      } catch (err: any) {
        showToast(`Erreur import : ${err.message}`)
      }
    }
    input.click()
  }

  const connectGitHub = async () => {
    if (!githubToken) return
    try {
      await fetchRepos(githubToken)
      setIsTokenValid(true)
      showToast('GitHub connecté')
    } catch {
      setIsTokenValid(false)
      showToast('Token GitHub invalide')
    }
  }

  const applyEdit = useCallback((content: string) => {
    if (!activeFilePath) return
    changeFileContent(activeFilePath, content)
  }, [activeFilePath, changeFileContent])

  const activeContent = activeFilePath ? openFiles.find((f) => f.path === activeFilePath)?.content || '' : ''

  const previewEntry = useMemo(() => {
    if (activeFilePath && ['html', 'htm'].includes(activeFilePath.split('.').pop() || '')) return activeFilePath
    return 'index.html'
  }, [activeFilePath])

  const isPreviewable = activeFilePath && ['html', 'htm'].includes(activeFilePath.split('.').pop() || '')

  const sidebarExtra = sidebarView === 'files' ? (
    <FileExplorer activePath={activePath} onOpenFile={openFile} refreshKey={refreshKey} />
  ) : sidebarView === 'git' ? (
    <GitPanel activePath={activePath} refreshKey={refreshKey} />
  ) : sidebarView === 'settings' ? (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontSize: '13px', color: 'var(--tc-primary)', fontWeight: 600 }}>Configuration</div>

      <label style={styles.check}>
        <input type="checkbox" checked={kimiEnabled} onChange={(e) => setKimiEnabled(e.target.checked)} />
        Activer Kimi review
      </label>

      <label style={{ fontSize: '12px', color: 'var(--tc-text-muted)', marginTop: 8 }}>GitHub Token</label>
      <input
        type="password"
        value={githubToken}
        onChange={(e) => setGithubToken(e.target.value)}
        placeholder="ghp_..."
        style={styles.input}
      />
      <button onClick={connectGitHub} style={styles.btn}>{isTokenValid ? '✓ GitHub connecté' : 'Connecter GitHub'}</button>

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

      <button onClick={exportZip} style={{ ...styles.btn, backgroundColor: 'var(--tc-bg-elevated)', color: 'var(--tc-primary)' }}>
        📦 Exporter workspace
      </button>
      <button onClick={importZip} style={{ ...styles.btn, backgroundColor: 'var(--tc-bg-elevated)', color: 'var(--tc-primary)' }}>
        📥 Importer ZIP
      </button>
    </div>
  ) : null

  return (
    <div style={styles.app}>
      {toast && <div style={styles.toast}>{toast}</div>}

      <MenuBar
        onOpenFolder={handleAddWorkspace}
        onNewProject={handleNewProject}
        onSave={() => activeFilePath && markSaved(activeFilePath)}
        onSaveAll={handleSaveAll}
        onExportZip={exportZip}
        onImportZip={importZip}
        onTogglePreview={() => setShowPreview((p) => !p)}
        previewOpen={showPreview}
      />

      <div style={styles.titleBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--tc-primary)', textShadow: '0 0 10px rgba(0,255,65,0.5)', fontWeight: 600 }}>
            TrappistCode IDE
          </span>
          <span style={{ ...styles.badge, color: backendOk ? 'var(--tc-primary)' : 'var(--tc-danger)', borderColor: backendOk ? 'var(--tc-primary)' : 'var(--tc-danger)' }}>
            {backendOk ? '● backend' : '○ backend OFF'}
          </span>
          {activePath && <span style={{ ...styles.badge, color: 'var(--tc-text-muted)' }} title={activePath}>📁 {activePath.split(/[/\\]/).pop()}</span>}
          {isTokenValid && <span style={{ ...styles.badge, color: '#58a6ff', borderColor: '#58a6ff' }}>🐙 GitHub</span>}
          {kimiEnabled && <span style={{ ...styles.badge, color: '#7ee787', borderColor: '#7ee787' }}>🌙 Kimi</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isPreviewable && (
            <button onClick={() => setShowPreview((p) => !p)} style={styles.topBtn}>
              {showPreview ? '✕ Preview' : '▣ Preview'}
            </button>
          )}
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
          extra={sidebarView === 'projects' ? (
            <ProjectExplorer
              activePath={activePath}
              onSelectProject={handleSelectWorkspace}
              onNewProject={handleNewProject}
              refreshKey={refreshKey}
            />
          ) : sidebarExtra}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <div style={{ flex: showPreview ? 1 : 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
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

            {showPreview && activePath && (
              <div style={{ width: '45%', borderLeft: '1px solid var(--tc-border)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ height: 28, backgroundColor: 'var(--tc-bg-soft)', borderBottom: '1px solid var(--tc-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', fontSize: 11 }}>
                  <span style={{ color: 'var(--tc-primary)' }}>Preview : {previewEntry}</span>
                  <button onClick={() => setShowPreview(false)} style={styles.ctlBtn}>✕</button>
                </div>
                <iframe
                  key={previewKey}
                  src={`http://localhost:4269/api/preview/${previewEntry}?base=${encodeURIComponent(activePath)}`}
                  style={{ flex: 1, border: 'none', backgroundColor: '#fff' }}
                  title="preview"
                />
              </div>
            )}
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
                    {t === 'agent' ? '🤖 Agent' : '⌨️ Terminal'}
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

      <div style={styles.statusBar}>
        <span>{activePath ? activePath : 'Aucun workspace'}</span>
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
    height: '40px',
    backgroundColor: 'var(--tc-bg-soft)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    fontSize: '13px',
    flexShrink: 0,
    borderBottom: '1px solid var(--tc-border)',
    justifyContent: 'space-between',
  },
  badge: {
    fontSize: '10px',
    padding: '2px 8px',
    borderRadius: '12px',
    border: '1px solid var(--tc-border)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
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
  toast: {
    position: 'fixed',
    top: 80,
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'var(--tc-bg-elevated)',
    color: 'var(--tc-primary)',
    border: '1px solid var(--tc-border)',
    borderRadius: '6px',
    padding: '10px 18px',
    zIndex: 9999,
    fontSize: '12px',
    boxShadow: '0 0 20px rgba(0,255,65,0.2)',
  },
  statusBar: {
    height: '24px',
    backgroundColor: 'var(--tc-bg-elevated)',
    color: 'var(--tc-primary)',
    fontSize: '11px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: '16px',
    flexShrink: 0,
    borderTop: '1px solid var(--tc-border)',
  },
}

export default App