import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execa } from 'execa'
import { getOperatorState } from './operator-state.js'
import { STATE_PATH } from './state.js'
import { runIntake, type IntakeResult } from './intake.js'
import { runArchitect, getNextFeatureId, type ArchitectOpts } from './architect.js'
import { runScout } from './scout/index.js'
import { setActiveTarget, getRepoRoot } from './targets.js'
import { appendAdr, DECISIONS_PATH } from './adr.js'
import { log } from './limits.js'
import { readLoopHeartbeat, isLoopHeartbeatFresh, LOOP_HB_PATH } from './loop-heartbeat.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ORCH_DIR = path.join(__dirname, '..')
const SYSTEM_DIR = path.join(__dirname, '..', '..', 'system')

const DEFAULT_BACKLOG_PATH = path.join(SYSTEM_DIR, 'BACKLOG.md')

export const MAP_PATH = path.join(ORCH_DIR, 'AUTOPILOT_MAP.json')
export const COUNTER_PATH = path.join(ORCH_DIR, 'AUTOPILOT_COUNTER.json')
export const LOCK_PATH = path.join(ORCH_DIR, 'AUTOPILOT.lock')

export const MAX_PER_DAY = 5

export const RISK_KEYWORDS = [
  'dinero', 'producción', 'produccion', 'legal', 'mutuo', 'pagaré', 'pagare',
  'migración', 'migracion', 'migrate', 'deploy a prod', 'dinero real', 'cuenta real', 'transferencia',
]

// Only Pipeline-1 targets. 'Sistema' is Pipeline-2 (self-modification) — never eligible here.
const SECTION_TARGET_MAP: Record<string, string> = {
  Kredy: 'kredy',
  Spensiv: 'spensiv',
  Argos: 'argos',
}

export interface BacklogRow {
  id: string
  project: string
  target: string
  priority: number
  label: string
  fullLine: string
  state: string
  ejecutor: string  // 'auto' | 'cc' | 'manual' — siempre 'auto' en los ítems que llegan a rows[]
}

// ── Backlog parsing ───────────────────────────────────────────────────────────

