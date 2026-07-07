import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..', '..')

const ARQUITECTURA_PATH = path.join(REPO_ROOT, 'system', 'ARQUITECTURA-ACTUAL.md')
const BACKLOG_PATH = path.join(REPO_ROOT, 'system', 'BACKLOG.md')

const MAX_CONTEXT_CHARS = 8_000

function readContextFile(filePath: string, label: string): string {
  if (!existsSync(filePath)) {
    console.warn(`[evaluate] ${label} no encontrado en ${filePath} — degradando a [no disponible]`)
    return `## ${label}\n[no disponible]`
  }
  const content = readFileSync(filePath, 'utf-8').slice(0, MAX_CONTEXT_CHARS)
  return `## ${label}\n${content}`
}

export function readSystemContext(): string {
  const arquitectura = readContextFile(ARQUITECTURA_PATH, 'ARQUITECTURA-ACTUAL.md')
  const backlog = readContextFile(BACKLOG_PATH, 'BACKLOG.md')
  return `${arquitectura}\n\n${backlog}`
}
