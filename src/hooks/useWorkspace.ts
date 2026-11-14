import { useState, useEffect, useCallback } from 'react'
import { localApi } from '../services/localApi'
import type { Workspace } from '../types/ide'

const STORAGE_KEY = 'trappistcode-workspaces'

export function useWorkspace() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activePath, setActivePath] = useState('')

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      setWorkspaces(saved)
      if (saved.length > 0) {
        setActivePath(saved[0].path)
        localApi.setWorkspace(saved[0].path)
      }
    } catch {
      setWorkspaces([])
    }
  }, [])

  const saveWorkspaces = useCallback((list: Workspace[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    setWorkspaces(list)
  }, [])

  const addWorkspace = useCallback((path: string, name?: string) => {
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
