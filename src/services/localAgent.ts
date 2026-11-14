import { localApi } from './localApi'

/**
 * Outils agents pour le workspace local.
 * Permet à l'agent de lire/écrire/modifier des fichiers sans passer par GitHub.
 */

export async function listLocalFiles(path = '') {
  return localApi.listFiles(path)
}

export async function readLocalFile(path: string) {
  return localApi.readFile(path)
}

export async function writeLocalFile(path: string, content: string) {
  return localApi.writeFile(path, content)
}

export async function patchLocalFile(
  path: string,
  oldText: string,
  newText: string
): Promise<string> {
  const file = await localApi.readFile(path)
  if (!file.content.includes(oldText)) {
    throw new Error(`oldText introuvable dans ${path}`)
  }
  const updated = file.content.replace(oldText, newText)
  await localApi.writeFile(path, updated)
  return updated
}

export async function createLocalFolder(path: string) {
  return localApi.mkdir(path)
}

export async function deleteLocalFile(path: string) {
  return localApi.delete(path)
}
