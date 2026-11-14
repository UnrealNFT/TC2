import { useState, useEffect, useCallback } from 'react'
import { localApi } from '../services/localApi'
import type { GitStatus } from '../services/localApi'

interface GitPanelProps {
  activePath: string
  refreshKey: number
}

export function GitPanel({ activePath, refreshKey }: GitPanelProps) {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [diff, setDiff] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!activePath) return
    try {
      const s = await localApi.gitStatus()
      setStatus(s)
      const d = await localApi.gitDiff()
      setDiff(d)
    } catch (e) {
      console.error(e)
      setStatus(null)
    }
  }, [activePath])

  useEffect(() => {
    load()
  }, [activePath, refreshKey, load])

  const allChanges = [
    ...(status?.staged || []).map((f: any) => ({ path: f.path, state: 'staged' })),
    ...(status?.modified || []).map((p) => ({ path: p, state: 'modified' })),
    ...(status?.not_added || []).map((p) => ({ path: p, state: 'untracked' })),
    ...(status?.deleted || []).map((p) => ({ path: p, state: 'deleted' })),
  ]

  const act = async (action: () => Promise<void>) => {
    setLoading(true)
    try {
      await action()
      await load()
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (!activePath) {
    return <div style={styles.empty}>Ouvre un projet avec Git</div>
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={{ color: 'var(--tc-primary)' }}>⎇ {status?.branch || '—'}</span>
        <span style={{ color: 'var(--tc-text-dim)', fontSize: '11px' }}>
          {status ? (status.isClean ? 'clean' : `${allChanges.length} changements`) : ''}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <button onClick={() => act(() => localApi.gitAdd('.'))} style={styles.btn} disabled={loading}>Stage all</button>
        <button onClick={() => act(() => localApi.gitCommit(message || 'TrappistCode update'))} style={styles.btn} disabled={loading}>Commit</button>
        <button onClick={() => act(() => localApi.gitPush())} style={styles.btn} disabled={loading}>Push</button>
        <button onClick={() => act(() => localApi.gitPull())} style={styles.btn} disabled={loading}>Pull</button>
      </div>

      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Message de commit"
        style={styles.input}
      />

      <div style={styles.files}>
        {allChanges.length === 0 && <div style={{ color: 'var(--tc-text-dim)' }}>Aucun changement</div>}
        {allChanges.map((c, i) => (
          <div key={`${c.path}-${i}`} style={styles.fileRow}>
            <span style={{ color: stateColor(c.state), fontSize: '10px', width: 50, textTransform: 'uppercase' }}>{c.state}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{c.path}</span>
            {c.state !== 'staged' && (
              <button onClick={() => act(() => localApi.gitAdd(c.path))} style={styles.mini} disabled={loading}>+</button>
            )}
            {c.state === 'staged' && (
              <button onClick={() => act(() => localApi.gitUnstage(c.path))} style={styles.mini} disabled={loading}>-</button>
            )}
          </div>
        ))}
      </div>

      {diff && (
        <pre style={styles.diff}>{diff.slice(0, 8000)}{diff.length > 8000 && '\n…'}</pre>
      )}
    </div>
  )
}

function stateColor(state: string) {
  switch (state) {
    case 'staged': return 'var(--tc-primary)'
    case 'modified': return 'var(--tc-warning)'
    case 'untracked': return '#51a2ff'
    case 'deleted': return 'var(--tc-danger)'
    default: return 'var(--tc-text-muted)'
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    padding: '12px',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    fontSize: '12px',
  },
  empty: {
    textAlign: 'center',
    color: 'var(--tc-text-dim)',
    marginTop: '40px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--tc-border)',
    paddingBottom: '8px',
  },
  btn: {
    backgroundColor: 'var(--tc-bg-elevated)',
    color: 'var(--tc-text)',
    border: '1px solid var(--tc-border)',
    borderRadius: '4px',
    padding: '5px 10px',
    cursor: 'pointer',
    fontFamily: "'Courier New', Consolas, monospace",
  },
  input: {
    padding: '6px 8px',
    backgroundColor: 'var(--tc-bg-elevated)',
    border: '1px solid var(--tc-border)',
    borderRadius: '4px',
    color: 'var(--tc-text)',
    fontFamily: "'Courier New', Consolas, monospace",
  },
  files: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  fileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 6px',
    borderRadius: '4px',
    backgroundColor: 'var(--tc-bg-elevated)',
  },
  mini: {
    background: 'transparent',
    border: '1px solid var(--tc-border)',
    color: 'var(--tc-primary)',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '10px',
    padding: '1px 5px',
  },
  diff: {
    backgroundColor: 'var(--tc-bg)',
    border: '1px solid var(--tc-border)',
    borderRadius: '4px',
    padding: '8px',
    color: 'var(--tc-text)',
    fontSize: '11px',
    overflow: 'auto',
    maxHeight: '300px',
    whiteSpace: 'pre-wrap',
  },
}
