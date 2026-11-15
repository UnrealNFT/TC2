import { useState, useEffect, useCallback } from 'react'
import { localApi } from '../services/localApi'
import type { Workspace } from '../types/ide'

const STORAGE_KEY = 'trappistcode-workspaces'

function isAbsolutePath(p: string) {
  if (!p) return false
  if (/^[a-zA-Z]:[\\/]/.test(p)) return true
  if (p.startsWith('/')) return true
  return false
}

export function useWorkspace() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activePath, setActivePath] = useState('')

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as Workspace[]
      const clean = saved.filter((w) => isAbsolutePath(w.path))
      setWorkspaces(clean)
      if (clean.length > 0) {
        setActivePath(clean[0].path)
        localApi.setWorkspace(clean[0].path)
      }
    } catch {
      setWorkspaces([])
    }
  }, [])

  const saveWorkspaces = useCallback((list: Workspace[]) => {
    const clean = list.filter((w) => isAbsolutePath(w.path))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean))
    setWorkspaces(clean)
  }, [])

  const addWorkspace = useCallback((path: string, name?: string) => {
    if (!isAbsolutePath(path)) return
    const ws: Workspace = { path, name: name || path.split(/[/\\]/).pop() || path }
    const next = [ws, ...workspaces.filter((w) => w.path !== path)].slice(0, 12)
    saveWorkspaces(next)
    setActivePath(path)
    localApi.setWorkspace(path)
  }, [workspaces, saveWorkspaces])

  const removeWorkspace = useCallback((path: string) => {
    const next = workspaces.filter((w) => w.path !== path)
    saveWorkspaces(next)
    if (activePath === path && next.length > 0) {
      setActivePath(next[0].path)
      localApi.setWorkspace(next[0].path)
    }
  }, [activePath, workspaces, saveWorkspaces])

  const setActive = useCallback((path: string) => {
    if (!isAbsolutePath(path)) return
    setActivePath(path)
    localApi.setWorkspace(path)
  }, [])

  return {
    workspaces,
    activePath,
    addWorkspace,
    removeWorkspace,
    setActive,
  }
}
