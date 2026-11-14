import { Router } from 'express'
import axios from 'axios'
import fs from 'node:fs/promises'
import path from 'node:path'

const router = Router()

function decodeBase(raw) {
  if (!raw) return process.env.TRAPPIST_WORKSPACE || process.cwd()
  let s = typeof raw === 'string' ? raw : String(raw)
  try { s = decodeURIComponent(s) } catch { /* ignore */ }
  if (process.platform === 'win32') s = s.replace(/\//g, '\\')
  return path.resolve(s)
}

function resolveBase(req) {
  const raw = req.body?.base ?? req.query?.base
  return decodeBase(raw)
}

function isInside(base, target) {
  const resolved = path.resolve(base, target || '')
  if (process.platform === 'win32') {
    return resolved.toLowerCase().startsWith(base.toLowerCase() + '\\') || resolved.toLowerCase() === base.toLowerCase()
  }
  return resolved.startsWith(base)
}

async function* walk(dir, base) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    const rel = path.relative(base, full)
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', '.agent'].includes(entry.name)) continue
      yield* walk(full, base)
    } else {
      yield rel
    }
  }
}

router.post('/workspace', async (req, res) => {
  try {
    const base = resolveBase(req)
    const query = (req.body.query || req.query.q || '').trim()
    if (!query) return res.status(400).json({ error: 'query required' })

    const results = []
    const queue = []
    for await (const rel of walk(base, base)) {
      queue.push(rel)
    }

    await Promise.all(queue.map(async (rel) => {
      try {
        const full = path.join(base, rel)
        const stat = await fs.stat(full)
        if (stat.size > 1024 * 1024) return
        const content = await fs.readFile(full, 'utf-8')
        if (content.includes(query)) {
          results.push(path.posix.normalize(rel.replace(/\\/g, '/')))
        }
      } catch {
        // ignore unreadable files
      }
    }))

    res.json({ query, results: results.slice(0, 30) })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.get('/web', async (req, res) => {
  const q = req.query.q
  if (!q || typeof q !== 'string') return res.status(400).json({ error: 'q required' })

  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`
    const result = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000,
    })
    const html = result.data
    const snippets = []
    const matches = html.matchAll(/<a[^>]+result__a[^>]*>([\s\S]*?)<\/a>.*?<a[^>]+result__snippet[^>]*>([\s\S]*?)<\/a>/g)
    for (const m of matches) {
      if (snippets.length >= 3) break
      const title = m[1].replace(/<[^>]+>/g, '').trim()
      const text = m[2].replace(/<[^>]+>/g, '').trim()
      snippets.push(`${title}: ${text}`)
    }
    res.json({ query: q, snippet: snippets.join('\n').slice(0, 2000) || 'Aucun résultat' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/github', async (req, res) => {
  const q = req.query.q
  if (!q || typeof q !== 'string') return res.status(400).json({ error: 'q required' })

  try {
    const result = await axios.get(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=5`, {
      headers: { Accept: 'application/vnd.github+json' },
      timeout: 15000,
    })
    const repos = result.data.items.map((r) => ({
      name: r.full_name,
      url: r.html_url,
      description: r.description,
      stars: r.stargazers_count,
    }))
    res.json({ query: q, repos })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
