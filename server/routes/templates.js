import { Router } from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'

const router = Router()

const TEMPLATES = {
  vanilla: {
    'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Trappist Project</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <h1>Hello TrappistCode</h1>
  <script src="main.js"></script>
</body>
</html>`,
    'style.css': `body {
  background: #000;
  color: #00ff41;
  font-family: 'Courier New', monospace;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  margin: 0;
}`,
    'main.js': `console.log('TrappistCode ready')`,
  },
  react: {
    'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Trappist React</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/main.jsx"></script>
</body>
</html>`,
    'main.jsx': `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
`,
    'App.jsx': `export default function App() {
  return <h1 style={{ color: '#00ff41', background: '#000', height: '100vh', margin: 0 }}>Trappist React</h1>
}
`,
    'package.json': JSON.stringify({
      name: 'trappist-project',
      private: true,
      type: 'module',
      scripts: { dev: 'vite' },
      dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
      devDependencies: { vite: '^6.0.0' }
    }, null, 2),
  },
  node: {
    'index.js': `console.log('Trappist Node ready')`,
    'package.json': JSON.stringify({
      name: 'trappist-project',
      private: true,
      type: 'module',
      scripts: { start: 'node index.js' },
    }, null, 2),
  }
}

function decodeBase(raw) {
  if (!raw) return process.env.TRAPPIST_WORKSPACE || process.cwd()
  let s = typeof raw === 'string' ? raw : String(raw)
  try { s = decodeURIComponent(s) } catch { /* ignore */ }
  if (process.platform === 'win32') s = s.replace(/\//g, '\\')
  return path.resolve(s)
}

function resolveBase(req) {
  return decodeBase(req.body?.base ?? req.query?.base)
}

router.get('/list', (_req, res) => {
  res.json(Object.keys(TEMPLATES))
})

router.post('/create', async (req, res) => {
  const { name, template } = req.body
  const base = resolveBase(req)

  if (!name || !template || !TEMPLATES[template]) {
    return res.status(400).json({ error: 'name or template invalid' })
  }

  const projectPath = path.resolve(base, name)

  try {
    for (const [filePath, content] of Object.entries(TEMPLATES[template])) {
      const full = path.resolve(projectPath, filePath)
      await fs.mkdir(path.dirname(full), { recursive: true })
      await fs.writeFile(full, content, 'utf-8')
    }
    res.json({ ok: true, path: projectPath })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

export default router
