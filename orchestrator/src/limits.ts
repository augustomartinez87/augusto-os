import { appendFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execa } from 'execa'
import { saveState, type OrchestratorState } from './state.js'
import { MODEL_INTAKE } from './models.js'
import { parseClaudeJson, type ClaudeJsonOutput } from './metrics.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOG_PATH = path.join(__dirname, '..', 'orchestrator.log')

export function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  appendFileSync(LOG_PATH, line + '\n', 'utf-8')
}

export class UsageLimitError extends Error {
  output: string
  constructor(output: string) {
    super('Usage limit reached')
    this.name = 'UsageLimitError'
    this.output = output
  }
}

const LIMIT_RESULT_RE = /session limit|usage limit|rate limit|limit reached|too many requests|usage_limit_reached/i
const LIMIT_TEXT_RE = /session limit|usage limit|rate limit|limit reached|too many requests|usage_limit_reached|"api_error_status"\s*:\s*429|HTTP\s+429|"?status"?(?:\s+code)?[:\s]+429/i

// Extrae el primer objeto JSON `type:result` embebido en el output (tolerante a
// basura antes/después por `all:true` en execa). El escaneo de llaves es
// STRING-AWARE a propósito: un `{` o `}` suelto dentro del campo `result` (muy
// común cuando el modelo explica o escribe código) NO debe cerrar el objeto
// antes de tiempo. Contar llaves sin mirar strings truncaba el candidato, hacía
// fallar el parse y caía al fallback de texto, produciendo un falso positivo con
// `is_error:false` que dormía el loop horas (el bug que F-0028/S-036 evita).
function extractResultJson(output: string): ClaudeJsonOutput | null {
  let i = 0
  while (i < output.length) {
    const start = output.indexOf('{', i)
    if (start === -1) break
    let depth = 0
    let inString = false
    let escaped = false
    let end = -1
    for (let j = start; j < output.length; j++) {
      const ch = output[j]
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === '{') depth++
      else if (ch === '}') { depth--; if (depth === 0) { end = j; break } }
    }
    if (end === -1) break
    const candidate = output.slice(start, end + 1)
    if (/"type"\s*:\s*"result"/.test(candidate)) {
      const { parsed } = parseClaudeJson(candidate)
      if (parsed?.type === 'result') return parsed
    }
    i = start + 1
  }
  return null
}

export function isUsageLimitError(output: string): boolean {
  const parsed = extractResultJson(output)
  if (parsed !== null) {
    if (parsed.is_error !== true) return false
    return parsed.api_error_status === 429 || LIMIT_RESULT_RE.test(parsed.result ?? '')
  }
  return LIMIT_TEXT_RE.test(output)
}

export function isContextWindowError(output: string): boolean {
  return (
    output.includes('context window') ||
    output.includes('context_length_exceeded') ||
    output.includes('maximum context')
  )
}

function to24h(h: number, m: number, period: string): [number, number] {
  if (h === 12) return period.toLowerCase() === 'am' ? [0, m] : [12, m]
  return period.toLowerCase() === 'am' ? [h, m] : [h + 12, m]
}

