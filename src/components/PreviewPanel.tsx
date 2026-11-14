interface PreviewPanelProps {
  workspace: string
  activeFile: string | null
}

export function PreviewPanel({ workspace, activeFile }: PreviewPanelProps) {
  if (!workspace) {
    return <div style={styles.empty}>Ouvre un projet pour voir l'aperçu</div>
  }

  const entry = activeFile && ['html', 'htm'].includes(activeFile.split('.').pop() || '')
    ? activeFile
    : 'index.html'

  const url = `http://localhost:4269/api/preview/${entry}?base=${encodeURIComponent(workspace)}`

  return (
    <div style={styles.container}>
      <div style={styles.bar}>
        <span style={{ color: 'var(--tc-primary)' }}>Preview</span>
        <span style={{ color: 'var(--tc-text-dim)', fontSize: '11px' }}>{entry}</span>
      </div>
      <iframe src={url} style={styles.iframe} title="preview" />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '50%',
    minWidth: '280px',
    backgroundColor: 'var(--tc-bg)',
    borderLeft: '1px solid var(--tc-border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  bar: {
    height: '32px',
    backgroundColor: 'var(--tc-bg-soft)',
    borderBottom: '1px solid var(--tc-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    fontSize: '12px',
    flexShrink: 0,
  },
  iframe: {
    flex: 1,
    border: 'none',
    width: '100%',
    height: '100%',
    backgroundColor: 'white',
  },
  empty: {
    width: '50%',
    minWidth: '280px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--tc-text-dim)',
    borderLeft: '1px solid var(--tc-border)',
  },
}
