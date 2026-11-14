import { useState, useCallback } from 'react'
import Chat from './components/Chat'
import GitHubPanel from './components/GitHubPanel'
import Editor from './components/Editor'

function App() {
  const [selectedAgent, setSelectedAgent] = useState<
    'groq' | 'kimi' | 'claude' | 'kimi-wavespeed' | 'trappist-local'
  >('groq')
  const [githubToken, setGithubToken] = useState('')
  const [isTokenValid, setIsTokenValid] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)

  // --- Buffer fichier ouvert (mode Copilot) ---
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [savedContent, setSavedContent] = useState('')

  const openFile = useCallback((path: string, content: string) => {
    setOpenPath(path)
    setFileContent(content)
    setSavedContent(content)
  }, [])

  const onSaved = useCallback(() => {
    setSavedContent(fileContent)
  }, [fileContent])

  const dirty = openPath !== null && fileContent !== savedContent

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: 'var(--tc-bg)',
        color: 'var(--tc-text)',
        fontFamily: "'Courier New', Consolas, monospace",
        overflow: 'hidden',
      }}
    >
      {/* Title bar */}
      <div
        style={{
          height: '36px',
          backgroundColor: 'var(--tc-bg-soft)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          fontSize: '13px',
          flexShrink: 0,
          borderBottom: '1px solid var(--tc-border)',
        }}
      >
        <span style={{ color: 'var(--tc-primary)', textShadow: '0 0 10px rgba(0,255,65,0.5)' }}>
          TrappistAI
        </span>
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '11px',
          }}
        >
          Agent :
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value as any)}
            style={{
              backgroundColor: 'var(--tc-bg-elevated)',
              color: 'var(--tc-text)',
              border: '1px solid var(--tc-border)',
              padding: '4px 8px',
              borderRadius: '4px',
              fontFamily: "'Courier New', Consolas, monospace",
            }}
          >
            <option value="groq">Groq</option>
            <option value="kimi">Kimi</option>
            <option value="claude">Claude</option>
            <option value="kimi-wavespeed">Kimi 2.7 WaveSpeed</option>
            <option value="trappist-local">Trappist Code (local)</option>
          </select>
        </div>
      </div>

      {/* Main */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* GitHub panel */}
        <div
          style={{
            width: '280px',
            backgroundColor: 'var(--tc-panel)',
            borderRight: '1px solid var(--tc-border)',
            flexShrink: 0,
            minHeight: 0,
            overflow: 'auto',
          }}
        >
          <GitHubPanel
            githubToken={githubToken}
            setGithubToken={setGithubToken}
            isTokenValid={isTokenValid}
            setIsTokenValid={setIsTokenValid}
            selectedRepo={selectedRepo}
            setSelectedRepo={setSelectedRepo}
            openPath={openPath}
            onOpenFile={openFile}
          />
        </div>

        {/* Chat */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            borderRight: '1px solid var(--tc-border)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Chat
            selectedAgent={selectedAgent}
            githubToken={githubToken}
            isTokenValid={isTokenValid}
            selectedRepo={selectedRepo}
            openPath={openPath}
            fileContent={fileContent}
            onApplyEdit={setFileContent}
          />
        </div>

        {/* Editor */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backgroundColor: 'var(--tc-bg)',
          }}
        >
          <Editor
            githubToken={githubToken}
            selectedRepo={selectedRepo}
            openPath={openPath}
            content={fileContent}
            savedContent={savedContent}
            onChange={setFileContent}
            onSaved={onSaved}
          />
        </div>
      </div>

      {/* Status bar */}
      <div
        style={{
          height: '28px',
          backgroundColor: 'var(--tc-bg-elevated)',
          color: 'var(--tc-primary)',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: '16px',
          flexShrink: 0,
          borderTop: '1px solid var(--tc-border)',
        }}
      >
        <span>{selectedAgent}</span>
        <span>{isTokenValid ? 'GitHub OK' : 'GitHub off'}</span>
        {selectedRepo && <span>{selectedRepo}</span>}
        {openPath && (
          <span style={{ marginLeft: 'auto', color: 'var(--tc-text)' }}>
            {openPath}
            {dirty ? ' •' : ''}
          </span>
        )}
      </div>
    </div>
  )
}

export default App