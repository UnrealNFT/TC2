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

export function Sidebar({ view, onChangeView, extra }: SidebarProps) {
  return (
    <div style={styles.sidebar}>
      <div style={styles.brand}>
        <span style={{ color: 'var(--tc-primary)', fontWeight: 700, letterSpacing: 1 }}>TRAPPIST</span>
        <span style={{ fontSize: '10px', color: 'var(--tc-text-dim)' }}>IDE v0.2</span>
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
}
