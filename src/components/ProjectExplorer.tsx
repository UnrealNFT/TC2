import type React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { localApi } from '../services/localApi'

interface ProjectExplorerProps {
  activePath: string
  onSelectProject: (path: string) => void
  onNewProject: () => void
  refreshKey: number
}

const DEFAULT_PARENT = 'C:\\Users\\Djaf'

export function ProjectExplorer({ activePath, onSelectProject, onNewProject, refreshKey }: ProjectExplorerProps) {
  const [parent, setParent] = useState(DEFAULT_PARENT)
  const [items, setItems] = useState<Array<{ name: string; path: string; type: string }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await localApi.listAt(parent)
      setItems(list.filter((i) => i.type === 'dir').sort((a, b) => a.name.localeCompare(b.name)))
    } catch (e: any) {
      const msg = e?.response?.data?.error || e.message || 'Erreur inconnue'
      setError(`Impossible de lire ${parent} : ${msg}`)
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [parent])

  useEffect(() => {
    load()
  }, [parent, refreshKey, load])

  const changeParent = () => {
    const input = window.prompt('Dossier parent des projets :', parent)
    if (!input) return
    setParent(input.trim())
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>Projets locaux</div>
        <div style={styles.actions}>
          <button onClick={changeParent} style={styles.smallBtn} title="Changer dossier parent">📁</button>
          <button onClick={onNewProject} style={styles.smallBtn} title="Nouveau projet">+</button>
        </div>
      </div>

      <div style={styles.parent} onClick={changeParent} title="Clique pour changer">
        <span style={{ color: 'var(--tc-primary)' }}>▾</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{parent}</span>
      </div>

      {loading && <div style={styles.status}>Chargement…</div>}
      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.list}>
        {items.length === 0 && !loading && (
          <div style={styles.empty}>Aucun dossier ici.</div>
        )}
        {items.map((item) => {
          const isActive = activePath.toLowerCase() === item.path.toLowerCase()
          return (
            <div
              key={item.path}
              onClick={() => onSelectProject(item.path)}
              style={{
                ...styles.item,
                backgroundColor: isActive ? 'var(--tc-selected)' : 'transparent',
                borderColor: isActive ? 'var(--tc-primary)' : 'transparent',
              }}
              title={item.path}
            >
              <span style={{ fontSize: '14px' }}>📁</span>
              <span style={{
                ...styles.itemName,
                color: isActive ? 'var(--tc-primary)' : 'var(--tc-text)',
                fontWeight: isActive ? 600 : 400,
              }}>
                {item.name}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: '12px',
    fontSize: '12px',
    userSelect: 'none',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  title: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    color: 'var(--tc-text-muted)',
  },
  actions: {
    display: 'flex',
    gap: '6px',
  },
  smallBtn: {
    backgroundColor: 'var(--tc-bg-elevated)',
    color: 'var(--tc-text-muted)',
    border: '1px solid var(--tc-border)',
    borderRadius: '4px',
    padding: '4px 8px',
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: "'Courier New', Consolas, monospace",
  },
  parent: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 8px',
    backgroundColor: 'var(--tc-bg-elevated)',
    border: '1px solid var(--tc-border)',
    borderRadius: '4px',
    color: 'var(--tc-text-dim)',
    fontSize: '11px',
    marginBottom: '8px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  },
  status: {
    color: 'var(--tc-primary)',
    fontSize: '12px',
    padding: '8px 0',
  },
  error: {
    color: 'var(--tc-danger)',
    backgroundColor: 'rgba(255,0,0,0.08)',
    border: '1px solid var(--tc-danger)',
    borderRadius: '4px',
    padding: '8px',
    fontSize: '11px',
    marginBottom: '8px',
  },
  list: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  empty: {
    color: 'var(--tc-text-dim)',
    textAlign: 'center',
    padding: '20px 8px',
    fontSize: '11px',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    border: '1px solid transparent',
  },
  itemName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
}