export function parseEligibleBacklog(backlogPath = DEFAULT_BACKLOG_PATH): BacklogRow[] {
  if (!existsSync(backlogPath)) return []
  const lines = readFileSync(backlogPath, 'utf-8').split('\n')
  const rows: BacklogRow[] = []
  let project = 'Sistema'

  for (const ln of lines) {
    if (ln.startsWith('## ')) {
      project = ln.slice(3).split(/[([]/)[0].trim()
      continue
    }
    if (!ln.startsWith('|')) continue
    const c = ln.split('|').map(x => x.trim())
    // '' | ID | P | Desc | State | ''
    if (c.length < 5) continue
    const id = c[1]
    if (!id || id === 'ID' || /^-+$/.test(id)) continue

    // Priority must be a plain number ≥ 2 (not ✅ or text)
    if (!/^\d+$/.test(c[2])) continue
    const priority = parseInt(c[2], 10)
    if (priority < 2) continue

    // State must be exactly 'pending' (case-insensitive, trimmed) — nothing else
    if (c[4].trim().toLowerCase() !== 'pending') continue

    // Skip sections that belong to Pipeline 2 (Sistema) or any unknown section
    const target = SECTION_TARGET_MAP[project]
    if (!target) continue

    // Allowlist: sólo ítems con Ejecutor=auto son elegibles.
    // Fail-safe: columna ausente o vacía → 'manual' → nunca se autoejecutaa.
    const ejecutor = (c.length >= 7 ? c[5] : '').trim().toLowerCase()
    if (ejecutor !== 'auto') continue

    // Red de seguridad secundaria: ítem marcado 'auto' pero con keywords de riesgo → warning + skip.
    const llower = ln.toLowerCase()
    const hitKw = RISK_KEYWORDS.find(kw => llower.includes(kw.toLowerCase()))
    if (hitKw) {
      log(`[autopilot] ⚠ ${id} marcado 'auto' pero contiene keyword de riesgo "${hitKw}" — saltando.`)
      continue
    }

    const desc = c[3]
    const bold = desc.match(/\*\*(.+?)\*\*/)
    let label = (bold ? bold[1] : desc).replace(/[*`]/g, '')
    label = label.split(/\s[—–-]\s| \(/)[0].trim()

    rows.push({ id, project, target, priority, label, fullLine: ln, state: c[4].trim(), ejecutor: 'auto' })
  }

  // Stable sort by priority ascending; Array.sort is stable in V8 → insertion order preserved for ties
  rows.sort((a, b) => a.priority - b.priority)
  return rows
}

// Returns true if the row was found and updated, false if the ID was not present (safe no-op).
export function markBacklogState(id: string, newState: string, backlogPath = DEFAULT_BACKLOG_PATH): boolean {
  if (!existsSync(backlogPath)) return false
  const content = readFileSync(backlogPath, 'utf-8')
  const lines = content.split('\n')
  let changed = false
  const updated = lines.map(ln => {
    if (!ln.startsWith('|')) return ln
    const parts = ln.split('|')
    // Format: '' | ID | P | Desc | State | ''  → parts[1]=ID, parts[4]=State
    if (parts.length < 5 || parts[1].trim() !== id) return ln
    parts[4] = ` ${newState} `
    changed = true
    return parts.join('|')
  })
  if (!changed) {
    log(`[autopilot] markBacklogState: ID ${id} no encontrado — skip (el item puede haberse editado manualmente)`)
    return false
  }
  writeFileSync(backlogPath, updated.join('\n'), 'utf-8')
  return true
}

// ── Map (featureId → backlogId) ───────────────────────────────────────────────

interface MapEntry { backlogId: string; pickedAt: string }
type AutopilotMap = Record<string, MapEntry>

function readMap(mapPath = MAP_PATH): AutopilotMap {
  if (!existsSync(mapPath)) return {}
  try { return JSON.parse(readFileSync(mapPath, 'utf-8')) } catch { return {} }
}

function writeMap(m: AutopilotMap, mapPath = MAP_PATH): void {
  writeFileSync(mapPath, JSON.stringify(m, null, 2), 'utf-8')
}

export function recordPick(featureId: string, backlogId: string, mapPath = MAP_PATH): void {
  const m = readMap(mapPath)
  m[featureId] = { backlogId, pickedAt: new Date().toISOString() }
  writeMap(m, mapPath)
}

export function resolveBacklogId(featureId: string, mapPath = MAP_PATH): string | undefined {
  return readMap(mapPath)[featureId]?.backlogId
}

export function clearPick(featureId: string, mapPath = MAP_PATH): void {
  const m = readMap(mapPath)
  delete m[featureId]
  writeMap(m, mapPath)
}

// ── Daily counter ─────────────────────────────────────────────────────────────

interface Counter { date: string; count: number }

function readCounter(counterPath = COUNTER_PATH): Counter {
  if (!existsSync(counterPath)) return { date: '', count: 0 }
  try { return JSON.parse(readFileSync(counterPath, 'utf-8')) } catch { return { date: '', count: 0 } }
}

function writeCounter(c: Counter, counterPath = COUNTER_PATH): void {
  writeFileSync(counterPath, JSON.stringify(c, null, 2), 'utf-8')
}

export function canTriggerToday(maxPerDay = MAX_PER_DAY, counterPath = COUNTER_PATH): boolean {
  const today = new Date().toISOString().split('T')[0]
  const c = readCounter(counterPath)
  if (c.date !== today) return true
  return c.count < maxPerDay
}

export function incrementCounter(counterPath = COUNTER_PATH): void {
  const today = new Date().toISOString().split('T')[0]
  const c = readCounter(counterPath)
  writeCounter(c.date !== today ? { date: today, count: 1 } : { date: today, count: c.count + 1 }, counterPath)
}

// ── Lock ──────────────────────────────────────────────────────────────────────
// Lock file format: { createdAt: ISO, featureId: string | null }
// featureId se rellena en updateLockFeatureId() una vez que el Architect devuelve el ID,
// permitiendo al staleness checker correlacionar el lock con el heartbeat del loop.

interface LockFile { createdAt: string; featureId: string | null }

function writeLock(lockPath: string, featureId: string | null): void {
  writeFileSync(lockPath, JSON.stringify({ createdAt: new Date().toISOString(), featureId }), 'utf-8')
}

// Actualiza featureId en el lock existente (sin cambiar createdAt).
// Llamar después de que el Architect devuelve el featureId para que el
// staleness checker pueda correlacionarlo con el heartbeat del loop.
export function updateLockFeatureId(featureId: string, lockPath = LOCK_PATH): void {
  if (!existsSync(lockPath)) return
  try {
    const lock: LockFile = JSON.parse(readFileSync(lockPath, 'utf-8'))
    lock.featureId = featureId
    writeFileSync(lockPath, JSON.stringify(lock), 'utf-8')
  } catch { /* ignore */ }
}

// Determina si el lock existente corresponde a un proceso vivo:
// primero chequea el heartbeat del loop (señal directa del proceso), luego cae
// a staleness por tiempo (gracia mientras el proceso arranca o si nunca llegó a emitir).
export function acquireLock(staleMs = 10 * 60 * 1000, lockPath = LOCK_PATH, hbPath = LOOP_HB_PATH): boolean {
  if (existsSync(lockPath)) {
    let lock: LockFile | null = null
    try {
      lock = JSON.parse(readFileSync(lockPath, 'utf-8'))
    } catch {
      log('[autopilot] Lock malformado, pisando...')
      writeLock(lockPath, null)
      return true
    }

    const age = Date.now() - new Date(lock!.createdAt).getTime()
    const hb = readLoopHeartbeat(hbPath)

    // Si hay heartbeat fresco del loop → proceso vivo, nunca pisar
    if (isLoopHeartbeatFresh(hb)) {
      return false
    }

    // Sin heartbeat fresco: respetar el período de gracia (proceso arrancando)
    if (age < staleMs) return false

    // Lock stale + sin heartbeat → proceso muerto o colgado; reclamar con log explícito
    const hbAge = hb
      ? `heartbeat ${Math.round((Date.now() - new Date(hb.lastHeartbeat).getTime()) / 1000)}s atrás`
      : 'sin heartbeat de loop'
    log(
      `[autopilot] Lock stale (${Math.round(age / 1000)}s) — ${hbAge}. ` +
      `Dueño anterior: feature=${lock!.featureId ?? 'desconocido'}, pid=${hb?.pid ?? 'desconocido'}. Reclamando.`
    )
  }
  writeLock(lockPath, null)
  return true
}

export function releaseLock(lockPath = LOCK_PATH): void {
  try { if (existsSync(lockPath)) unlinkSync(lockPath) } catch { /* ignore */ }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function hasAutopilotAdr(decisionsPath = DECISIONS_PATH): boolean {
  if (!existsSync(decisionsPath)) return false
  return readFileSync(decisionsPath, 'utf-8').toLowerCase().includes('loops nocturnos')
}

let lastEmptyLogAt = 0
const EMPTY_LOG_INTERVAL_MS = 10 * 60 * 1000

function defaultSpawnLoop(featureId: string): void {
  execa('npm', ['start', featureId], {
    cwd: ORCH_DIR,
    detached: true,
    stdio: 'ignore',
  }).catch((e: Error) => {
    log(`[autopilot] spawn error para ${featureId}: ${e.message}`)
  })
}

// ── tryAutopilotPick ──────────────────────────────────────────────────────────

export interface AutopilotPickOpts {
  runIntakeFn?: (text: string) => IntakeResult
  runArchitectFn?: (intake: IntakeResult, opts?: ArchitectOpts) => Promise<string>
  /** Injectable for tests: replaces the production setActiveTarget+getRepoRoot+runScout chain.
   *  Return null to skip research (scout disabled or failed). */
  runScoutFn?: (intake: IntakeResult, featureId: string) => Promise<{ markdown: string } | null>
  /** Injectable featuresDir for getNextFeatureId — lets tests control which ID is assigned. */
  featuresDir?: string
  spawnLoop?: (featureId: string) => void
  backlogPath?: string
  decisionsPath?: string
  operatorStatePath?: string
  // For testing: override persistent-file paths
  counterPath?: string
  lockPath?: string
  hbPath?: string
  mapPath?: string
  statePath?: string
}

export async function tryAutopilotPick(opts?: AutopilotPickOpts): Promise<{ featureId: string; backlogId: string } | null> {
  const lockPath = opts?.lockPath ?? LOCK_PATH
  const hbPath = opts?.hbPath ?? LOOP_HB_PATH
  const counterPath = opts?.counterPath ?? COUNTER_PATH
  const mapPath = opts?.mapPath ?? MAP_PATH
  const statePath = opts?.statePath ?? STATE_PATH

  try {
    // 1. Only run in SLEEP mode
    if (getOperatorState(opts?.operatorStatePath).mode !== 'SLEEP') return null

    // 2. Bail if a feature is already running (STATE.json present)
    if (existsSync(statePath)) return null

    // 3. Daily cap
    if (!canTriggerToday(MAX_PER_DAY, counterPath)) {
      log('[autopilot] tope diario alcanzado, esperando a mañana')
      return null
    }

    // 4. Mutex lock — prevents double-spawn in the Planner window.
    //    acquireLock respeta el lock si hay heartbeat fresco del loop (proceso vivo).
    if (!acquireLock(10 * 60 * 1000, lockPath, hbPath)) return null
  } catch (e) {
    log(`[autopilot] error en pre-checks: ${(e as Error).message}`)
    return null
  }

  // Lock is held from here — always release in finally
  // marked: true solo si markBacklogState realmente encontró y cambió el row
  let marked = false
  let pickedBacklogId: string | null = null
  let pickedFeatureId: string | null = null

  try {
    // 5. Find eligible item
    const picks = parseEligibleBacklog(opts?.backlogPath)
    if (!picks.length) {
      const now = Date.now()
      if (now - lastEmptyLogAt >= EMPTY_LOG_INTERVAL_MS) {
        log('[autopilot] SLEEP — no hay items elegibles en el backlog (Ejecutor=auto/pending/sin keywords de riesgo)')
        lastEmptyLogAt = now
      }
      return null
    }

    const pick = picks[0]
    pickedBacklogId = pick.id  // captured here so catch can revert even if markBacklogState throws

    // 6. Mark as in-progress and count the attempt atomically — before any async step.
    //    marked reflects whether the row was actually found (safe no-op if it disappeared by race).
    //    Both happen together so that every attempt counts exactly once against the daily cap.
    const isoNow = new Date().toISOString()
    marked = markBacklogState(pick.id, `armado (autopilot) ${isoNow}`, opts?.backlogPath)
    incrementCounter(counterPath)

    // 7. Intake + Scout + Architect (no LLM for picking — all steps are injectable for tests)
    const intakeFn = opts?.runIntakeFn ?? runIntake
    const intake = intakeFn(pick.label)
    intake.target = pick.target as typeof intake.target  // override: section already tells us the target

    // Pre-compute featureId so scout writes the research file with the correct name and
    // architect uses that same id — prevents a race between the two getNextFeatureId() calls.
    const assignedId = getNextFeatureId(opts?.featuresDir)
    let research: string | undefined
    try {
      if (opts?.runScoutFn) {
        const scoutResult = await opts.runScoutFn(intake, assignedId)
        research = scoutResult?.markdown ?? undefined
      } else {
        // Production path: resolve repo root from active target, then run scout
        setActiveTarget(intake.target)
        const repoRoot = getRepoRoot()
        const scoutResult = await runScout(intake, repoRoot, assignedId)
        research = scoutResult?.markdown ?? undefined
      }
    } catch { /* scout errors never block the pipeline */ }

    const architectFn = opts?.runArchitectFn ?? runArchitect
    const featureFilePath = await architectFn(intake, { research, featureId: assignedId })
    const featureId = path.basename(featureFilePath, '.md')
    pickedFeatureId = featureId  // captured so catch can clean up the map entry

    // 8. Record mapping featureId → backlogId for post-release cleanup
    recordPick(featureId, pick.id, mapPath)

    // 8b. Update lock with featureId so staleness checker can correlate lock ↔ loop heartbeat
    updateLockFeatureId(featureId, lockPath)

    // 9. Write autopilot ADR exactly once (one-time architectural decision record)
    if (!hasAutopilotAdr(opts?.decisionsPath)) {
      appendAdr(
        {
          target: 'sistema',
          origen: 'Instrucción de Augusto',
          titulo: 'Loops nocturnos — sync.ts dispara npm start autónomamente en modo SLEEP',
          decision:
            'sync.ts llama a tryAutopilotPick() en cada tick. Si el modo es SLEEP y el loop está libre, toma el primer ítem P2+/pending/sin-keywords-de-riesgo del backlog, genera el spec vía Architect y spawnea `npm start` en background sin intervención humana.',
          contexto:
            'El operador puede estar OOO total (modo SLEEP activado desde el dashboard). El sistema debe poder avanzar el backlog solo, sin consumir LLM en la decisión de picking (heurístico puro) y con backstops duros: gates del loop, cap 5/día, denylist de riesgo.',
          alternativas:
            'Cron externo (más infra, requiere setup extra). Polling manual por Telegram (requiere disponibilidad del operador).',
          consecuencias:
            'Cap de 5 features/día. Lock con timeout 10 min protege contra crashes del sync. Si un gate humano se activa en SLEEP, el loop pausa en silencio (S-002). El backlog queda en "armado (autopilot) <ISO>" para trazabilidad; si falla el release no se resetea solo.',
        },
        'S-004',
        0,
        opts?.decisionsPath,
      )
    }

    // 10. Fire-and-forget: spawn the main loop process (takes 30-90s to create STATE.json via Planner)
    const spawnFn = opts?.spawnLoop ?? defaultSpawnLoop
    spawnFn(featureId)

    // 11. Release lock (counter already incremented in step 6)
    releaseLock(lockPath)

    log(`[autopilot] SLEEP — arrancó ${featureId} desde ${pick.id} sin intervención.`)
    return { featureId, backlogId: pick.id }
  } catch (e) {
    log(`[autopilot] error durante pick: ${(e as Error).message}`)
    // Revert the backlog row to a distinguishable failure state so it's not re-picked
    // and the operator can see what happened when they return.
    if (marked && pickedBacklogId) {
      markBacklogState(pickedBacklogId, `failed (autopilot) ${new Date().toISOString()}`, opts?.backlogPath)
    }
    // Remove dead map entry if the pick was partially committed
    if (pickedFeatureId) {
      clearPick(pickedFeatureId, mapPath)
    }
    return null
  } finally {
    releaseLock(lockPath)  // idempotent — no-op if already released in step 11
  }
}
