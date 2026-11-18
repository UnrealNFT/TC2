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
const PANEL_H_KEY = 'trappistcode-panel-height'

function App() {
  const { workspaces, activePath, addWorkspace, removeWorkspace, setActive } = useWorkspace()
  const { repos, fetchRepos } = useGitHubRepos()
  const [sidebarView, setSidebarView] = useState<SidebarView>('projects')
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showBottom, setShowBottom] = useState(true)
  const [bottomTab, setBottomTab] = useState<BottomTab>('agent')
  const [panelHeight, setPanelHeight] = useState<number>(() => Number(localStorage.getItem(PANEL_H_KEY)) || 280)
  const [resizing, setResizing] = useState(false)
  const [backendOk, setBackendOk] = useState<boolean | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)
  const [githubToken, setGithubToken] = useState('')
  const [isTokenValid, setIsTokenValid] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    localApi.health().then(() => setBackendOk(true)).catch(() => setBackendOk(false))
    const id = setInterval(() => {
      localApi.health().then(() => setBackendOk(true)).catch(() => setBackendOk(false))
    }, 10_000)
    return () => clearInterval(id)
  }, [])

  // Raccourcis VS Code : Ctrl+J (panneau) et Ctrl+` (terminal)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key.toLowerCase() === 'j' || e.code === 'Backquote') {
        e.preventDefault()
        if (e.code === 'Backquote') setBottomTab('terminal')
        setShowBottom((s) => !s)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    localStorage.setItem(PANEL_H_KEY, String(panelHeight))
  }, [panelHeight])

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

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = panelHeight
    setResizing(true)
    document.body.style.cursor = 'row-resize'
    const move = (ev: MouseEvent) => {
      const h = startH + (startY - ev.clientY)
      setPanelHeight(Math.min(Math.max(h, 120), window.innerHeight - 200))
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      setResizing(false)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

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
  const dirtyCount = openFiles.filter((f) => f.content !== f.savedContent).length
  const workspaceName = activePath ? activePath.split(/[/\\]/).pop() : ''

  const sidebarExtra = sidebarView === 'files' ? (
    <FileExplorer activePath={activePath} onOpenFile={openFile} refreshKey={refreshKey} />
  ) : sidebarView === 'git' ? (
    <GitPanel activePath={activePath} refreshKey={refreshKey} />
  ) : sidebarView === 'settings' ? (
    <div style={{ padding: '8px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={styles.settingTitle}>GitHub</div>
      <label style={styles.label}>Token d'accès personnel</label>
      <input
        type="password"
        value={githubToken}
        onChange={(e) => setGithubToken(e.target.value)}
        placeholder="ghp_..."
        style={styles.input}
      />
      <button onClick={connectGitHub} style={styles.btn}>{isTokenValid ? '✓ GitHub connecté' : 'Connecter GitHub'}</button>

      <label style={styles.label}>Repo actif</label>
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

      <div style={{ ...styles.settingTitle, marginTop: 12 }}>Workspace</div>
      <button onClick={exportZip} style={styles.btnSecondary}>Exporter en ZIP</button>
      <button onClick={importZip} style={styles.btnSecondary}>Importer un ZIP</button>
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
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
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
                <div style={styles.previewHeader}>
                  <span>Aperçu · {previewEntry}</span>
                  <span style={{ display: 'flex', gap: 2 }}>
                    <button onClick={refreshPreview} style={styles.iconBtn} title="Recharger">⟳</button>
                    <button onClick={() => setShowPreview(false)} style={styles.iconBtn} title="Fermer">✕</button>
                  </span>
                </div>
                <iframe
                  key={previewKey}
                  src={`http://localhost:4269/api/preview/${previewEntry}?base=${encodeURIComponent(activePath)}`}
                  style={{ flex: 1, border: 'none', backgroundColor: '#fff', pointerEvents: resizing ? 'none' : 'auto' }}
                  title="preview"
                />
              </div>
            )}
          </div>

          {showBottom && (
            <div style={{ height: panelHeight, display: 'flex', flexDirection: 'column', flexShrink: 0, backgroundColor: 'var(--tc-panel)', borderTop: '1px solid var(--tc-border)', position: 'relative' }}>
              <div
                onMouseDown={startResize}
                style={{ ...styles.resizer, backgroundColor: resizing ? 'var(--tc-primary)' : 'transparent' }}
                title="Glisser pour redimensionner"
              />
              <div style={styles.panelTabs}>
                <div style={{ display: 'flex' }}>
                  {(['agent', 'terminal'] as BottomTab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setBottomTab(t)}
                      style={{
                        ...styles.panelTab,
                        color: bottomTab === t ? '#e7e7e7' : 'var(--tc-text-muted)',
                        borderBottom: bottomTab === t ? '1px solid #e7e7e7' : '1px solid transparent',
                      }}
                    >
                      {t === 'agent' ? 'Agent' : 'Terminal'}
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowBottom(false)} style={styles.iconBtn} title="Fermer le panneau (Ctrl+J)">✕</button>
              </div>
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {bottomTab === 'agent' ? (
                  <AgentPanel
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
            </div>
          )}
        </div>
      </div>

      <div style={{ ...styles.statusBar, backgroundColor: activePath ? '#007acc' : '#68217a' }}>
        <div style={styles.statusSide}>
          <span style={styles.statusItem} title={activePath || ''}>
            {activePath ? `📁 ${workspaceName}` : 'Aucun dossier ouvert'}
          </span>
          <span
            style={{ ...styles.statusItem, backgroundColor: backendOk === false ? '#c72e0f' : 'transparent' }}
            title="Backend local (port 4269)"
          >
            {backendOk === null ? '… backend' : backendOk ? '● backend' : '⚠ backend OFF'}
          </span>
          {dirtyCount > 0 && <span style={styles.statusItem}>● {dirtyCount} non enregistré(s)</span>}
          {isTokenValid && <span style={styles.statusItem}>GitHub{selectedRepo ? ` · ${selectedRepo}` : ''}</span>}
        </div>
        <div style={styles.statusSide}>
          {activeFilePath && <span style={styles.statusItem}>{activeFilePath}</span>}
          {isPreviewable && (
            <button onClick={() => setShowPreview((p) => !p)} style={styles.statusBtn}>
              {showPreview ? "Masquer l'aperçu" : 'Aperçu'}
            </button>
          )}
          <button onClick={() => setShowBottom((s) => !s)} style={styles.statusBtn} title="Ctrl+J">
            {showBottom ? 'Masquer le panneau' : 'Panneau'}
          </button>
        </div>
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
    fontFamily: 'var(--tc-font-ui)',
    overflow: 'hidden',
  },
  resizer: {
    position: 'absolute',
    top: -3,
    left: 0,
    right: 0,
    height: 5,
    cursor: 'row-resize',
    zIndex: 10,
  },
  panelTabs: {
    height: 35,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 8px 0 4px',
    flexShrink: 0,
  },
  panelTab: {
    background: 'transparent',
    border: 'none',
    padding: '6px 10px 4px',
    margin: '0 2px',
    cursor: 'pointer',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--tc-text-muted)',
    cursor: 'pointer',
    fontSize: 13,
    width: 24,
    height: 22,
    borderRadius: 4,
  },
  previewHeader: {
    height: 35,
    backgroundColor: 'var(--tc-bg-soft)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 8px 0 12px',
    fontSize: 13,
    color: 'var(--tc-text)',
    flexShrink: 0,
  },
  settingTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e7e7e7',
  },
  label: {
    fontSize: 12,
    color: 'var(--tc-text-muted)',
  },
  input: {
    backgroundColor: 'var(--tc-input)',
    color: 'var(--tc-text)',
    border: '1px solid transparent',
    borderRadius: 2,
    padding: '4px 6px',
    fontSize: 13,
  },
  btn: {
    backgroundColor: 'var(--tc-primary)',
    color: 'var(--tc-on-primary)',
    border: 'none',
    borderRadius: 2,
    padding: '5px 8px',
    cursor: 'pointer',
    fontSize: 13,
  },
  btnSecondary: {
    backgroundColor: '#3a3d41',
    color: '#ffffff',
    border: 'none',
    borderRadius: 2,
    padding: '5px 8px',
    cursor: 'pointer',
    fontSize: 13,
  },
  toast: {
    position: 'fixed',
    bottom: 34,
    right: 16,
    maxWidth: 420,
    backgroundColor: '#252526',
    color: 'var(--tc-text)',
    border: '1px solid #454545',
    borderLeft: '3px solid var(--tc-primary)',
    padding: '10px 14px',
    zIndex: 9999,
    fontSize: 13,
    boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
  },
  statusBar: {
    height: 22,
    color: '#ffffff',
    fontSize: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  statusSide: {
    display: 'flex',
    alignItems: 'center',
    height: '100%',
    minWidth: 0,
  },
  statusItem: {
    padding: '0 8px',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  statusBtn: {
    background: 'transparent',
    border: 'none',
    color: '#ffffff',
    fontSize: 12,
    padding: '0 8px',
    height: '100%',
    cursor: 'pointer',
  },
}

export default App
