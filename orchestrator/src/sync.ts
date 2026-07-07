// src/sync.ts — S-007 Fase A: espeja el estado del loop a Supabase (control plane).
// Sin dependencias: usa fetch contra la REST API (PostgREST) de Supabase.
// Degradación total: si faltan SUPABASE_URL/SERVICE_KEY, no-op. Correr con `npm run sync`.
import { readFileSync, existsSync, appendFileSync, readdirSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadState, type OrchestratorState } from './state.js'
import { log } from './limits.js'
import { getOperatorState } from './operator-state.js'
import { tryAutopilotPick } from './autopilot.js'
import { MODEL_PLANNER, MODEL_BUILDER } from './models.js'
import { readLoopHeartbeat } from './loop-heartbeat.js'
import { shouldRunCleanup, cleanDiskLogs, cleanSupabaseLogs } from './log-cleanup.js'
import { shouldRunBalanceCheck, fetchDeepSeekBalance } from './scout/deepseek.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ORCH_DIR = path.join(__dirname, '..')
const SYSTEM_DIR = path.join(__dirname, '..', '..', 'system')
const LOG_FILE = path.join(ORCH_DIR, 'orchestrator.log')
const INTAKE = path.join(SYSTEM_DIR, 'FEATURE-INTAKE.md')
const BACKLOG = path.join(SYSTEM_DIR, 'BACKLOG.md')
const OPERATOR_STATE_YAML = path.join(SYSTEM_DIR, 'OPERATOR_STATE.yaml')

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY

function headers(extra?: Record<string, string>): Record<string, string> {
  return { 'Content-Type': 'application/json', apikey: KEY!, Authorization: `Bearer ${KEY}`, ...extra }
}

