import { useState, useCallback } from 'react'
import { listUserRepos } from '../services/github'

export interface RepoInfo {
  id: number
  full_name: string
  private: boolean
  html_url: string
  description: string | null
}

export function useGitHubRepos() {
  const [repos, setRepos] = useState<RepoInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchRepos = useCallback(async (token: string) => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const data = await listUserRepos(token)
      setRepos(data)
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message)
      setRepos([])
    } finally {
      setLoading(false)
    }
  }, [])

  return { repos, loading, error, fetchRepos }
}
