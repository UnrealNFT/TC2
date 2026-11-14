import { Router } from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'

const router = Router()

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.ts': 'application/typescript',
  '.jsx': 'text/javascript',
  '.tsx': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.py': 'text/x-python',
}

function getMime(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return MIME[ext] || 'application/octet-stream'
}

function decodeBase(raw) {
  if (!raw) return process.env.TRAPPIST_WORKSPACE || process.cwd()
  let s = typeof raw === 'string' ? raw : String(raw)
  try { s = decodeURIComponent(s) } catch { /* ignore */ }
  if (process.platform === 'win32') s = s.replace(/\//g, '\\')
  return path.resolve(s)
}

function resolveBase(req) {
  return decodeBase(req.query?.base)
}

router.get('/*', async (req, res) => {
  try {
    const base = resolveBase(req)
    const target = req.path.startsWith('/') ? req.path.slice(1) : req.path
    const filePath = path.resolve(base, target)
    if (!filePath.startsWith(base) && !filePath.toLowerCase().startsWith(base.toLowerCase())) {
      return res.status(403).send('Forbidden')
    }
    const content = await fs.readFile(filePath)
    res.setHeader('Content-Type', getMime(filePath))
    res.send(content)
  } catch (e) {
    if ((e as any).code === 'ENOENT') {
      return res.status(404).send('Not found')
    }
    res.status(500).send((e as Error).message)
  }
})

export default router
