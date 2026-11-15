import type React from 'react'
import { useState, useRef, useEffect } from 'react'

interface MenuItem {
  label: string
  shortcut?: string
  action?: () => void
  type?: 'item'
}

interface Menu {
  label: string
  items: Array<MenuItem | { type: 'separator' }>
}

interface MenuBarProps {
  onOpenFolder: () => void
  onNewProject: () => void
  onSave: () => void
  onSaveAll: () => void
  onExportZip: () => void
  onImportZip: () => void
  onTogglePreview: () => void
  previewOpen: boolean
}

export function MenuBar({
  onOpenFolder,
  onNewProject,
  onSave,
  onSaveAll,
  onExportZip,
  onImportZip,
  onTogglePreview,
  previewOpen,
}: MenuBarProps) {
  const [open, setOpen] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  const menus: Menu[] = [
    {
      label: 'Fichier',
      items: [
        { label: 'Ouvrir un dossier…', shortcut: 'Ctrl+K Ctrl+O', action: onOpenFolder },
        { label: 'Nouveau projet…', action: onNewProject },
        { type: 'separator' },
        { label: 'Enregistrer', shortcut: 'Ctrl+S', action: onSave },
        { label: 'Enregistrer tout', shortcut: 'Ctrl+Shift+S', action: onSaveAll },
        { type: 'separator' },
        { label: 'Exporter en ZIP', action: onExportZip },
        { label: 'Importer un ZIP', action: onImportZip },
      ],
    },
    {
      label: 'Affichage',
      items: [
        { label: previewOpen ? 'Masquer Preview' : 'Afficher Preview', shortcut: 'Ctrl+Shift+V', action: onTogglePreview },
      ],
    },
  ]

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) {
        setOpen(null)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={barRef} style={styles.bar}>
      {menus.map((menu) => {
        const isOpen = open === menu.label
        return (
          <div
            key={menu.label}
            style={styles.menu}
            onMouseEnter={() => open && setOpen(menu.label)}
          >
            <button
              onClick={() => setOpen(isOpen ? null : menu.label)}
              style={{
                ...styles.btn,
                backgroundColor: isOpen ? 'var(--tc-selected)' : 'transparent',
              }}
            >
              {menu.label}
            </button>
            {isOpen && (
              <div style={styles.dropdown}>
                {menu.items.map((item, idx) =>
                  'type' in item && item.type === 'separator' ? (
                    <div key={idx} style={styles.sep} />
                  ) : (
                    <div
                      key={(item as MenuItem).label}
                      onClick={() => {
                        setOpen(null)
                        ;(item as MenuItem).action?.()
                      }}
                      style={styles.item}
                    >
                      <span style={{ flex: 1 }}>{(item as MenuItem).label}</span>
                      {(item as MenuItem).shortcut && <span style={styles.shortcut}>{(item as MenuItem).shortcut}</span>}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    height: '28px',
    backgroundColor: 'var(--tc-bg-elevated)',
    borderBottom: '1px solid var(--tc-border)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 8px',
    flexShrink: 0,
  },
  menu: {
    position: 'relative',
  },
  btn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--tc-text)',
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: "'Segoe UI', 'Helvetica Neue', sans-serif",
    borderRadius: '4px',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    minWidth: '240px',
    backgroundColor: 'var(--tc-bg-elevated)',
    border: '1px solid var(--tc-border)',
    borderRadius: '4px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
    zIndex: 1000,
    padding: '4px 0',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '6px 12px',
    color: 'var(--tc-text)',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: "'Segoe UI', 'Helvetica Neue', sans-serif",
  },
  sep: {
    height: '1px',
    backgroundColor: 'var(--tc-border)',
    margin: '4px 0',
  },
  shortcut: {
    color: 'var(--tc-text-muted)',
    fontSize: '11px',
    marginLeft: 'auto',
  },
}
