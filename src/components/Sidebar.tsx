import type React from 'react'
import type { SidebarView, Workspace } from '../types/ide'

interface SidebarProps {
  view: SidebarView
  onChangeView: (view: SidebarView) => void
  workspaces: Workspace[]
  activePath: string
  onAddWorkspace: () => void
  onNewProject: () => void
  onSelectWorkspace: (path: string) => void
  onRemoveWorkspace: (path: string) => void
  extra: React.ReactNode
}

const items: { id: SidebarView; label: string; icon?: string }[] = [
  { id: 'projects', label: 'Projets', icon: '📁' },
  { id: 'files', label: 'Fichiers', icon: '🌲' },
  { id: 'git', label: 'Git', icon: '🔀' },
  { id: 'settings', label: 'Paramètres', icon: '⚙' },
]

export function Sidebar({ view, onChangeView, workspaces, activePath, onAddWorkspace, onNewProject, onSelectWorkspace, onRemoveWorkspace, extra }: SidebarProps) {
  return (
    <div style={styles.sidebar}>
      <div style={styles.brand}>
        <span style={{ color: 'var(--tc-primary)', fontWeight: 700, letterSpacing: 1 }}>TRAPPIST</span>
        <span style={{ fontSize: '10px', color: 'var(--tc-text-dim)' }}>IDE v0.1</span>
      </div>

      <div style={styles.nav}>
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onChangeView(item.id)}
            title={item.label}
            style={{
              ...styles.navBtn,
              backgroundColor: view === item.id ? 'var(--tc-selected)' : 'transparent',
              color: view === item.id ? 'var(--tc-primary)' : 'var(--tc-text-muted)',
              borderBottom: view === item.id ? '2px solid var(--tc-primary)' : '2px solid transparent',
            }}
          >
            <span style={{ fontSize: '14px' }}>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {view === 'projects' && (
        <div style={styles.section}>
          <div style={styles.actions}>
            <button onClick={onAddWorkspace} style={styles.bigBtn}>+ Ouvrir dossier</button>
            <button onClick={onNewProject} style={{ ...styles.bigBtn, backgroundColor: 'var(--tc-bg-elevated)', color: 'var(--tc-primary)' }}>+ Nouveau projet</button>
          </div>

          <div style={styles.sectionTitle}>Workspaces récents</div>
          <div style={styles.list}>
            {workspaces.length === 0 && (
              <div style={styles.empty}>Aucun workspace. Ouvre un dossier pour commencer.</div>
            )}
            {workspaces.map((ws) => (
              <div
                key={ws.path}
                onClick={() => onSelectWorkspace(ws.path)}
                style={{
                  ...styles.item,
                  backgroundColor: activePath === ws.path ? 'var(--tc-selected)' : 'transparent',
                  borderColor: activePath === ws.path ? 'var(--tc-primary)' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: activePath === ws.path ? 600 : 400, color: activePath === ws.path ? 'var(--tc-primary)' : 'var(--tc-text)' }}>
                    {ws.name}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveWorkspace(ws.path) }}
                    style={styles.smallDanger}
                  >
                    ×
                  </button>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--tc-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ws.path}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {extra}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: '260px',
    backgroundColor: 'var(--tc-bg-soft)',
    borderRight: '1px solid var(--tc-border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  brand: {
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    borderBottom: '1px solid var(--tc-border)',
    backgroundColor: 'var(--tc-bg-elevated)',
  },
  nav: {
    display: 'flex',
    borderBottom: '1px solid var(--tc-border)',
  },
  navBtn: {
    flex: 1,
    padding: '10px 2px',
    fontSize: '11px',
    cursor: 'pointer',
    background: 'transparent',
    fontFamily: "'Courier New', Consolas, monospace",
    border: 'none',
    color: 'var(--tc-text-muted)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  section: {
    flex: 1,
    padding: '12px',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionTitle: {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    color: 'var(--tc-text-muted)',
    marginTop: 4,
  },
  bigBtn: {
    width: '100%',
    padding: '8px',
    backgroundColor: 'var(--tc-primary)',
    color: 'var(--tc-bg)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 600,
    fontFamily: "'Courier New', Consolas, monospace",
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  empty: {
    fontSize: '11px',
    color: 'var(--tc-text-dim)',
    textAlign: 'center',
    padding: '16px 8px',
  },
  item: {
    position: 'relative',
    padding: '8px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    border: '1px solid transparent',
  },
  smallDanger: {
    background: 'transparent',
    border: 'none',
    color: 'var(--tc-danger)',
    cursor: 'pointer',
    fontSize: '14px',
    lineHeight: 1,
  },
}
