import { useMemo, useEffect, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css as cssLang } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { localApi } from '../services/localApi'
import type { OpenFile } from '../types/ide'

interface Props {
  files: OpenFile[]
  activePath: string | null
  onActivate: (path: string) => void
  onClose: (path: string) => void
  onChange: (path: string, content: string) => void
  onSave: (path: string) => void
  workspace: string
}

function langExtension(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) {
    return javascript({ jsx: true, typescript: ['ts', 'tsx'].includes(ext) })
  }
  if (['html', 'htm'].includes(ext)) return html()
  if (ext === 'css') return cssLang()
  if (ext === 'json') return json()
  if (['md', 'markdown'].includes(ext)) return markdown()
  if (ext === 'py') return python()
  return javascript()
}

export function TabbedEditor({ files, activePath, onActivate, onClose, onChange, onSave, workspace }: Props) {
  const active = files.find((f) => f.path === activePath)
  const [status, setStatus] = useState('')

  const activeExtensions = useMemo(
    () => (active ? [langExtension(active.path), oneDark] : []),
    [active?.path]
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && activePath) {
        e.preventDefault()
        void handleSave(activePath)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activePath, files])

  const handleSave = async (path: string) => {
    const file = files.find((f) => f.path === path)
    if (!file || !workspace) return
    setStatus('Saving...')
    try {
      await localApi.writeFile(path, file.content)
      onSave(path)
      setStatus('Saved')
    } catch (e: any) {
      setStatus('Error: ' + e.message)
    }
    setTimeout(() => setStatus(''), 2000)
  }

  return (
    <div style={styles.container}>
      <div style={styles.tabs}>
        {files.map((f) => {
          const dirty = f.content !== f.savedContent
          return (
            <div
              key={f.path}
              onClick={() => onActivate(f.path)}
              style={{
                ...styles.tab,
                backgroundColor: activePath === f.path ? 'var(--tc-bg)' : 'var(--tc-bg-elevated)',
                borderBottom: activePath === f.path ? '2px solid var(--tc-primary)' : '2px solid transparent',
                color: activePath === f.path ? 'var(--tc-primary)' : 'var(--tc-text-muted)',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140, display: 'inline-block' }}>
                {f.path.split('/').pop()}{dirty ? ' •' : ''}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onClose(f.path) }}
                style={styles.closeBtn}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      <div style={styles.toolbar}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {active ? `/${active.path}${active.content !== active.savedContent ? ' • unsaved' : ''}` : 'Aucun fichier ouvert'}
        </span>
        <button onClick={() => activePath && void handleSave(activePath)} disabled={!active || activePath === null} style={styles.pushBtn}>
          Save (Ctrl+S)
        </button>
      </div>

      <div style={styles.editorArea}>
        {active ? (
          <CodeMirror
            value={active.content}
            height="100%"
            theme={oneDark}
            extensions={activeExtensions}
            onChange={(v) => onChange(active.path, v)}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              highlightActiveLine: true,
              foldGutter: true,
              indentOnInput: true,
              tabSize: 2,
            }}
            style={{
              flex: 1,
              minHeight: 0,
              fontSize: '13px',
              height: '100%',
            }}
          />
        ) : (
          <div style={styles.empty}>Ouvre un fichier depuis l'explorateur</div>
        )}
      </div>

      <div style={styles.status}>{status}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
    backgroundColor: 'var(--tc-bg)',
  },
  tabs: {
    display: 'flex',
    backgroundColor: 'var(--tc-bg-soft)',
    borderBottom: '1px solid var(--tc-border)',
    overflowX: 'auto',
    flexShrink: 0,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    fontSize: '12px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontFamily: "'Courier New', Consolas, monospace",
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--tc-text-muted)',
    cursor: 'pointer',
    fontSize: '14px',
    lineHeight: 1,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    backgroundColor: 'var(--tc-bg-soft)',
    borderBottom: '1px solid var(--tc-border)',
    fontSize: '12px',
    color: 'var(--tc-text)',
    flexShrink: 0,
  },
  pushBtn: {
    backgroundColor: 'var(--tc-primary)',
    color: 'var(--tc-bg)',
    border: 'none',
    borderRadius: '4px',
    padding: '4px 12px',
    cursor: 'pointer',
    fontWeight: 600,
    fontFamily: "'Courier New', Consolas, monospace",
  },
  editorArea: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--tc-text-dim)',
  },
  status: {
    padding: '3px 12px',
    backgroundColor: 'var(--tc-bg-elevated)',
    color: 'var(--tc-primary)',
    fontSize: '11px',
    borderTop: '1px solid var(--tc-border)',
  },
}
