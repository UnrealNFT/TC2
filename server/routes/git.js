import { Router } from 'express'
import { simpleGit } from 'simple-git'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { requireBase } from '../lib/workspace.js'

const router = Router()

function getGit(base) {
  return simpleGit(path.resolve(base))
}

function isGitRepo(base) {
  return existsSync(path.join(base, '.git'))
}

router.get('/status', async (req, res) => {
  const base = requireBase(req, res)
  if (!base) return
  try {
    if (!isGitRepo(base)) {
      return res.json({ isRepo: false, branch: null, isClean: true, modified: [] })
    }
    const git = getGit(base)
    const status = await git.status()
    res.json({
      isRepo: true,
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
    const base = requireBase(req, res)
    if (!base) return
    const git = getGit(base)
    const diff = req.query.path ? await git.diff([req.query.path]) : await git.diff()
    res.json({ diff })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.get('/diff-staged', async (req, res) => {
  try {
    const base = requireBase(req, res)
    if (!base) return
    const git = getGit(base)
    const diff = await git.diff(['--cached'])
    res.json({ diff })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.post('/add', async (req, res) => {
  try {
    const base = requireBase(req, res)
    if (!base) return
    const git = getGit(base)
    await git.add(req.body.path || '.')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.post('/unstage', async (req, res) => {
  try {
    const base = requireBase(req, res)
    if (!base) return
    const git = getGit(base)
    await git.reset(['HEAD', req.body.path || '.'])
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.post('/commit', async (req, res) => {
  try {
    const base = requireBase(req, res)
    if (!base) return
    const git = getGit(base)
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
    const base = requireBase(req, res)
    if (!base) return
    const git = getGit(base)
    await git.push(req.body.remote || 'origin', req.body.branch || 'HEAD')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.post('/pull', async (req, res) => {
  try {
    const base = requireBase(req, res)
    if (!base) return
    const git = getGit(base)
    await git.pull(req.body.remote || 'origin', req.body.branch || 'current')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.get('/branches', async (req, res) => {
  try {
    const base = requireBase(req, res)
    if (!base) return
    const git = getGit(base)
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
    const base = requireBase(req, res)
    if (!base) return
    const git = getGit(base)
    const options = req.body.create ? ['-b', req.body.branch] : [req.body.branch]
    await git.checkout(options)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.post('/init', async (req, res) => {
  try {
    const base = requireBase(req, res)
    if (!base) return
    const git = getGit(base)
    await git.init()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

export default router
