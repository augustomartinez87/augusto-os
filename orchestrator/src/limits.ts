import { appendFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { saveState, type OrchestratorState } from './state.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOG_PATH = path.join(__dirname, '..', 'orchestrator.log')

export function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  appendFileSync(LOG_PATH, line + '\n', 'utf-8')
}

export function isUsageLimitError(output: string): boolean {
  return (
    output.includes('rate limit') ||
    output.includes('usage limit') ||
    output.includes('429') ||
    output.includes('too many requests') ||
    output.toLowerCase().includes('usage_limit_reached')
  )
}

export function isContextWindowError(output: string): boolean {
  return (
    output.includes('context window') ||
    output.includes('context_length_exceeded') ||
    output.includes('maximum context')
  )
}

export function parseResetTime(output: string): Date {
  const retryAfter = output.match(/retry[- ]after[:\s]+(\d+)/i)
  if (retryAfter) {
    return new Date(Date.now() + parseInt(retryAfter[1]) * 1000)
  }
  const resetAt = output.match(/reset(?:s)? at (\d{2}:\d{2})/i)
  if (resetAt) {
    const [hh, mm] = resetAt[1].split(':').map(Number)
    const d = new Date()
    d.setHours(hh, mm, 0, 0)
    if (d < new Date()) d.setDate(d.getDate() + 1)
    return d
  }
  const d = new Date()
  d.setHours(d.getHours() + 5, 0, 0, 0)
  return d
}

export async function sleepUntil(until: Date): Promise<void> {
  const ms = Math.max(0, until.getTime() - Date.now())
  const mins = Math.round(ms / 60000)
  log(`Límite alcanzado. Reanudando a las ${until.toLocaleTimeString('es-AR')} (en ${mins} min).`)
  await new Promise(resolve => setTimeout(resolve, ms))
}

export async function handleUsageLimit(output: string, state: OrchestratorState): Promise<void> {
  const resetAt = parseResetTime(output)
  state.pausedUntil = resetAt.toISOString()
  saveState(state)
  await sleepUntil(resetAt)
  state.pausedUntil = null
  saveState(state)
}

const BASE_DELAY_MS = 2_000
const MAX_DELAY_MS = 5 * 60 * 1000

export async function exponentialBackoff(attempt: number): Promise<void> {
  const ms = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
  log(`Backoff: esperando ${ms}ms (intento ${attempt})`)
  await new Promise(resolve => setTimeout(resolve, ms))
}
