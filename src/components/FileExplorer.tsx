import { useState, useEffect, useCallback } from 'react'
import { localApi } from '../services/localApi'
import type { FileEntry } from '../types/ide'

interface FileExplorerProps {
  activePath: string
  onOpenFile: (path: string) => void
  refreshKey: number
}

export function FileExplorer({ activePath, onOpenFile, refreshKey }: FileExplorerProps) {
  const [tree, setTree] = useState<Record<string, FileEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState<{ dir: string; type: 'file' | 'dir' | null } | null>(null)
  const [newName, setNewName] = useState('')

  const load = useCallback(async () => {
    if (!activePath) return
    try {
      const list = await localApi.listFiles('')
      setTree({ '': list })
      const initial = new Set([''])
      setExpanded(initial)
    } catch (e) {
      console.error(e)
    }
  }, [activePath])

  useEffect(() => {
    load()
  }, [activePath, refreshKey, load])

  const toggle = async (dir: string) => {
    const next = new Set(expanded)
    if (next.has(dir)) {
      next.delete(dir)
    } else {
      next.add(dir)
      if (!tree[dir]) {
        try {
          const list = await localApi.listFiles(dir)
          setTree((t) => ({ ...t, [dir]: list }))
        } catch (e) {
          console.error(e)
        }
      }
    }
    setExpanded(next)
  }

  const startCreate = (dir: string, type: 'file' | 'dir') => {
    setCreating({ dir, type })
    setNewName('')
  }

  const confirmCreate = async () => {
    if (!creating || !newName.trim()) return
    const target = creating.dir ? `${creating.dir}/${newName.trim()}` : newName.trim()
    try {
      if (creating.type === 'dir') await localApi.mkdir(target)
      else await localApi.writeFile(target, '')
      const parent = creating.dir
      const list = await localApi.listFiles(parent)
      setTree((t) => ({ ...t, [parent]: list }))
      if (creating.type === 'dir') {
        const expandedNext = new Set(expanded)
        expandedNext.add(parent)
        setExpanded(expandedNext)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setCreating(null)
    }
  }

  const renderTree = (dirPath: string, depth = 0) => {
    const items = tree[dirPath] || []
    const isExpanded = expanded.has(dirPath)

    return (
      <div key={dirPath} style={{ marginLeft: depth ? 14 : 0 }}>
        {dirPath !== '' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div
              onClick={() => toggle(dirPath)}
              style={styles.row}
            >
              <span style={{ color: 'var(--tc-primary)' }}>{isExpanded ? '▼' : '▶'}</span>
              <span>📁 {dirPath.split('/').pop()}</span>
            </div>
            <button onClick={() => startCreate(dirPath, 'file')} style={styles.mini}>+f</button>
            <button onClick={() => startCreate(dirPath, 'dir')} style={styles.mini}>+d</button>
          </div>
        )}
        {isExpanded && (
          <div>
            {dirPath === '' && (
              <div style={{ display: 'flex', gap: 4, margin: '4px 0' }}>
                <button onClick={() => startCreate('', 'file')} style={styles.mini}>+ fichier</button>
                <button onClick={() => startCreate('', 'dir')} style={styles.mini}>+ dossier</button>
              </div>
            )}
            {items.map((item) => (
              item.type === 'dir'
                ? renderTree(item.path, depth + 1)
                : (
                  <div
                    key={item.path}
                    onClick={() => onOpenFile(item.path)}
                    style={styles.fileRow}
                    title={item.path}
                  >
                    <span style={{ marginRight: 4 }}>📄</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                  </div>
                )
            ))}
            {creating?.dir === dirPath && (
              <div style={styles.createRow}>
                <span>{creating.type === 'dir' ? '📁' : '📄'}</span>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmCreate()}
                  onBlur={() => setTimeout(() => setCreating(null), 200)}
                  style={styles.createInput}
                  placeholder={creating.type === 'dir' ? 'nom dossier' : 'nom fichier'}
                />
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {!activePath ? (
        <div style={styles.empty}>Ouvre un projet dans l'onglet Projets</div>
      ) : (
        renderTree('')
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    padding: '12px',
    overflow: 'auto',
    fontSize: '12px',
    userSelect: 'none',
  },
  empty: {
    textAlign: 'center',
    color: 'var(--tc-text-dim)',
    marginTop: '40px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 6px',
    cursor: 'pointer',
    borderRadius: '4px',
    color: 'var(--tc-text)',
    flex: 1,
  },
  fileRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 6px 4px 22px',
    cursor: 'pointer',
    borderRadius: '4px',
    color: 'var(--tc-text)',
    whiteSpace: 'nowrap',
  },
  mini: {
    backgroundColor: 'var(--tc-bg-elevated)',
    color: 'var(--tc-text-muted)',
    border: '1px solid var(--tc-border)',
    borderRadius: '3px',
    fontSize: '10px',
    padding: '2px 5px',
    cursor: 'pointer',
    fontFamily: "'Courier New', Consolas, monospace",
  },
  createRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 6px 4px 22px',
  },
  createInput: {
    flex: 1,
    backgroundColor: 'var(--tc-bg-elevated)',
    border: '1px solid var(--tc-border)',
    color: 'var(--tc-text)',
    borderRadius: '3px',
    padding: '3px 6px',
    fontSize: '12px',
    fontFamily: "'Courier New', Consolas, monospace",
  },
}
