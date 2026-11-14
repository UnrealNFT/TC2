import { Router } from 'express'
import { spawn } from 'node:child_process'
import path from 'node:path'

const router = Router()

const ALLOWED_COMMANDS = ['npm', 'node', 'npx', 'yarn', 'pnpm', 'git', 'python', 'python3', 'tsc', 'oxlint', 'powershell', 'cmd', 'bash', 'sh']
const BLOCKED_ARGS = ['&&', '||', ';', '|', '<', '>', '`', '$', '{', '}']

function resolveBase(req) {
  return req.body?.base || req.query?.base || process.env.TRAPPIST_WORKSPACE || process.cwd()
}

function isSafe(cmd, args) {
  if (!ALLOWED_COMMANDS.includes(cmd)) return false
  for (const arg of args) {
    if (BLOCKED_ARGS.some((b) => arg.includes(b))) return false
  }
  return true
}

router.post('/run', async (req, res) => {
  const { command, args = [] } = req.body
  const base = resolveBase(req)

  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'command required' })
  }

  const parts = command.trim().split(/\s+/)
  const cmd = parts[0]
  const mergedArgs = [...parts.slice(1), ...args].filter(Boolean)

  if (!isSafe(cmd, mergedArgs)) {
    return res.status(403).json({ error: 'Command not allowed' })
  }

  const cwd = path.resolve(base)

  try {
    const child = spawn(cmd, mergedArgs, { cwd, shell: process.platform === 'win32' })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => { stdout += data.toString() })
    child.stderr.on('data', (data) => { stderr += data.toString() })

    child.on('close', (code) => {
      res.json({ code, stdout, stderr })
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
