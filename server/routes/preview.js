import { Router } from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { decodeBase, isInside } from '../lib/workspace.js'

const router = Router()
const PREFIX = '/api/preview/w'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
  '.tsx': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.wasm': 'application/wasm',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

function getMime(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
}

const encodeB64 = (s) => Buffer.from(s, 'utf-8').toString('base64url')
const decodeB64 = (s) => {
  try { return Buffer.from(s, 'base64url').toString('utf-8') } catch { return null }
}

// Les chemins absolus "/style.css" pointent vers la racine du workspace
function normalizeHtmlPaths(html, prefix) {
  return html.replace(/\b(href|src)=(["'])\/(?!\/)([^"']*)\2/gi, (_m, attr, q, rel) => `${attr}=${q}${prefix}/${rel}${q}`)
}

async function serve(base, relPath, prefix, res) {
  let target = relPath || 'index.html'
  if (!isInside(base, target)) return res.status(403).send('Forbidden')
  let filePath = path.resolve(base, target)

  const stat = await fs.stat(filePath)
  if (stat.isDirectory()) filePath = path.join(filePath, 'index.html')

  const ext = path.extname(filePath).toLowerCase()
  const content = await fs.readFile(filePath)
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', getMime(filePath))

  if (ext === '.html' || ext === '.htm') {
    return res.send(normalizeHtmlPaths(content.toString('utf-8'), prefix))
  }
  res.send(content)
}

router.get('/*', async (req, res) => {
  try {
    const segments = req.path.split('/').filter(Boolean).map((s) => {
      try { return decodeURIComponent(s) } catch { return s }
    })

    // Nouveau format : /api/preview/w/<base64url(workspace)>/chemin/fichier
    if (segments[0] === 'w' && segments[1]) {
      const base = decodeBase(decodeB64(segments[1]))
      if (!base) return res.status(400).send('workspace invalide')
      const rel = segments.slice(2).join('/')
      return await serve(base, rel, `${PREFIX}/${segments[1]}`, res)
    }

    // Ancien format : /api/preview/fichier?base=... -> redirection vers le nouveau
    const base = decodeBase(req.query?.base)
    if (!base) return res.status(400).send('workspace base required')
    const rel = segments.map(encodeURIComponent).join('/')
    return res.redirect(302, `${PREFIX}/${encodeB64(base)}/${rel}`)
  } catch (e) {
    if (e.code === 'ENOENT') return res.status(404).send('Not found')
    res.status(500).send(e.message || String(e))
  }
})

export default router
