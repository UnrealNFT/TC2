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

function normalizeHtmlPaths(html, baseHref) {
  // Convertit les chemins absolus à la racine (/style.css) en relatifs au preview
  // sans toucher aux URLs externes, data:, #, etc.
  if (!html) return html
  const base = baseHref.endsWith('/') ? baseHref : baseHref + '/'

  const absReplacer = (full, attr, quote, val) => {
    if (!val || val.startsWith('http') || val.startsWith('//') || val.startsWith('data:') || val.startsWith('#')) {
      return full
    }
    if (val.startsWith('/')) {
      const rel = val.slice(1)
      return `${attr}=${quote}${base}${rel}${quote}`
    }
    return full
  }

  html = html.replace(/(href|src)(=)(["'])([^"']+)\3/g, absReplacer)
  return html
}

router.get('/*', async (req, res) => {
  try {
    const base = resolveBase(req)
    let target = req.path.startsWith('/') ? req.path.slice(1) : req.path
    if (!target || target === '') {
      target = 'index.html'
    }
    const filePath = path.resolve(base, target)
    if (!filePath.startsWith(base) && !filePath.toLowerCase().startsWith(base.toLowerCase())) {
      return res.status(403).send('Forbidden')
    }

    const ext = path.extname(filePath).toLowerCase()
    const content = await fs.readFile(filePath)

    // Pour les fichiers HTML, on normalise les liens absolus /xxx
    if (ext === '.html' || ext === '.htm') {
      const html = content.toString('utf-8')
      const normalized = normalizeHtmlPaths(html, '/api/preview/')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.send(normalized)
    }

    res.setHeader('Content-Type', getMime(filePath))
    res.send(content)
  } catch (e) {
    if (e.code === 'ENOENT') {
      return res.status(404).send('Not found')
    }
    res.status(500).send(e.message || String(e))
  }
})

export default router
