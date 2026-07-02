import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import path from 'path'

const IGNORED_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.git'])
const MAX_READ_LINES = 150
const MAX_GREP_MATCHES = 50

function assertSafe(repoRoot: string, targetPath: string): void {
  const resolved = path.resolve(targetPath)
  const rootResolved = path.resolve(repoRoot)
  if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
    throw new Error(`Path traversal detectado: "${targetPath}" está fuera de "${repoRoot}"`)
  }
}

interface TreeEntry {
  path: string
  type: 'file' | 'dir'
}

export function list_tree(dir: string, repoRoot: string, maxDepth = 3): TreeEntry[] {
  assertSafe(repoRoot, dir)
  const results: TreeEntry[] = []

  function walk(current: string, depth: number): void {
    if (depth >= maxDepth) return
    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch {
      return
    }
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry)) continue
      const fullPath = path.join(current, entry)
      const rel = path.relative(repoRoot, fullPath)
      let stat
      try { stat = statSync(fullPath) } catch { continue }
      if (stat.isDirectory()) {
        results.push({ path: rel, type: 'dir' })
        walk(fullPath, depth + 1)
      } else {
        results.push({ path: rel, type: 'file' })
      }
    }
  }

  walk(path.resolve(dir), 0)
  return results
}

export function read_file(filePath: string, repoRoot: string, fromLine = 1, toLine?: number): string {
  assertSafe(repoRoot, path.resolve(repoRoot, filePath))
  const absPath = path.resolve(repoRoot, filePath)
  if (!existsSync(absPath)) throw new Error(`Archivo no encontrado: ${filePath}`)
  const content = readFileSync(absPath, 'utf-8')
  const lines = content.split('\n')
  const start = Math.max(0, fromLine - 1)
  const end = Math.min(lines.length, toLine ?? start + MAX_READ_LINES)
  return lines.slice(start, end).join('\n')
}

export interface GrepMatch {
  path: string
  line: number
  text: string
}

export function grep(pattern: string, glob: string, repoRoot: string): GrepMatch[] {
  const matches: GrepMatch[] = []
  let regex: RegExp
  try {
    regex = new RegExp(pattern)
  } catch {
    throw new Error(`Patrón de grep inválido: ${pattern}`)
  }

  const ext = glob.replace(/^\*\./, '').replace('**/', '')
  const isExtFilter = glob.startsWith('*.') || glob.startsWith('**/*.')

  function walkAndMatch(dir: string): void {
    if (matches.length >= MAX_GREP_MATCHES) return
    let entries: string[]
    try { entries = readdirSync(dir) } catch { return }
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry)) continue
      if (matches.length >= MAX_GREP_MATCHES) return
      const fullPath = path.join(dir, entry)
      let stat
      try { stat = statSync(fullPath) } catch { continue }
      if (stat.isDirectory()) {
        walkAndMatch(fullPath)
      } else {
        if (isExtFilter && !entry.endsWith('.' + ext)) continue
        let content: string
        try { content = readFileSync(fullPath, 'utf-8') } catch { continue }
        const lines = content.split('\n')
        for (let i = 0; i < lines.length && matches.length < MAX_GREP_MATCHES; i++) {
          if (regex.test(lines[i])) {
            matches.push({
              path: path.relative(repoRoot, fullPath),
              line: i + 1,
              text: lines[i].slice(0, 200),
            })
          }
        }
      }
    }
  }

  walkAndMatch(path.resolve(repoRoot))
  return matches
}
