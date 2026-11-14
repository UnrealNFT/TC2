import { Router } from 'express'
import { simpleGit } from 'simple-git'
import path from 'node:path'

const router = Router()

function decodeBase(raw) {
  if (!raw) return process.env.TRAPPIST_WORKSPACE || process.cwd()
  let s = typeof raw === 'string' ? raw : String(raw)
  try { s = decodeURIComponent(s) } catch { /* ignore */ }
  if (process.platform === 'win32') s = s.replace(/\//g, '\\')
  return path.resolve(s)
}

function getGit(req) {
  const base = decodeBase(req.query?.base ?? req.body?.base)
  return simpleGit(path.resolve(base))
}

router.get('/status', async (req, res) => {
  try {
    const git = getGit(req)
    const status = await git.status()
    res.json({
      branch: status.current,
      tracking: status.tracking,
      ahead: status.ahead,
      behind: status.behind,
      modified: status.modified,
      not_added: status.not_added,
      deleted: status.deleted,
      renamed: status.renamed,
      staged: status.staged,
      isClean: status.isClean(),
    })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.get('/diff', async (req, res) => {
  try {
    const git = getGit(req)
    const diff = req.query.path ? await git.diff([req.query.path]) : await git.diff()
    res.json({ diff })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.get('/diff-staged', async (req, res) => {
  try {
    const git = getGit(req)
    const diff = await git.diff(['--cached'])
    res.json({ diff })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.post('/add', async (req, res) => {
  try {
    const git = getGit(req)
    await git.add(req.body.path || '.')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.post('/unstage', async (req, res) => {
  try {
    const git = getGit(req)
    await git.reset(['HEAD', req.body.path || '.'])
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.post('/commit', async (req, res) => {
  try {
    const git = getGit(req)
    const result = await git.commit(req.body.message || 'TrappistCode update', {
      '--author': req.body.author || 'TrappistCode Agent <agent@trappist.land>',
    })
    res.json({ ok: true, commit: result.commit })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.post('/push', async (req, res) => {
  try {
    const git = getGit(req)
    await git.push(req.body.remote || 'origin', req.body.branch || 'HEAD')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.post('/pull', async (req, res) => {
  try {
    const git = getGit(req)
    await git.pull(req.body.remote || 'origin', req.body.branch || 'current')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.get('/branches', async (req, res) => {
  try {
    const git = getGit(req)
    const summary = await git.branch()
    res.json({
      current: summary.current,
      branches: Object.keys(summary.branches),
    })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.post('/checkout', async (req, res) => {
  try {
    const git = getGit(req)
    const options = req.body.create ? ['-b', req.body.branch] : [req.body.branch]
    await git.checkout(options)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.post('/init', async (req, res) => {
  try {
    const git = getGit(req)
    await git.init()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

export default router
