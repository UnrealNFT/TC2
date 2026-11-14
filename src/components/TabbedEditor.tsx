import { useMemo, useEffect, useState, useCallback, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css as cssLang } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { autocompletion, closeBrackets, startCompletion } from '@codemirror/autocomplete'
import type { CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete'
import { bracketMatching, foldGutter, indentOnInput, syntaxTree } from '@codemirror/language'
import { keymap } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'
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

function extractWordAt(state: unknown, pos: number): string {
  const st = syntaxTree(state as any)
  st.resolveInner(pos, -1)
  const line = (state as any).doc.lineAt(pos)
  const text = line.text
  let start = pos - line.from
  let from = pos
  let to = pos
  while (start > 0 && /[a-zA-Z0-9_$]/.test(text[start - 1])) {
    start--
    from--
  }
  while (start < text.length && /[a-zA-Z0-9_$]/.test(text[start])) {
    start++
    to++
  }
  return (state as any).doc.sliceString(from, to) || ''
}

function createWordCompletions(files: OpenFile[], activePath: string | null) {
  return (context: CompletionContext) => {
    const word = context.matchBefore(/[a-zA-Z0-9_$]*/)
    if (!word || (word.from === word.to && !context.explicit)) return null

    const text = context.state.doc.toString()
    const tokens = new Set<string>()
    const regex = /[a-zA-Z_$][a-zA-Z0-9_$]*/g
    let m: RegExpExecArray | null
    while ((m = regex.exec(text)) !== null) {
      tokens.add(m[0])
    }

    const snippets: Record<string, string[]> = {
      js: ['function ', 'const ', 'let ', '=> ', 'return ', 'if () {', 'for () {', 'console.log()'],
      ts: ['interface ', 'type ', 'function ', 'const ', 'let ', 'return '],
      html: ['<div>', '<span>', '<button>', '<input />', '<script>', '<style>'],
      css: ['display: flex;', 'color: ;', 'margin: 0;', 'padding: 0;', '@media ()'],
      py: ['def ', 'class ', 'return ', 'if __name__ == ', 'print()'],
      json: ['"": "",', '[', '{', 'true', 'false', 'null'],
    }

    const ext = activePath?.split('.').pop()?.toLowerCase() || 'js'
    const extMap: Record<string, string> = {
      js: 'js', jsx: 'js', ts: 'ts', tsx: 'ts',
      html: 'html', htm: 'html', css: 'css',
      py: 'py', json: 'json',
    }
    const key = extMap[ext]

    const options = Array.from(tokens).map((label) => ({ label, type: 'text' }))
    if (key && key in snippets) {
      options.push(...snippets[key].map((label) => ({ label, type: 'keyword' as const, apply: label })))
    }
    options.push(
      ...files.map((f) => ({ label: f.path, type: 'type' as const })),
    )

    return {
      from: word.from,
      options,
    }
  }
}

function avecLesDeux(local: CompletionSource): CompletionSource {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const sources: CompletionSource[] = [
      local,
      ...context.state.languageDataAt<CompletionSource>('autocomplete', context.pos),
    ]
    const results: CompletionResult[] = []
    let baseFrom = context.pos

    await Promise.all(sources.map(async (source) => {
      try {
        const res = await Promise.resolve(source(context))
        if (res) {
          baseFrom = Math.min(baseFrom, res.from)
          results.push(res)
        }
      } catch {
        // source défaillante ignorée
      }
    }))

    if (results.length === 0) return null

    return {
      from: baseFrom,
      options: results.flatMap((r) => r.options),
    }
  }
}

export function TabbedEditor({ files, activePath, onActivate, onClose, onChange, onSave, workspace }: Props) {
  const active = files.find((f) => f.path === activePath)
  const [status, setStatus] = useState('')
  const viewRef = useRef<EditorView | null>(null)

  const handleGoToDefinition = useCallback(async (editorView: unknown, forceWord?: string) => {
    if (!workspace) {
      setStatus('No workspace')
      setTimeout(() => setStatus(''), 2000)
      return
    }
    const view = editorView as any
    const pos = view.state?.selection?.main?.head ?? 0
    const word = forceWord || extractWordAt(view.state, pos)
    if (!word) {
      setStatus('No symbol under cursor')
      setTimeout(() => setStatus(''), 2000)
      return
    }
    setStatus(`Search: ${word}`)
    try {
      const results = await localApi.searchWorkspace(word)
      if (!results.length) {
        setStatus(`No definition found for "${word}"`)
      } else {
        const target = results.find((r) => r !== activePath) || results[0]
        onActivate(target)
        setStatus(`Opened ${target}`)
      }
    } catch (e: any) {
      setStatus('Search error: ' + e.message)
    }
    setTimeout(() => setStatus(''), 3000)
  }, [activePath, onActivate, workspace])

  const activeExtensions = useMemo(
    () => {
      if (!active) return []
      const wordCompletion = createWordCompletions(files, active.path)
      return [
        langExtension(active.path),
        oneDark,
        closeBrackets(),
        bracketMatching(),
        foldGutter(),
        indentOnInput(),
        autocompletion({
          override: [avecLesDeux(wordCompletion)],
        }),
        keymap.of([
          { key: 'Ctrl-Space', run: startCompletion, preventDefault: true },
          {
            key: 'Alt-F12',
            run: (view: any) => {
              void handleGoToDefinition(view)
              return true
            },
            preventDefault: true,
          },
        ]),
      ]
    },
    [active?.path, files, handleGoToDefinition]
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
            onCreateEditor={(view) => { viewRef.current = view }}
            onMouseDown={(e) => {
              if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return
              const view = viewRef.current
              if (!view) return
              e.preventDefault()
              const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
              if (pos == null) return
              const word = extractWordAt(view.state, pos)
              if (word) void handleGoToDefinition(view, word)
            }}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              highlightActiveLine: true,
              foldGutter: false,
              indentOnInput: false,
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
