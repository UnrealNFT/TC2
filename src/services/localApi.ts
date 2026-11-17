import axios from 'axios'

const API = 'http://localhost:4269'

let base = ''

export function setWorkspace(path: string) {
  if (!/^[a-zA-Z]:[\\/]/.test(path) && !path.startsWith('/') && !path.startsWith('\\\\')) return
  base = path
}

export interface FileData {
  path: string
  content: string
}

export interface GitStatus {
  isRepo: boolean
  branch: string | null
  isClean: boolean
  modified: string[]
  staged: Array<{ path: string; index: string; working_dir: string }>
  not_added: string[]
  deleted: string[]
}

function params(obj: Record<string, string | number | undefined>) {
  const url = new URLSearchParams()
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined) url.append(k, String(v))
  })
  return '?' + url.toString()
}

function ensureBase() {
  if (!base) throw new Error('No workspace selected')
}

export const localApi = {
  setWorkspace,

  health() {
    return axios.get(`${API}/health`)
  },

  listFiles(path: string = '') {
    ensureBase()
    return axios.get(`${API}/api/files/list${params({ path, base })}`)
      .then((r) => r.data as Array<{ name: string; path: string; type: 'dir' | 'file' }>)
  },

  listAt(path: string) {
    return axios.get(`${API}/api/files/list${params({ path: '', base: path })}`)
      .then((r) => r.data as Array<{ name: string; path: string; type: 'dir' | 'file' }>)
  },

  readFile(path: string): Promise<FileData> {
    ensureBase()
    return axios.get(`${API}/api/files/read${params({ path, base })}`).then((r) => r.data)
  },

  writeFile(path: string, content: string) {
    ensureBase()
    return axios.post(`${API}/api/files/write`, { path, content, base })
  },

  mkdir(path: string) {
    ensureBase()
    return axios.post(`${API}/api/files/mkdir`, { path, base })
  },

  rename(oldPath: string, newPath: string) {
    ensureBase()
    return axios.post(`${API}/api/files/rename`, { oldPath, newPath, base })
  },

  delete(path: string) {
    ensureBase()
    return axios.post(`${API}/api/files/delete`, { path, base })
  },

  searchWorkspace(query: string): Promise<string[]> {
    ensureBase()
    return axios.post(`${API}/api/search/workspace`, { query, base })
      .then((r) => r.data.results as string[])
  },

  gitStatus(): Promise<GitStatus> {
    ensureBase()
    return axios.get(`${API}/api/git/status${params({ base })}`).then((r) => r.data)
  },

  gitDiff() {
    ensureBase()
    return axios.get(`${API}/api/git/diff${params({ base })}`).then((r) => String(r.data.diff || ''))
  },

  gitAdd(path: string) {
    ensureBase()
    return axios.post(`${API}/api/git/add`, { path, base })
  },

  gitUnstage(path: string) {
    ensureBase()
    return axios.post(`${API}/api/git/unstage`, { path, base })
  },

  gitCommit(message: string) {
    ensureBase()
    return axios.post(`${API}/api/git/commit`, { message, base })
  },

  gitPush() {
    ensureBase()
    return axios.post(`${API}/api/git/push`, { base })
  },

  gitPull() {
    ensureBase()
    return axios.post(`${API}/api/git/pull`, { base })
  },

  gitInit() {
    ensureBase()
    return axios.post(`${API}/api/git/init`, { base })
  },

  runShell(command: string) {
    ensureBase()
    return axios.post(`${API}/api/shell/run`, { command, base })
      .then((r) => r.data as { code?: number; stdout?: string; stderr?: string })
  },

  createProject(name: string, template: string, parent?: string) {
    const b = parent || base
    if (!b) throw new Error('No workspace selected')
    return axios.post(`${API}/api/templates/create`, { name, template, base: b })
  },

  exportZip(): Promise<Blob> {
    ensureBase()
    return axios.get(`${API}/api/zip/export${params({ base })}`, { responseType: 'blob' }).then((r) => r.data as Blob)
  },

  importZip(file: File): Promise<{ ok: boolean; path: string }> {
    ensureBase()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1]
          const res = await axios.post(`${API}/api/zip/import`, { zipBase64: base64, base })
          resolve(res.data)
        } catch (e) {
          reject(e)
        }
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  },
}
