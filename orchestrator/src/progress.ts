import { readFileSync, appendFileSync, existsSync } from 'fs'
import { log } from './limits.js'

export function appendProgress(progressPath: string, featureId: string, summary: string): void {
  if (existsSync(progressPath)) {
    const existing = readFileSync(progressPath, 'utf-8')
    if (existing.includes(`${featureId} completado`)) {
      log(`[system] PROGRESS.md ya tiene entrada para ${featureId} — no se duplica`)
      return
    }
  }
  const timestamp = new Date().toISOString().split('T')[0]
  const entry = `\n## ${timestamp} — ${featureId} completado\n\n${summary}\n`
  appendFileSync(progressPath, entry, 'utf-8')
  log(`[system] PROGRESS.md actualizado`)
}
