import type React from 'react'
import { useState } from 'react'
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

const svg = (children: React.ReactNode) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

const ICONS: Record<SidebarView, React.ReactNode> = {
  files: svg(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>),
  projects: svg(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />),
  git: svg(<><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="7" r="2" /><path d="M6 7v10" /><path d="M18 9c0 5-7 4-11.5 8.5" /></>),
  settings: svg(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" /></>),
}

const TITLES: Record<SidebarView, string> = {
  files: 'Explorateur',
  projects: 'Projets',
  git: 'Contrôle de code source',
  settings: 'Paramètres',
}

const TOP: SidebarView[] = ['files', 'projects', 'git']

export function Sidebar({ view, onChangeView, extra }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [hover, setHover] = useState<SidebarView | null>(null)

  // Comme VS Code : recliquer sur l'icone active replie la barre laterale
  const click = (id: SidebarView) => {
    if (id === view && !collapsed) {
      setCollapsed(true)
    } else {
      setCollapsed(false)
      onChangeView(id)
    }
  }

  const renderBtn = (id: SidebarView) => {
    const active = id === view && !collapsed
    return (
      <button
        key={id}
        title={TITLES[id]}
        onClick={() => click(id)}
        onMouseEnter={() => setHover(id)}
        onMouseLeave={() => setHover(null)}
        style={{
          ...styles.actBtn,
          color: active || hover === id ? 'var(--tc-primary)' : 'var(--tc-text-dim)',
          borderLeft: active ? '2px solid var(--tc-primary)' : '2px solid transparent',
        }}
      >
        {ICONS[id]}
      </button>
    )
  }

  return (
    <div style={styles.root}>
      <div style={styles.activity}>
        <div style={styles.col}>{TOP.map(renderBtn)}</div>
        <div style={styles.col}>{renderBtn('settings')}</div>
      </div>

      {!collapsed && (
        <div style={styles.panel}>
          <div style={styles.header}>{TITLES[view]}</div>
          <div style={styles.content}>{extra}</div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexShrink: 0,
    minHeight: 0,
  },
  activity: {
    width: 48,
    backgroundColor: 'var(--tc-activity)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  col: {
    display: 'flex',
    flexDirection: 'column',
  },
  actBtn: {
    width: 48,
    height: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
  },
  panel: {
    width: 260,
    backgroundColor: 'var(--tc-bg-soft)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden',
  },
  header: {
    height: 35,
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--tc-text-muted)',
    flexShrink: 0,
  },
  content: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
}
