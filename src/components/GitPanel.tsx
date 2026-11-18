import type React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { localApi } from '../services/localApi'
import type { GitStatus } from '../services/localApi'

interface GitPanelProps {
  activePath: string
  refreshKey: number
}

// Extrait le vrai message renvoyé par le backend ({ error }) au lieu de "status code 400"
function messageErreur(e: unknown): string {
  const any = e as { response?: { data?: { error?: string; detail?: string } }; message?: string }
  return any?.response?.data?.error || any?.response?.data?.detail || any?.message || String(e)
}

export function GitPanel({ activePath, refreshKey }: GitPanelProps) {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [diff, setDiff] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [erreur, setErreur] = useState('')
  const [info, setInfo] = useState('')

  const load = useCallback(async () => {
    if (!activePath) return
    try {
      const s = await localApi.gitStatus()
      setStatus(s)
      const d = await localApi.gitDiff()
      setDiff(d)
    } catch (e) {
      setErreur(messageErreur(e))
      setStatus(null)
    }
  }, [activePath])

  useEffect(() => {
    load()
  }, [activePath, refreshKey, load])

  const allChanges = [
    ...(status?.staged || []).map((f: { path: string }) => ({ path: f.path, state: 'staged' as const })),
    ...(status?.modified || []).map((p) => ({ path: p, state: 'modified' as const })),
    ...(status?.not_added || []).map((p) => ({ path: p, state: 'untracked' as const })),
    ...(status?.deleted || []).map((p) => ({ path: p, state: 'deleted' as const })),
  ]

  const act = async (action: () => Promise<unknown>, succes?: string) => {
    setLoading(true)
    setErreur('')
    setInfo('')
    try {
      await action()
      if (succes) setInfo(succes)
      await load()
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setLoading(false)
    }
  }

  const bandeaux = (
    <>
      {erreur && (
        <div style={styles.error} onClick={() => setErreur('')} title="Cliquer pour fermer">
          ⚠️ {erreur}
        </div>
      )}
      {info && (
        <div style={styles.info} onClick={() => setInfo('')} title="Cliquer pour fermer">
          ✅ {info}
        </div>
      )}
    </>
  )

  if (!activePath) {
    return <div style={styles.empty}>Ouvre un dossier local pour voir Git.</div>
  }

  if (!status?.isRepo) {
    return (
      <div style={styles.container}>
        {bandeaux}
        <div style={styles.notice}>
          Ce dossier n’est pas un repo Git.
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={() => act(() => localApi.gitInit(), 'Repo initialisé.')} style={styles.btn} disabled={loading}>Init repo</button>
        </div>
        <div style={{ color: 'var(--tc-text-dim)', fontSize: '11px', marginTop: '10px' }}>
          Une fois initie, tu pourras stage, commit et push vers un repo GitHub.
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={{ color: 'var(--tc-primary)' }}>⎇ {status?.branch || '—'}</span>
        <span style={{ color: 'var(--tc-text-dim)', fontSize: '11px' }}>
          {status ? (status.isClean ? 'clean' : `${allChanges.length} changements`) : ''}
        </span>
      </div>

      {bandeaux}

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <button onClick={() => act(() => localApi.gitAdd('.'), 'Tous les fichiers sont stagés.')} style={styles.btn} disabled={loading}>Stage all</button>
        <button onClick={() => act(() => localApi.gitCommit(message || 'TrappistCode update'), 'Commit créé.')} style={styles.btn} disabled={loading}>Commit</button>
        <button onClick={() => act(() => localApi.gitPush(), 'Push effectué.')} style={styles.btn} disabled={loading}>Push</button>
        <button onClick={() => act(() => localApi.gitPull(), 'Pull effectué.')} style={styles.btn} disabled={loading}>Pull</button>
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
  notice: {
    padding: '10px',
    borderRadius: '4px',
    backgroundColor: 'var(--tc-bg-elevated)',
    border: '1px solid var(--tc-border)',
    color: 'var(--tc-text-dim)',
  },
  error: {
    padding: '8px 10px',
    borderRadius: '4px',
    border: '1px solid var(--tc-danger)',
    color: 'var(--tc-danger)',
    whiteSpace: 'pre-wrap',
    cursor: 'pointer',
    fontSize: '11px',
  },
  info: {
    padding: '8px 10px',
    borderRadius: '4px',
    border: '1px solid var(--tc-primary)',
    color: 'var(--tc-primary)',
    cursor: 'pointer',
    fontSize: '11px',
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
