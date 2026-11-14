import { Router } from 'express'
import { simpleGit } from 'simple-git'
import path from 'node:path'

const router = Router()

function getGit(req) {
  const base = req.query.base || process.env.TRAPPIST_WORKSPACE || process.cwd()
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
    res.status(500).json({ error: e.message })
  }
})

router.get('/diff', async (req, res) => {
  try {
    const git = getGit(req)
    const diff = req.query.path ? await git.diff([req.query.path]) : await git.diff()
    res.json({ diff })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/diff-staged', async (req, res) => {
  try {
    const git = getGit(req)
    const diff = await git.diff(['--cached'])
    res.json({ diff })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/add', async (req, res) => {
  try {
    const git = getGit(req)
    await git.add(req.body.path || '.')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/unstage', async (req, res) => {
  try {
    const git = getGit(req)
    await git.reset(['HEAD', req.body.path || '.'])
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
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
    res.status(500).json({ error: e.message })
  }
})

router.post('/push', async (req, res) => {
  try {
    const git = getGit(req)
    await git.push(req.body.remote || 'origin', req.body.branch || 'HEAD')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/pull', async (req, res) => {
  try {
    const git = getGit(req)
    await git.pull(req.body.remote || 'origin', req.body.branch || 'current')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
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
    res.status(500).json({ error: e.message })
  }
})

router.post('/checkout', async (req, res) => {
  try {
    const git = getGit(req)
    const options = req.body.create ? ['-b', req.body.branch] : [req.body.branch]
    await git.checkout(options)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/init', async (req, res) => {
  try {
    const git = getGit(req)
    await git.init()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