export function parseResetTime(output: string): Date {
  const retryAfter = output.match(/retry[- ]after[:\s]+(\d+)/i)
  if (retryAfter) {
    return new Date(Date.now() + parseInt(retryAfter[1]) * 1000)
  }
  // 24h: "reset at 14:00" / "resets at 14:00". El negative lookahead `(?!\s*(?:am|pm))`
  // es CRÍTICO: sin él, "resets at 11:00pm" / "resets at 04:40pm" (12h de dos dígitos con
  // "at") matchean acá primero, descartan el meridiano y devuelven la hora errada por 12h.
  // El lookahead fuerza que estos casos caigan a las ramas 12h de abajo.
  const resetAt = output.match(/reset(?:s)? at (\d{2}:\d{2})(?!\s*(?:am|pm))/i)
  if (resetAt) {
    const [hh, mm] = resetAt[1].split(':').map(Number)
    const d = new Date()
    d.setHours(hh, mm, 0, 0)
    if (d < new Date()) d.setDate(d.getDate() + 1)
    return d
  }
  // 12h con minutos: "resets 4:40pm", "resets at 4:40 PM"
  const reset12hMin = output.match(/reset(?:s)?(?:\s+at)?\s+(\d{1,2}):(\d{2})\s*(am|pm)/i)
  if (reset12hMin) {
    const [hh, mm] = to24h(parseInt(reset12hMin[1]), parseInt(reset12hMin[2]), reset12hMin[3])
    const d = new Date()
    d.setHours(hh, mm, 0, 0)
    if (d < new Date()) d.setDate(d.getDate() + 1)
    return d
  }
  // 12h sin minutos: "resets 12am", "resets 4pm"
  const reset12h = output.match(/reset(?:s)?(?:\s+at)?\s+(\d{1,2})\s*(am|pm)/i)
  if (reset12h) {
    const [hh, mm] = to24h(parseInt(reset12h[1]), 0, reset12h[2])
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

function hasExplicitResetTime(output: string): boolean {
  return (
    /retry[- ]after[:\s]+(\d+)/i.test(output) ||
    /reset(?:s)? at (\d{2}:\d{2})(?!\s*(?:am|pm))/i.test(output) ||
    /reset(?:s)?(?:\s+at)?\s+\d{1,2}:\d{2}\s*(?:am|pm)/i.test(output) ||
    /reset(?:s)?(?:\s+at)?\s+\d{1,2}\s*(?:am|pm)/i.test(output)
  )
}

export async function handleUsageLimit(output: string, state: OrchestratorState, opts?: ProbeOpts): Promise<void> {
  const pollSleep = (ms: number): Promise<void> =>
    opts?.sleepMs ? opts.sleepMs(ms) : new Promise(resolve => setTimeout(resolve, ms))

  if (hasExplicitResetTime(output)) {
    const resetAt = parseResetTime(output)
    state.pausedUntil = resetAt.toISOString()
    saveState(state)
    await (opts?.sleepUntilFn ? opts.sleepUntilFn(resetAt) : sleepUntil(resetAt))
    while (!(await probeAvailability(opts))) {
      log(`Límite persiste tras reset. Reintentando en ${PROBE_INTERVAL_MS / 60000} min.`)
      await pollSleep(PROBE_INTERVAL_MS)
    }
  } else {
    log(`Sin hora de reset parseable. Sondeando disponibilidad cada ${PROBE_INTERVAL_MS / 60000} min.`)
    let available = false
    while (!available) {
      await pollSleep(PROBE_INTERVAL_MS)
      available = await probeAvailability(opts)
      if (!available) log(`Límite persiste. Próximo sondeo en ${PROBE_INTERVAL_MS / 60000} min.`)
    }
  }
  state.pausedUntil = null
  saveState(state)
}

export const PROBE_INTERVAL_MS = 15 * 60 * 1000

export interface ProbeOpts {
  probeFn?: () => Promise<boolean>
  /** Inyectable para tests: reemplaza el setTimeout del loop de poll */
  sleepMs?: (ms: number) => Promise<void>
  /** Inyectable para tests: reemplaza sleepUntil en la rama de hora explícita */
  sleepUntilFn?: (until: Date) => Promise<void>
}

// Disponibilidad = el CLI NO reportó límite de uso. MISMA señal que executor.ts:195
// (`isUsageLimitError(output) || exitCode === 429`), invertida.
//
// NO se usa `exitCode === 0` a propósito: es una señal rota para este ping.
//  - Falso negativo: `--max-turns 1` corta en exit 1 aun en una llamada exitosa
//    cuando el modelo emite tool_use en el turno 1 (ver models.ts:10-12). Eso
//    significa que la API respondió (hay tokens) pero exit 0 diría "no disponible"
//    y nunca se reanudaría → la "pausa ciega" que F-0028 viene a arreglar.
//  - Falso positivo: exit 0 con "usage limit" en el texto → reanudaría y volvería a
//    chocar el límite de inmediato.
// Se mira stdout Y stderr, porque el límite puede llegar en cualquiera de los dos.
export function isProbeAvailable(output: string, exitCode: number | null): boolean {
  return !isUsageLimitError(output) && exitCode !== 429
}

export async function probeAvailability(opts?: ProbeOpts): Promise<boolean> {
  if (opts?.probeFn) return opts.probeFn()
  // `--max-turns 1` = costo mínimo: un solo turno del modelo barato. Su exit code no
  // se usa para decidir (ver isProbeAvailable); solo importa si reportó límite.
  const result = await execa('claude', [
    '--model', MODEL_INTAKE,
    '--max-turns', '1',
    '-p', 'ok',
  ], {
    reject: false,
    all: true,
    stdin: 'ignore',
  })
  const output = result.all ?? result.stdout ?? ''
  return isProbeAvailable(output, result.exitCode ?? null)
}

const BASE_DELAY_MS = 2_000
const MAX_DELAY_MS = 5 * 60 * 1000

export async function exponentialBackoff(attempt: number): Promise<void> {
  const ms = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
  log(`Backoff: esperando ${ms}ms (intento ${attempt})`)
  await new Promise(resolve => setTimeout(resolve, ms))
}
