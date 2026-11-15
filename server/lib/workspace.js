import path from 'node:path'

export function decodeBase(raw) {
  if (!raw) return null
  let s = typeof raw === 'string' ? raw : String(raw)
  try { s = decodeURIComponent(s) } catch { /* ignore */ }
  if (process.platform === 'win32') s = s.replace(/\//g, '\\')
  return path.resolve(s)
}

export function resolveBase(req) {
  return decodeBase(req.body?.base ?? req.query?.base)
}

export function requireBase(req, res) {
  const base = resolveBase(req)
  if (!base) {
    res.status(400).json({ error: 'workspace base required' })
    return null
  }
  return base
}

export function isInside(base, target) {
  const resolved = path.resolve(base, target || '')
  if (process.platform === 'win32') {
    const b = base.toLowerCase()
    const r = resolved.toLowerCase()
    return r.startsWith(b + '\\') || r === b
  }
  return resolved.startsWith(base)
}

export function safeJoin(base, target) {
  const resolved = path.resolve(base, target || '')
  if (!isInside(base, target)) {
    throw new Error('Path traversal detected')
  }
  return resolved
}
