import type React from 'react'
import type { SidebarView } from '../types/ide'

interface ActivityBarProps {
  view: SidebarView
  onChangeView: (view: SidebarView) => void
  sidebarOpen: boolean
  onToggleSidebar: () => void
  panelOpen: boolean
  onTogglePanel: () => void
  agentOpen: boolean
  onToggleAgent: () => void
}

const items: { id: SidebarView; title: string; icon: string }[] = [
  { id: 'files', title: 'Explorateur', icon: 'files' },
  { id: 'projects', title: 'Projets', icon: 'folder-library' },
  { id: 'git', title: 'Contr\u00f4le de code source', icon: 'source-control' },
]

export function ActivityBar({ view, onChangeView, sidebarOpen, onToggleSidebar, panelOpen, onTogglePanel, agentOpen, onToggleAgent }: ActivityBarProps) {
  return (
    <div style={styles.bar}>
      <div style={styles.group}>
        {items.map((item) => {
          const active = sidebarOpen && view === item.id
          return (
            <button
              key={item.id}
              title={item.title}
              onClick={() => {
                if (sidebarOpen && view === item.id) onToggleSidebar()
                else {
                  onChangeView(item.id)
                  if (!sidebarOpen) onToggleSidebar()
                }
              }}
              style={{
                ...styles.btn,
                color: active ? 'var(--tc-primary)' : 'var(--tc-text-dim)',
                borderLeft: active ? '2px solid var(--tc-primary)' : '2px solid transparent',
              }}
            >
              <i className={`codicon codicon-${item.icon}`} style={{ fontSize: 22 }} />
            </button>
          )
        })}
      </div>

      <div style={styles.group}>
        <button
          title={panelOpen ? 'Masquer le panneau' : 'Afficher le panneau'}
          onClick={onTogglePanel}
          style={{ ...styles.btn, color: panelOpen ? 'var(--tc-primary)' : 'var(--tc-text-dim)' }}
        >
          <i className="codicon codicon-layout-panel" style={{ fontSize: 22 }} />
        </button>
        <button
          title={agentOpen ? "Masquer l'agent" : "Afficher l'agent"}
          onClick={onToggleAgent}
          style={{ ...styles.btn, color: agentOpen ? 'var(--tc-primary)' : 'var(--tc-text-dim)' }}
        >
          <i className="codicon codicon-comment-discussion" style={{ fontSize: 22 }} />
        </button>
        <button
          title="Param\u00e8tres"
          onClick={() => {
            if (sidebarOpen && view === 'settings') onToggleSidebar()
            else {
              onChangeView('settings')
              if (!sidebarOpen) onToggleSidebar()
            }
          }}
          style={{
            ...styles.btn,
            color: sidebarOpen && view === 'settings' ? 'var(--tc-primary)' : 'var(--tc-text-dim)',
            borderLeft: sidebarOpen && view === 'settings' ? '2px solid var(--tc-primary)' : '2px solid transparent',
          }}
        >
          <i className="codicon codicon-settings-gear" style={{ fontSize: 22 }} />
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    width: 48,
    flexShrink: 0,
    backgroundColor: 'var(--tc-bg-soft)',
    borderRight: '1px solid var(--tc-border)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'stretch',
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
  },
  btn: {
    height: 48,
    background: 'transparent',
    border: 'none',
    borderLeft: '2px solid transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
}
