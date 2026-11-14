import { useState, useCallback, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { FileExplorer } from './components/FileExplorer'
import { GitPanel } from './components/GitPanel'
import { TabbedEditor } from './components/TabbedEditor'
import { PreviewPanel } from './components/PreviewPanel'
import { useWorkspace } from './hooks/useWorkspace'
import { localApi } from './services/localApi'
import type { SidebarView, OpenFile } from './types/ide'

function App() {
  const { workspaces, activePath, addWorkspace, removeWorkspace, setActive } = useWorkspace()
  const [sidebarView, setSidebarView] = useState<SidebarView>('projects')
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showPreview, setShowPreview] = useState(false)
  const [backendOk, setBackendOk] = useState<boolean | null>(null)

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
        return
      }
      const data = await localApi.readFile(path)
      const file = { path: data.path, content: data.content, savedContent: data.content }
      setOpenFiles((prev) => [...prev, file])
      setActiveFilePath(path)
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
      await localApi.listFiles('')
      addWorkspace(input)
      setRefreshKey((k) => k + 1)
    } catch (e: any) {
      alert('Impossible d\'ouvrir : ' + e.message)
    }
  }

  const handleSelectWorkspace = (path: string) => {
    setActive(path)
    setOpenFiles([])
    setActiveFilePath(null)
    setRefreshKey((k) => k + 1)
  }

  const sidebarExtra = sidebarView === 'files' ? (
    <FileExplorer activePath={activePath} onOpenFile={openFile} refreshKey={refreshKey} />
  ) : sidebarView === 'git' ? (
    <GitPanel activePath={activePath} refreshKey={refreshKey} />
  ) : null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: 'var(--tc-bg)',
        color: 'var(--tc-text)',
        fontFamily: "'Courier New', Consolas, monospace",
        overflow: 'hidden',
      }}
    >
      {/* Title bar */}
      <div
        style={{
          height: '36px',
          backgroundColor: 'var(--tc-bg-soft)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          fontSize: '13px',
          flexShrink: 0,
          borderBottom: '1px solid var(--tc-border)',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ color: 'var(--tc-primary)', textShadow: '0 0 10px rgba(0,255,65,0.5)', fontWeight: 600 }}>
          TrappistCode IDE
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px' }}>
          <span style={{ color: backendOk === null ? 'var(--tc-text-dim)' : backendOk ? 'var(--tc-primary)' : 'var(--tc-danger)' }}>
            {backendOk === null ? 'backend ?' : backendOk ? 'backend ok' : 'backend OFF'}
          </span>
          <button onClick={() => setShowPreview(!showPreview)} style={styles.topBtn}>
            {showPreview ? 'Hide preview' : 'Show preview'}
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Sidebar
          view={sidebarView}
          onChangeView={setSidebarView}
          workspaces={workspaces}
          activePath={activePath}
          onAddWorkspace={handleAddWorkspace}
          onSelectWorkspace={handleSelectWorkspace}
          onRemoveWorkspace={removeWorkspace}
          extra={sidebarExtra}
        />

        <TabbedEditor
          files={openFiles}
          activePath={activeFilePath}
          onActivate={setActiveFilePath}
          onClose={closeFile}
          onChange={changeFileContent}
          onSave={markSaved}
          workspace={activePath}
        />

        {showPreview && (
          <PreviewPanel workspace={activePath} activeFile={activeFilePath} />
        )}
      </div>

      {/* Status bar */}
      <div
        style={{
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
        }}
      >
        <span>{activePath ? activePath : 'Aucun workspace'}</span>
        {activeFilePath && <span style={{ marginLeft: 'auto' }}>{activeFilePath}</span>}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
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
}

export default App