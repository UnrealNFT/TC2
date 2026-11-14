import axios from 'axios'

const API = 'http://localhost:4269'

let base = ''

export function setWorkspace(path: string) {
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

export const localApi = {
  setWorkspace,

  health() {
    return axios.get(`${API}/health`)
  },

  listFiles(path: string = '') {
    return axios.get(`${API}/api/files/list${params({ path, base })}`)
      .then((r) => r.data as Array<{ name: string; path: string; type: string }>)
  },

  readFile(path: string): Promise<FileData> {
    return axios.get(`${API}/api/files/read${params({ path, base })}`).then((r) => r.data)
  },

  writeFile(path: string, content: string) {
    return axios.post(`${API}/api/files/write`, { path, content, base })
  },

  mkdir(path: string) {
    return axios.post(`${API}/api/files/mkdir`, { path, base })
  },

  rename(oldPath: string, newPath: string) {
    return axios.post(`${API}/api/files/rename`, { oldPath, newPath, base })
  },

  delete(path: string) {
    return axios.post(`${API}/api/files/delete`, { path, base })
  },

  gitStatus(): Promise<GitStatus> {
    return axios.get(`${API}/api/git/status${params({ base })}`).then((r) => r.data)
  },

  gitDiff() {
    return axios.get(`${API}/api/git/diff${params({ base })}`).then((r) => String(r.data.diff || ''))
  },

  gitAdd(path: string) {
    return axios.post(`${API}/api/git/add`, { path, base })
  },

  gitUnstage(path: string) {
    return axios.post(`${API}/api/git/unstage`, { path, base })
  },

  gitCommit(message: string) {
    return axios.post(`${API}/api/git/commit`, { message, base })
  },

  gitPush() {
    return axios.post(`${API}/api/git/push`, { base })
  },

  gitPull() {
    return axios.post(`${API}/api/git/pull`, { base })
  },

  gitInit() {
    return axios.post(`${API}/api/git/init`, { base })
  },

  runShell(command: string) {
    return axios.post(`${API}/api/shell/run`, { command, base })
      .then((r) => r.data as { code?: number; stdout?: string; stderr?: string })
  },

  createProject(name: string, template: string, parent?: string) {
    return axios.post(`${API}/api/templates/create`, { name, template, base: parent || base })
  },

  exportZip(): Promise<Blob> {
    return axios.get(`${API}/api/zip/export${params({ base })}`, { responseType: 'blob' }).then((r) => r.data as Blob)
  },

  importZip(file: File): Promise<{ ok: boolean; path: string }> {
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
