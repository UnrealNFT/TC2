import type React from 'react'

interface StatusBarProps {
  backendOk: boolean | null
  activePath: string
  activeFilePath: string | null
  dirtyCount: number
  selectedRepo: string | null
  editorStatus: string
  onTogglePanel: () => void
  panelOpen: boolean
}

export function StatusBar({ backendOk, activePath, activeFilePath, dirtyCount, selectedRepo, editorStatus, onTogglePanel, panelOpen }: StatusBarProps) {
  const fileName = activeFilePath ? activeFilePath.split(/[/\\]/).pop() : ''
  const ext = activeFilePath?.split('.').pop()?.toLowerCase() || ''
  const langLabel: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript JSX', js: 'JavaScript', jsx: 'JavaScript JSX',
    html: 'HTML', htm: 'HTML', css: 'CSS', json: 'JSON', md: 'Markdown', py: 'Python',
  }

  return (
    <div style={styles.bar}>
      <div style={styles.group}>
        <button onClick={onTogglePanel} style={styles.itemBtn} title={panelOpen ? 'Masquer le panneau' : 'Afficher le panneau'}>
          <i className="codicon codicon-layout-panel" />
        </button>
        <span style={{ ...styles.item, color: backendOk ? 'var(--tc-primary)' : 'var(--tc-danger)' }}>
          <i className="codicon codicon-server" /> {backendOk ? 'backend' : 'backend OFF'}
        </span>
        {selectedRepo && (
          <span style={styles.item} title={selectedRepo}>
            <i className="codicon codicon-github" /> {selectedRepo.split('/')[1] || selectedRepo}
          </span>
        )}
        {dirtyCount > 0 && (
          <span style={styles.item} title="Fichiers non enregistr\u00e9s">
            <i className="codicon codicon-circle-filled" /> {dirtyCount}
          </span>
        )}
      </div>

      <div style={styles.group}>
        {editorStatus && <span style={styles.item}>{editorStatus}</span>}
        {fileName && <span style={styles.item} title={activeFilePath || ''}>{fileName}</span>}
        {ext && <span style={styles.item}>{langLabel[ext] || ext}</span>}
        <span style={styles.item} title={activePath || 'Aucun workspace'}>
          <i className="codicon codicon-folder" /> {activePath ? activePath.split(/[/\\]/).pop() : 'aucun workspace'}
        </span>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    height: 24,
    flexShrink: 0,
    backgroundColor: 'var(--tc-bg-elevated)',
    borderTop: '1px solid var(--tc-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 6px',
    fontSize: 11,
    color: 'var(--tc-text-muted)',
    fontFamily: "'Courier New', Consolas, monospace",
  },
  group: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    minWidth: 0,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '0 6px',
    whiteSpace: 'nowrap',
  },
  itemBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--tc-text-muted)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    padding: '0 6px',
    fontSize: 12,
  },
}
