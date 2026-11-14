import axios from 'axios'

const API = 'http://localhost:4269'

export interface FileEntry {
  name: string
  path: string
  type: 'dir' | 'file'
}

export interface GitStatus {
  branch: string
  tracking: string | null
  ahead: number
  behind: number
  modified: string[]
  not_added: string[]
  deleted: string[]
  renamed: { from: string; to: string }[]
  staged: { path: string; index: string; working_dir: string }[]
  isClean: boolean
}

class LocalApi {
  baseWorkspace = ''

  setWorkspace(ws: string) {
    this.baseWorkspace = ws
  }

  get params() {
    return this.baseWorkspace ? { base: this.baseWorkspace } : {}
  }

  async health() {
    const res = await axios.get(`${API}/health`)
    return res.data
  }

  async listFiles(path = '') {
    const res = await axios.get(`${API}/api/files/list`, {
      params: { ...this.params, path },
    })
    return res.data as FileEntry[]
  }

  async readFile(path: string) {
    const res = await axios.get(`${API}/api/files/read`, {
      params: { ...this.params, path },
    })
    return res.data as { path: string; content: string }
  }

  async writeFile(path: string, content: string) {
    await axios.post(`${API}/api/files/write`, {
      path,
      content,
      ...this.params,
    })
  }

  async mkdir(path: string) {
    await axios.post(`${API}/api/files/mkdir`, {
      path,
      ...this.params,
    })
  }

  async rename(oldPath: string, newPath: string) {
    await axios.post(`${API}/api/files/rename`, {
      oldPath,
      newPath,
      ...this.params,
    })
  }

  async delete(path: string) {
    await axios.post(`${API}/api/files/delete`, {
      path,
      ...this.params,
    })
  }

  async gitStatus() {
    const res = await axios.get(`${API}/api/git/status`, {
      params: this.params,
    })
    return res.data as GitStatus
  }

  async gitDiff(path?: string) {
    const res = await axios.get(`${API}/api/git/diff`, {
      params: { ...this.params, path },
    })
    return res.data.diff as string
  }

  async gitAdd(path: string) {
    await axios.post(`${API}/api/git/add`, { path, ...this.params })
  }

  async gitUnstage(path: string) {
    await axios.post(`${API}/api/git/unstage`, { path, ...this.params })
  }

  async gitCommit(message: string, author?: string) {
    await axios.post(`${API}/api/git/commit`, {
      message,
      author,
      ...this.params,
    })
  }

  async gitPush(remote?: string, branch?: string) {
    await axios.post(`${API}/api/git/push`, {
      remote,
      branch,
      ...this.params,
    })
  }

  async gitPull(remote?: string, branch?: string) {
    await axios.post(`${API}/api/git/pull`, {
      remote,
      branch,
      ...this.params,
    })
  }

  previewUrl(filePath: string) {
    return `${API}/api/preview/${filePath}?${new URLSearchParams(this.params).toString()}`
  }
}

export const localApi = new LocalApi()
