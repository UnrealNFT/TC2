import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import archiver from 'archiver'
import unzipper from 'unzipper'
import { requireBase } from '../lib/workspace.js'

const router = Router()

router.get('/export', async (req, res) => {
  const base = requireBase(req, res)
  if (!base) return
  if (!fs.existsSync(base)) {
    return res.status(404).json({ error: 'workspace not found' })
  }
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(base)}.zip"`)
  const archive = archiver('zip', { zlib: { level: 9 } })
  archive.on('error', (err) => res.status(500).json({ error: err.message || String(err) }))
  archive.pipe(res)
  archive.directory(base, false)
  await archive.finalize()
})

router.post('/import', async (req, res) => {
  const base = requireBase(req, res)
  if (!base) return
  if (!req.body?.zipUrl && !req.body?.zipBase64) {
    return res.status(400).json({ error: 'zipUrl or zipBase64 required' })
  }
  try {
    await fs.promises.mkdir(base, { recursive: true })
    let stream
    if (req.body.zipUrl) {
      const response = await fetch(req.body.zipUrl)
      if (!response.ok) throw new Error('download failed')
      const buffer = Buffer.from(await response.arrayBuffer())
      stream = Readable.from(buffer)
    } else {
      const buffer = Buffer.from(req.body.zipBase64, 'base64')
      stream = Readable.from(buffer)
    }
    await new Promise((resolve, reject) => {
      stream.pipe(unzipper.Extract({ path: base }))
        .on('close', resolve)
        .on('error', reject)
    })
    res.json({ ok: true, path: base })
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) })
  }
})

export default router
