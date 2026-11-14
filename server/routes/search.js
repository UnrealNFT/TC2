import { Router } from 'express'
import axios from 'axios'

const router = Router()

router.get('/web', async (req, res) => {
  const q = req.query.q
  if (!q || typeof q !== 'string') return res.status(400).json({ error: 'q required' })

  try {
    // DuckDuckGo instant answer / html lite scraping
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`
    const result = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000,
    })
    const snippet = result.data.match(/<a[^>]+result__a[^>]*>(.*?)<\/a>/s)?.[1] || ''
    res.json({ query: q, snippet: snippet.slice(0, 1000) })
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
    const repos = result.data.items.map((r: any) => ({
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
