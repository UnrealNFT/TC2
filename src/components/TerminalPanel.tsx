import { useState } from 'react'

export function TerminalPanel() {
  const [lines, setLines] = useState<string[]>([
    '> TrappistCode terminal — prêt pour commandes (expérimental)',
    '> Prochainement : exécution shell sécurisée via backend.',
  ])
  const [input, setInput] = useState('')

  const run = () => {
    if (!input.trim()) return
    setLines((prev) => [...prev, `> ${input}`, 'Commande non exécutée — backend shell en cours d\'intégration.'])
    setInput('')
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, backgroundColor: 'var(--tc-bg)' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
        {lines.map((l, i) => (
          <div key={i} style={{ color: l.startsWith('>') ? 'var(--tc-primary)' : 'var(--tc-text)' }}>{l}</div>
        ))}
      </div>
      <div style={{ display: 'flex', padding: '8px', borderTop: '1px solid var(--tc-border)' }}>
        <span style={{ color: 'var(--tc-primary)', marginRight: '8px' }}>$</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: 'var(--tc-text)',
            outline: 'none',
            fontFamily: "'Courier New', Consolas, monospace",
            fontSize: '13px',
          }}
          placeholder="npm run dev"
        />
      </div>
    </div>
  )
}
