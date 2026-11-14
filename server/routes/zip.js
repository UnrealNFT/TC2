import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import archiver from 'archiver'
import unzipper from 'unzipper'

const router = Router()

function decodeBase(raw) {
  if (!raw) return process.env.TRAPPIST_WORKSPACE || process.cwd()
  let s = typeof raw === 'string' ? raw : String(raw)
  try { s = decodeURIComponent(s) } catch { /* ignore */ }
  if (process.platform === 'win32') s = s.replace(/\//g, '\\')
  return path.resolve(s)
}

function resolveBase(req) {
  return decodeBase(req.body?.base ?? req.query?.base)
}

router.get('/export', async (req, res) => {
  const base = resolveBase(req)
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
  const base = resolveBase(req)
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
