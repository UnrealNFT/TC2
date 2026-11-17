import { localApi } from './localApi'

const MAX_SIZE = 200_000 // 200KB par fichier
const MAX_TOTAL = 1_000_000 // 1MB total

/**
 * Prend un snapshot du workspace local pour l'envoyer aux agents cloud.
 * Inclut l'arborescence + le contenu des fichiers texte principaux.
 */
export async function buildWorkspaceSnapshot(workspace: string): Promise<string> {
  if (!workspace) return ''

  const entries = await localApi.listFiles('')
  let output = `WORKSPACE: ${workspace}\n\nFILE TREE:\n`

  const walk = async (items: { path: string; type: string; name: string }[], prefix = '') => {
    const sorted = [...items].sort((a, b) => a.path.localeCompare(b.path))
    for (const item of sorted) {
      output += `${prefix}${item.type === 'dir' ? '📁' : '📄'} ${item.path}\n`
      if (item.type === 'dir') {
        try {
          const children = await localApi.listFiles(item.path)
          await walk(children, prefix + '  ')
        } catch {
          // skip unreadable dirs
        }
      }
    }
  }

  await walk(entries)

  output += '\n\nKEY FILES:\n'
  let totalSize = 0
  const files = await collectFiles(entries)

  for (const file of files) {
    if (totalSize >= MAX_TOTAL) {
      output += '\n…[limite atteinte, fichiers suivants omis]'
      break
    }
    try {
      const data = await localApi.readFile(file.path)
      const content = data.content.length > MAX_SIZE
        ? data.content.slice(0, MAX_SIZE) + '\n…[tronqué]'
        : data.content
      totalSize += content.length
      output += `\n--- ${file.path} ---\n${content}\n`
    } catch {
      output += `\n--- ${file.path} ---\n[unreadable]\n`
    }
  }

  return output
}

async function collectFiles(entries: { path: string; type: string }[], depth = 0): Promise<{ path: string }[]> {
  if (depth > 5) return []
  const files: { path: string }[] = []
  const dirs: string[] = []

  for (const e of entries) {
    if (e.type === 'file' && !isIgnored(e.path)) {
      files.push({ path: e.path })
    } else if (e.type === 'dir') {
      dirs.push(e.path)
    }
  }

  for (const dir of dirs) {
    try {
      const children = await localApi.listFiles(dir)
      const childFiles = await collectFiles(children, depth + 1)
      files.push(...childFiles)
    } catch {
      // ignore
    }
  }

  return files
}

function isIgnored(path: string) {
  const parts = path.split('/')
  return parts.some((p) =>
    ['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage'].includes(p)
  )
}
