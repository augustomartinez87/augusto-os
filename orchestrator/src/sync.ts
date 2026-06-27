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
    rows.push({ item_id: id, project, priority: c[2], label, state: c[4], updated_at: new Date().toISOString() })
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
  try { await tryAutopilotPick() } catch (e) { log(`[autopilot] error en tick: ${(e as Error).message}`) }
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
