import type { SidebarView, Workspace } from '../types/ide'

interface SidebarProps {
  view: SidebarView
  onChangeView: (view: SidebarView) => void
  workspaces: Workspace[]
  activePath: string
  onAddWorkspace: () => void
  onSelectWorkspace: (path: string) => void
  onRemoveWorkspace: (path: string) => void
  extra: React.ReactNode
}

const items: { id: SidebarView; label: string }[] = [
  { id: 'projects', label: 'Projets' },
  { id: 'files', label: 'Fichiers' },
  { id: 'git', label: 'Git' },
  { id: 'settings', label: '⚙' },
]

export function Sidebar(props: SidebarProps) {
  const { view, onChangeView, workspaces, activePath, onAddWorkspace, onSelectWorkspace, onRemoveWorkspace, extra } = props

  return (
    <div style={styles.sidebar}>
      <div style={styles.nav}>
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onChangeView(item.id)}
            style={{
              ...styles.navBtn,
              backgroundColor: view === item.id ? 'var(--tc-selected)' : 'transparent',
              color: view === item.id ? 'var(--tc-primary)' : 'var(--tc-text-muted)',
              border: view === item.id ? '1px solid var(--tc-border)' : '1px solid transparent',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {view === 'projects' && (
        <div style={styles.section}>
          <button onClick={onAddWorkspace} style={styles.bigBtn}>+ Ouvrir dossier</button>
          <div style={styles.list}>
            {workspaces.map((ws) => (
              <div
                key={ws.path}
                onClick={() => onSelectWorkspace(ws.path)}
                style={{
                  ...styles.item,
                  backgroundColor: activePath === ws.path ? 'var(--tc-selected)' : 'transparent',
                  color: activePath === ws.path ? 'var(--tc-primary)' : 'var(--tc-text)',
                  border: activePath === ws.path ? '1px solid var(--tc-border)' : '1px solid transparent',
                }}
              >
                <div style={{ width: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ws.name}</div>
                <div style={{ fontSize: '10px', color: 'var(--tc-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ws.path}</div>
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveWorkspace(ws.path) }}
                  style={styles.smallDanger}
                >
                  ×
                </button>
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
  nav: {
    display: 'flex',
    borderBottom: '1px solid var(--tc-border)',
  },
  navBtn: {
    flex: 1,
    padding: '10px 4px',
    fontSize: '11px',
    cursor: 'pointer',
    background: 'transparent',
    fontFamily: "'Courier New', Consolas, monospace",
  },
  section: {
    flex: 1,
    padding: '12px',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
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
  item: {
    position: 'relative',
    padding: '8px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  smallDanger: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    background: 'transparent',
    border: 'none',
    color: 'var(--tc-danger)',
    cursor: 'pointer',
    fontSize: '14px',
    lineHeight: 1,
  },
}
