import type React from 'react'

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
  const menus = [
    {
      label: 'Fichier',
      items: [
        { label: 'Ouvrir un dossier…', shortcut: 'Ctrl+K Ctrl+O', action: onOpenFolder },
        { label: 'Nouveau projet…', shortcut: '', action: onNewProject },
        { type: 'separator' as const },
        { label: 'Enregistrer', shortcut: 'Ctrl+S', action: onSave },
        { label: 'Enregistrer tout', shortcut: 'Ctrl+Shift+S', action: onSaveAll },
        { type: 'separator' as const },
        { label: 'Exporter en ZIP', shortcut: '', action: onExportZip },
        { label: 'Importer un ZIP', shortcut: '', action: onImportZip },
      ],
    },
    {
      label: 'Affichage',
      items: [
        { label: previewOpen ? 'Masquer Preview' : 'Afficher Preview', shortcut: 'Ctrl+Shift+V', action: onTogglePreview },
      ],
    },
  ]

  return (
    <div style={styles.bar}>
      {menus.map((menu) => (
        <div key={menu.label} style={styles.menu}>
          <button style={styles.btn}>{menu.label}</button>
          <div style={styles.dropdown}>
            {menu.items.map((item, idx) =>
              item.type === 'separator' ? (
                <div key={idx} style={styles.sep} />
              ) : (
                <div
                  key={item.label}
                  onClick={item.action}
                  style={styles.item}
                >
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.shortcut && <span style={styles.shortcut}>{item.shortcut}</span>}
                </div>
              )
            )}
          </div>
        </div>
      ))}
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
    display: 'flex',
    alignItems: 'center',
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
    display: 'none',
    position: 'absolute',
    top: '100%',
    left: 0,
    minWidth: '220px',
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

// Hover dropdown via CSS-in-JS global
const styleId = 'menubar-hover-style'
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const s = document.createElement('style')
  s.id = styleId
  s.textContent = `
    [data-menubar] > div:hover > div:last-child { display: block !important; }
  `
  document.head.appendChild(s)
}
