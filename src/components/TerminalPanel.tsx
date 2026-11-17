import type React from 'react'
import { useState } from 'react'
import { localApi } from '../services/localApi'

export function TerminalPanel() {
  const [lines, setLines] = useState<string[]>([
    '> TrappistCode terminal',
    '> Commandes autorisées : npm, node, npx, yarn, pnpm, git, python, python3, tsc, oxlint',
  ])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)

  const run = async () => {
    if (!input.trim() || running) return
    const cmd = input.trim()
    setLines((prev) => [...prev, `$ ${cmd}`])
    setInput('')
    setRunning(true)

    try {
      const res = await localApi.runShell(cmd)
      const { stdout, stderr } = res
      if (stdout) setLines((prev) => [...prev, stdout])
      if (stderr) setLines((prev) => [...prev, `stderr: ${stderr}`])
      setLines((prev) => [...prev, `[exit ${res.code ?? '?'}]`])
    } catch (e: any) {
      setLines((prev) => [...prev, `❌ ${e.response?.data?.error || e.message}`])
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, backgroundColor: 'var(--tc-bg)' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
        {lines.map((l, i) => (
          <div key={i} style={{ color: l.startsWith('$') ? 'var(--tc-primary)' : l.startsWith('❌') ? 'var(--tc-danger)' : 'var(--tc-text)' }}>{l}</div>
        ))}
      </div>
      <div style={{ display: 'flex', padding: '8px', borderTop: '1px solid var(--tc-border)' }}>
        <span style={{ color: 'var(--tc-primary)', marginRight: '8px' }}>$</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          disabled={running}
          style={styles.input}
          placeholder="npm run dev"
        />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: 'var(--tc-text)',
    outline: 'none',
    fontFamily: "'Courier New', Consolas, monospace",
    fontSize: '13px',
  },
}
