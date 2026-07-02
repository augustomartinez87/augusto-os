import { mkdirSync, appendFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGS_DIR = path.join(__dirname, '..', 'logs')

export interface InvocationRecord {
  featureId: string
  stepId?: number
  role: string
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  durationMs: number
  exitCode: number
  ts: string
}

export type InvocationInput = Omit<InvocationRecord, 'ts'>

export function recordInvocation(rec: InvocationInput): void {
  try {
    mkdirSync(LOGS_DIR, { recursive: true })
    const entry: InvocationRecord = { ...rec, ts: new Date().toISOString() }
    const filePath = path.join(LOGS_DIR, `metrics-${rec.featureId}.json`)
    appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8')
  } catch (e) {
    console.warn('[metrics] Error al registrar invocación:', e)
  }
}

export interface ClaudeJsonOutput {
  type?: string
  subtype?: string
  result?: string
  session_id?: string
  total_cost_usd?: number
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
  duration_ms?: number
  is_error?: boolean
}

export interface ParsedClaudeOutput {
  text: string
  parsed: ClaudeJsonOutput | null
}

export function parseClaudeJson(raw: string): ParsedClaudeOutput {
  try {
    const parsed: ClaudeJsonOutput = JSON.parse(raw)
    const text = typeof parsed.result === 'string' ? parsed.result : raw
    return { text, parsed }
  } catch {
    console.warn('[metrics] No se pudo parsear el output JSON de Claude, métricas de uso omitidas')
    return { text: raw, parsed: null }
  }
}
