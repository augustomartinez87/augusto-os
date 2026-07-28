import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const BACKLOG_PATH = path.join(__dirname, '..', '..', 'system', 'BACKLOG.md')

export interface BacklogUpdateResult {
  updated: string[]
  missing: string[]
}

// Marca en system/BACKLOG.md las filas resueltas por un feature liberado a prod:
// columna Prioridad (2da) → ✅, columna Estado (4ta) → `done <date> (<featureId>, orquestador, liberado a prod)`.
// Matchea el ID completo entre pipes (parts[1] tras split('|')) para evitar colisiones de
// substring (TS-1 vs TS-17). IDs de `resolves` que no aparecen en el archivo van a `missing`,
// nunca crashea — el release ya pasó el gate de push cuando esto corre.
export function updateBacklogStatus(
  featureId: string,
  resolves: string[],
  date: string,
  backlogPath: string = BACKLOG_PATH,
): BacklogUpdateResult {
  if (!resolves.length) return { updated: [], missing: [] }
  if (!existsSync(backlogPath)) return { updated: [], missing: [...resolves] }

  const wanted = new Set(resolves)
  const found = new Set<string>()
  const content = readFileSync(backlogPath, 'utf-8')
  const lines = content.split('\n')

  const updatedLines = lines.map(ln => {
    if (!ln.startsWith('|')) return ln
    const parts = ln.split('|')
    // '' | ID | P | Descripción | Estado | Ejecutor | ''  → parts[1]=ID, parts[2]=P, parts[4]=Estado
    if (parts.length < 5) return ln
    const id = parts[1].trim()
    if (!wanted.has(id)) return ln

    found.add(id)
    parts[2] = ' ✅ '
    parts[4] = ` done ${date} (${featureId}, orquestador, liberado a prod) `
    return parts.join('|')
  })

  const updated: string[] = []
  const missing: string[] = []
  for (const id of resolves) {
    if (found.has(id)) updated.push(id)
    else missing.push(id)
  }

  if (updated.length) {
    writeFileSync(backlogPath, updatedLines.join('\n'), 'utf-8')
  }

  return { updated, missing }
}
