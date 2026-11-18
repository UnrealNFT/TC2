import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { TerminalPanel } from './TerminalPanel'

interface BottomPanelProps {
  agentLog: string[]
  editorStatus: string
  onClose: () => void
}

const TABS = ['Probl\u00e8mes', 'Sortie', 'Terminal'] as const
type Tab = typeof TABS[number]

export function BottomPanel({ agentLog, editorStatus, onClose }: BottomPanelProps) {
  const [tab, setTab] = useState<Tab>('Terminal')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (tab === 'Sortie') endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentLog, tab])

  return (
    <div style={styles.container}>
      <div style={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...styles.tab,
              color: tab === t ? 'var(--tc-primary)' : 'var(--tc-text-muted)',
              borderBottom: tab === t ? '1px solid var(--tc-primary)' : '1px solid transparent',
            }}
          >
            {t}
            {t === 'Sortie' && agentLog.length > 0 && (
              <span style={styles.count}>{agentLog.length}</span>
            )}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={styles.closeBtn} title="Masquer le panneau">
          <i className="codicon codicon-close" />
        </button>
      </div>

      {/* Les trois contenus restent montes : changer d'onglet n'efface plus rien. */}
      <div style={{ ...styles.content, display: tab === 'Probl\u00e8mes' ? 'flex' : 'none' }}>
        <div style={styles.empty}>
          {editorStatus && editorStatus.toLowerCase().includes('error')
            ? editorStatus
            : 'Aucun probl\u00e8me d\u00e9tect\u00e9 dans les fichiers ouverts.'}
        </div>
      </div>
      <div style={{ ...styles.content, display: tab === 'Sortie' ? 'flex' : 'none' }}>
        {agentLog.length === 0 ? (
          <div style={styles.empty}>La sortie de l'agent s'affichera ici pendant une mission.</div>
        ) : (
          <div style={styles.log}>
            {agentLog.map((line, i) => (
              <div key={i} style={styles.logLine}>{line}</div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <div style={{ ...styles.content, display: tab === 'Terminal' ? 'flex' : 'none' }}>
        <TerminalPanel />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--tc-bg-soft)',
    minHeight: 0,
  },
  tabs: {
    display: 'flex',
    alignItems: 'center',
    height: 32,
    borderBottom: '1px solid var(--tc-border)',
    flexShrink: 0,
    paddingLeft: 8,
  },
  tab: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '6px 10px',
    fontFamily: "'Courier New', Consolas, monospace",
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  count: {
    backgroundColor: 'var(--tc-bg-elevated)',
    border: '1px solid var(--tc-border)',
    borderRadius: 8,
    padding: '0 5px',
    fontSize: 10,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--tc-text-muted)',
    cursor: 'pointer',
    padding: '0 10px',
    fontSize: 14,
  },
  content: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  empty: {
    padding: 16,
    color: 'var(--tc-text-dim)',
    fontSize: 12,
  },
  log: {
    flex: 1,
    overflow: 'auto',
    padding: '8px 12px',
    fontSize: 12,
    fontFamily: "'Courier New', Consolas, monospace",
  },
  logLine: {
    color: 'var(--tc-text)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    padding: '1px 0',
  },
}