async function rest(method: string, q: string, body?: unknown, extra?: Record<string, string>): Promise<any> {
  const res = await fetch(`${URL}/rest/v1/${q}`, {
    method,
    headers: headers(extra),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

async function upsert(table: string, rows: unknown[]): Promise<void> {
  if (!rows.length) return
  await rest('POST', table, rows, { Prefer: 'resolution=merge-duplicates,return=minimal' })
}

function modelShortName(m: string): string {
  if (m.includes('opus')) return 'Opus'
  if (m.includes('sonnet')) return 'Sonnet'
  if (m.includes('haiku')) return 'Haiku'
  return m.split('-').slice(0, 2).join('-')
}

// S-015: emite presencia real a orch_presence. Ambos roles (planner+builder) reciben
// un heartbeat en cada tick. S-027 agrega el rol 'loop' cuyo last_heartbeat viene de
// index.ts (no de sync.ts) — permite distinguir "control plane vivo" de "proceso de build vivo".
async function pushPresence(s: OrchestratorState | null): Promise<void> {
  const now = new Date().toISOString()
  const plannerModel = modelShortName(MODEL_PLANNER)
  const builderModel = modelShortName(MODEL_BUILDER)

  if (!s) {
    await upsert('orch_presence', [
      { role: 'planner', model: plannerModel, state: 'idle', feature_id: null, step_no: null, detail: null, last_heartbeat: now, updated_at: now },
      { role: 'builder', model: builderModel, state: 'idle', feature_id: null, step_no: null, detail: null, last_heartbeat: now, updated_at: now },
    ])
    return
  }

  const steps = s.steps
  const running = steps.find((st) => st.status === 'running')
  const anyBlocked = steps.some((st) => st.status === 'blocked')
  const allDone = steps.length > 0 && steps.every((st) => st.status === 'done')

  let plannerState = 'idle'
  let builderState = 'idle'
  let builderDetail: string | null = null
  let builderStep: number | null = null

  if (anyBlocked) {
    const blocked = steps.find((st) => st.status === 'blocked')
    builderState = 'blocked'
    builderDetail = (blocked?.desc ?? 'Un paso quedó bloqueado.').slice(0, 120)
  } else if (steps.length === 0) {
    plannerState = 'planning'
  } else if (running) {
    builderState = 'building'
    builderDetail = running.desc.slice(0, 120)
    builderStep = running.id
  } else if (allDone && s.merged) {
    builderState = 'deploying'
    builderDetail = 'Pusheando a main.'
  } else if (allDone) {
    builderState = 'verifying'
    builderDetail = 'Verificando (tsc · lint · tests).'
  }

  const rows: unknown[] = [
    {
      role: 'planner', model: plannerModel, state: plannerState,
      feature_id: s.featureId, step_no: null,
      detail: plannerState === 'planning' ? 'Descomponiendo el spec en pasos.' : null,
      last_heartbeat: now, updated_at: now,
    },
    {
      role: 'builder', model: builderModel, state: builderState,
      feature_id: s.featureId, step_no: builderStep, detail: builderDetail,
      last_heartbeat: now, updated_at: now,
    },
  ]

  // S-027: emitir el heartbeat del proceso de build (index.ts) como rol 'loop'.
  // last_heartbeat es el timestamp que escribió index.ts, no el de sync.ts.
  // Si el loop se cuelga, ese timestamp deja de avanzar mientras los de planner/builder siguen frescos.
  const loopHb = readLoopHeartbeat()
  if (loopHb && loopHb.featureId === s.featureId) {
    rows.push({
      role: 'loop', model: null, state: 'running',
      feature_id: loopHb.featureId, step_no: null, detail: loopHb.phase,
      last_heartbeat: loopHb.lastHeartbeat,  // timestamp real del loop, no de sync
      updated_at: now,
    })
  }

  await upsert('orch_presence', rows)
}

function deriveState(s: OrchestratorState): string {
  if (s.pushed) return 'done'
  if (s.steps.some((x) => x.status === 'blocked')) return 'blocked'
  if (s.steps.length > 0 && s.steps.every((x) => x.status === 'done')) return 'review'
  return 'active'
}

function currentStep(s: OrchestratorState): number {
  const pend = s.steps.find((x) => x.status !== 'done')
  return pend ? pend.id : s.steps.length
}

// S-034: chequeo proactivo de saldo DeepSeek, cacheado unos minutos (ver
// BALANCE_CHECK_INTERVAL_MS en deepseek.ts) — no golpear de más su API en cada tick de 5s.
let lastBalanceCheckAt = 0
async function pushDeepSeekBalance(): Promise<void> {
  if (!shouldRunBalanceCheck(lastBalanceCheckAt)) return
  lastBalanceCheckAt = Date.now()
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return
  const balance = await fetchDeepSeekBalance(apiKey)
  if (!balance) return
  await upsert('orch_scout_status', [{
    id: 1,
    is_available: balance.isAvailable,
    total_balance: balance.totalBalance,
    currency: balance.currency,
    checked_at: new Date().toISOString(),
  }])
}

let lastCleanupAt = 0  // corre en el primer tick (0 → diff = Inf) y luego cada hora
let logOffset = -1
async function pushLogTail(featureId: string): Promise<void> {
  if (!existsSync(LOG_FILE)) return
  const content = readFileSync(LOG_FILE, 'utf-8')
  if (logOffset < 0) { logOffset = content.length; return } // primera vuelta: no reenviar histórico
  if (content.length <= logOffset) return
  const lines = content.slice(logOffset).split('\n').filter((l) => l.trim() && !l.includes('[telegram]') && !l.includes('[sync]'))
  logOffset = content.length
  if (lines.length) {
    await rest('POST', 'orch_logs', lines.slice(-50).map((line) => ({ feature_id: featureId, line })))
  }
}

const seenIdeas = new Set<string>()
async function pullWebIdeas(): Promise<void> {
  const ideas = await rest('GET', 'orch_ideas?source=eq.web&select=id,text,created_at&order=created_at.asc')
  for (const i of ideas ?? []) {
    if (seenIdeas.has(i.id)) continue
    seenIdeas.add(i.id)
    appendFileSync(INTAKE, `\n- [${i.created_at}] (web) ${i.text}`, 'utf-8')
    log(`[sync] idea desde la web → FEATURE-INTAKE.md`)
  }
}

// Escribe OPERATOR_STATE.yaml preservando formato y comentarios originales.
function writeOperatorStateYaml(mode: string, responseStyle: string): void {
  const content =
    `mode: ${mode}        # PRODUCT | OFFICE | SLEEP\n` +
    `available_for_questions: true\n` +
    `response_style: ${responseStyle}   # normal | short\n` +
    `\n` +
    `# PRODUCT: el sistema puede hacer preguntas abiertas\n` +
    `# OFFICE:  solo preguntas Sí/No o A/B/C\n` +
    `# SLEEP:   no bloquea, registra pendientes y sigue (loops nocturnos)\n` +
    `#\n` +
    `# Fase 1: el loop lee este archivo y loguea el modo al iniciar.\n` +
    `# El gating por modo (cuándo interrumpir, cuándo seguir solo) se implementa en Fase 2.\n`
  writeFileSync(OPERATOR_STATE_YAML, content, 'utf-8')
}

let seenOperatorUpdatedAt: string | null = null
async function pullOperatorState(): Promise<void> {
  const rows = await rest('GET', 'orch_operator_state?id=eq.1&select=mode,response_style,updated_at')
  const row = (rows ?? [])[0]
  if (!row) return
  if (row.updated_at === seenOperatorUpdatedAt) return
  seenOperatorUpdatedAt = row.updated_at
  const current = getOperatorState(OPERATOR_STATE_YAML)
  if (row.mode === current.mode && row.response_style === current.responseStyle) return
  writeOperatorStateYaml(row.mode, row.response_style)
  log(`[sync] OPERATOR_STATE actualizado: mode=${row.mode} response_style=${row.response_style}`)
}

// Parsea system/BACKLOG.md (tablas markdown por sección) → filas para orch_backlog.
function parseBacklog(): unknown[] {
  if (!existsSync(BACKLOG)) return []
  const rows: unknown[] = []
  let project = 'Sistema'
  for (const ln of readFileSync(BACKLOG, 'utf-8').split('\n')) {
    if (ln.startsWith('## ')) { project = ln.slice(3).split(/[([]/)[0].trim(); continue }
    if (!ln.startsWith('|')) continue
    const c = ln.split('|').map((x) => x.trim())
    if (c.length < 6) continue
    const id = c[1]
    if (!id || id === 'ID' || /^-+$/.test(id)) continue
    const desc = c[3]
    const bold = desc.match(/\*\*(.+?)\*\*/)
    let label = (bold ? bold[1] : desc).replace(/[*`]/g, '')
    label = label.split(/\s[—–-]\s| \(/)[0].trim().slice(0, 52)
    // Ejecutor: c[5] en formato nuevo (7+ celdas), 'manual' por defecto en filas sin columna
    const ejecutor = (c.length >= 7 ? c[5] : 'manual').trim() || 'manual'
    rows.push({ item_id: id, project, priority: c[2], label, state: c[4], ejecutor, updated_at: new Date().toISOString() })
  }
  return rows
}

// Sube las ideas de FEATURE-INTAKE.md (telegram/local) a orch_ideas para que se vean en el dashboard.
async function pushIntakeIdeas(): Promise<void> {
  if (!existsSync(INTAKE)) return
  const ideas: { text: string; source: string; created_at: string }[] = []
  for (const ln of readFileSync(INTAKE, 'utf-8').split('\n')) {
    const m = ln.match(/^- \[(.+?)\] \((.+?)\) (.+)$/)
    if (m) ideas.push({ created_at: m[1], source: m[2], text: m[3].trim() })
  }
  if (!ideas.length) return
  const existing = await rest('GET', 'orch_ideas?select=text')
  const have = new Set((existing ?? []).map((x: any) => x.text))
  const toInsert = ideas.filter((i) => !have.has(i.text))
  if (toInsert.length) await rest('POST', 'orch_ideas', toInsert, { Prefer: 'return=minimal' })
}

async function tick(): Promise<void> {
  const s = loadState()
  let featureId = 'idle'
  await pushPresence(s)
  if (s) {
    featureId = s.featureId
    await upsert('orch_runs', [{
      feature_id: s.featureId, target: process.env.ACTIVE_TARGET ?? null, title: s.featureId,
      state: deriveState(s), current_step: currentStep(s), total_steps: s.steps.length,
      branch: s.branch, updated_at: new Date().toISOString(),
    }])
    await upsert('orch_steps', s.steps.map((st) => ({
      feature_id: s.featureId, step_no: st.id, descripcion: st.desc.slice(0, 280),
      status: st.status, commit_sha: st.commit, updated_at: new Date().toISOString(),
    })))
  }
  // Features ya finalizadas (archivadas) → como done, para el historial del dashboard.
  for (const f of readdirSync(ORCH_DIR).filter((n) => /^STATE\..*\.archived\.json$/.test(n))) {
    try {
      const a = JSON.parse(readFileSync(path.join(ORCH_DIR, f), 'utf-8'))
      await upsert('orch_runs', [{
        feature_id: a.featureId, title: a.featureId, state: 'done',
        current_step: a.steps.length, total_steps: a.steps.length, branch: a.branch, updated_at: a.updatedAt,
      }])
    } catch { /* ignore */ }
  }
  await upsert('orch_backlog', parseBacklog())
  await pushLogTail(featureId)
  await pushIntakeIdeas()
  await pullWebIdeas()
  await pullOperatorState()
  try { await pushDeepSeekBalance() } catch (e) { log(`[sync] balance DeepSeek: ${(e as Error).message}`) }
  try { await tryAutopilotPick() } catch (e) { log(`[autopilot] error en tick: ${(e as Error).message}`) }

  if (shouldRunCleanup(lastCleanupAt)) {
    lastCleanupAt = Date.now()
    try {
      const disk = cleanDiskLogs()
      if (disk.deleted.length) log(`[sync] cleanup disco: ${disk.deleted.length} archivos eliminados (${disk.deleted.join(', ')})`)
      const supa = await cleanSupabaseLogs(rest)
      if (supa.deletedRows > 0) log(`[sync] cleanup orch_logs: ${supa.deletedRows} filas eliminadas`)
    } catch (e) { log(`[sync] cleanup: ${(e as Error).message}`) }
  }
}

async function run(): Promise<void> {
  if (!URL || !KEY) { log('[sync] SUPABASE_URL/SUPABASE_SERVICE_KEY no configurados — sync deshabilitado.'); return }
  log('[sync] Espejando el estado del loop a Supabase cada 5s...')
  while (true) {
    try { await tick() } catch (e) { log(`[sync] error: ${(e as Error).message}`) }
    await new Promise((r) => setTimeout(r, 5000))
  }
}

run().catch((e) => { console.error('[sync] fatal:', e); process.exit(1) })
