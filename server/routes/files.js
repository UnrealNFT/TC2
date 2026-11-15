import { Router } from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { requireBase, safeJoin } from '../lib/workspace.js'

const router = Router()

router.get('/list', async (req, res) => {
  try {
    const base = requireBase(req, res)
    if (!base) return
    const dir = safeJoin(base, req.query.path || '')
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const items = entries
      .map((e) => ({
        name: e.name,
        path: path.posix.join(req.query.path || '', e.name),
        type: e.isDirectory() ? 'dir' : 'file',
      }))
      .sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name)
        return a.type === 'dir' ? -1 : 1
      })
    res.json(items)
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.get('/read', async (req, res) => {
  try {
    const base = requireBase(req, res)
    if (!base) return
    const filePath = safeJoin(base, req.query.path)
    const content = await fs.readFile(filePath, 'utf-8')
    res.json({ path: req.query.path, content })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.post('/write', async (req, res) => {
  try {
    const base = requireBase(req, res)
    if (!base) return
    const filePath = safeJoin(base, req.body.path)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, req.body.content, 'utf-8')
    res.json({ ok: true, path: req.body.path })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.post('/mkdir', async (req, res) => {
  try {
    const base = requireBase(req, res)
    if (!base) return
    const dirPath = safeJoin(base, req.body.path)
    await fs.mkdir(dirPath, { recursive: true })
    res.json({ ok: true, path: req.body.path })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.post('/rename', async (req, res) => {
  try {
    const base = requireBase(req, res)
    if (!base) return
    const oldPath = safeJoin(base, req.body.oldPath)
    const newPath = safeJoin(base, req.body.newPath)
    await fs.rename(oldPath, newPath)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.post('/delete', async (req, res) => {
  try {
    const base = requireBase(req, res)
    if (!base) return
    const target = safeJoin(base, req.body.path)
    const stat = await fs.stat(target)
    if (stat.isDirectory()) {
      await fs.rm(target, { recursive: true })
    } else {
      await fs.unlink(target)
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

router.get('/stat', async (req, res) => {
  try {
    const base = requireBase(req, res)
    if (!base) return
    const target = safeJoin(base, req.query.path || '')
    const stat = await fs.stat(target)
    res.json({
      path: req.query.path,
      isDirectory: stat.isDirectory(),
      size: stat.size,
      mtime: stat.mtime,
    })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

export default router
