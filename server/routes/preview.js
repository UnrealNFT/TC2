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

function resolveBase(req) {
  return req.query.base || process.env.TRAPPIST_WORKSPACE || process.cwd()
}

router.get('/*', async (req, res) => {
  try {
    const base = resolveBase(req)
    const filePath = path.resolve(base, '.' + req.path)
    if (!filePath.startsWith(path.resolve(base))) {
      return res.status(403).send('Forbidden')
    }
    const content = await fs.readFile(filePath)
    res.setHeader('Content-Type', getMime(filePath))
    res.send(content)
  } catch (e) {
    if (e.code === 'ENOENT') {
      return res.status(404).send('Not found')
    }
    res.status(500).send(e.message)
  }
})

export default router
