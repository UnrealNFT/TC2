export interface FileEntry {
  name: string
  path: string
  type: 'dir' | 'file'
}

export interface OpenFile {
  path: string
  content: string
  savedContent: string
}

export type SidebarView = 'files' | 'git' | 'projects' | 'settings'

export interface Workspace {
  path: string
  name: string
}
