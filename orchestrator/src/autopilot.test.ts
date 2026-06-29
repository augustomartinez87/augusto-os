import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import {
  parseEligibleBacklog,
  markBacklogState,
  RISK_KEYWORDS,
  tryAutopilotPick,
  acquireLock,
  releaseLock,
  canTriggerToday,
  incrementCounter,
  resolveBacklogId,
  MAP_PATH,
  LOCK_PATH,
  COUNTER_PATH,
} from './autopilot.js'
import type { LoopHeartbeat } from './loop-heartbeat.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Sistema items are Pipeline-2 scope — must NEVER be eligible for Pipeline-1 spawns.
// Kredy/Spensiv/Argos are Pipeline-1 targets.
// Ejecutor column added (S-030): only 'auto' items are picked; 'cc'/'manual'/missing → excluded.
const BACKLOG_FIXTURE = `# Backlog — test

## Sistema

| ID | P | Descripción | Estado | Ejecutor |
|----|---|-------------|--------|----------|
| S-001 | 1 | **Item de alta prioridad** — prioridad 1, excluido | pending | cc |
| S-002 | ✅ | **Item completado** | done 2026-06-01 | cc |
| S-003 | 2 | **Item P2 Sistema** — Pipeline 2, nunca elegible | pending | cc |
| S-004 | 3 | **Item con mutuo** — toca mutuo y dinero | pending | manual |
| S-005 | 2 | **Otro item P2 Sistema** | pending | cc |
| S-006 | 4 | **Item P4 Sistema limpio** | pending | cc |
| S-007 | 2 | **Item waiting** — en espera | waiting | cc |
| S-008 | 2 | **Item blocked** — bloqueado | blocked | cc |
| S-009 | 2 | **Item done** — ya terminado | done 2026-06-20 | cc |
| S-010 | 2 | **Item armado** — en proceso | armado (autopilot) 2026-06-26T00:00:00.000Z | cc |

## Kredy

| ID | P | Descripción | Estado | Ejecutor |
|----|---|-------------|--------|----------|
| KR-001 | 2 | **Feature Kredy limpia** | pending | auto |
| KR-002 | 2 | **Feature con producción** — deploy a prod | pending | auto |
| KR-003 | 2 | **Feature Kredy cc** | pending | cc |

## Spensiv

| ID | P | Descripción | Estado | Ejecutor |
|----|---|-------------|--------|----------|
| SP-001 | 3 | **Seed data Spensiv** | pending | auto |
| SP-002 | 3 | **Feature Spensiv cc** | pending | cc |

## Argos

| ID | P | Descripción | Estado | Ejecutor |
|----|---|-------------|--------|----------|
| AR-001 | 4 | **Feature Argos P4** | pending | auto |
| AR-002 | 4 | **Feature Argos manual** | pending | manual |
`

const SLEEP_YAML = `mode: SLEEP
available_for_questions: true
response_style: normal
`

const PRODUCT_YAML = `mode: PRODUCT
available_for_questions: true
response_style: normal
`

// ── parseEligibleBacklog ──────────────────────────────────────────────────────

describe('parseEligibleBacklog', () => {
  let tmpDir: string
  let backlogPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'autopilot-backlog-'))
    backlogPath = path.join(tmpDir, 'BACKLOG.md')
    writeFileSync(backlogPath, BACKLOG_FIXTURE, 'utf-8')
  })

  afterEach(() => { rmSync(tmpDir, { recursive: true }) })

  it('returns [] when the file does not exist', () => {
    expect(parseEligibleBacklog('/no/such/file.md')).toEqual([])
  })

  it('excludes P1 items', () => {
    const rows = parseEligibleBacklog(backlogPath)
    expect(rows.map(r => r.id)).not.toContain('S-001')
  })

  it('excludes ✅ / done items (non-numeric priority)', () => {
    const rows = parseEligibleBacklog(backlogPath)
    expect(rows.map(r => r.id)).not.toContain('S-002')
  })

  it('excludes items with state "waiting"', () => {
    const rows = parseEligibleBacklog(backlogPath)
    expect(rows.map(r => r.id)).not.toContain('S-007')
  })

  it('excludes items with state "blocked"', () => {
    const rows = parseEligibleBacklog(backlogPath)
    expect(rows.map(r => r.id)).not.toContain('S-008')
  })

  it('excludes items with state starting with "done"', () => {
    const rows = parseEligibleBacklog(backlogPath)
    expect(rows.map(r => r.id)).not.toContain('S-009')
  })

  it('excludes items with state "armado (autopilot) ..."', () => {
    const rows = parseEligibleBacklog(backlogPath)
    expect(rows.map(r => r.id)).not.toContain('S-010')
  })

  it('excludes items with state "failed (autopilot) ..." (not pending)', () => {
    const custom = BACKLOG_FIXTURE.replace(
      '| KR-001 | 2 | **Feature Kredy limpia** | pending |',
      '| KR-001 | 2 | **Feature Kredy limpia** | failed (autopilot) 2026-06-27T00:00:00.000Z |',
    )
    writeFileSync(backlogPath, custom, 'utf-8')
    const rows = parseEligibleBacklog(backlogPath)
    expect(rows.map(r => r.id)).not.toContain('KR-001')
  })

  it('excludes items with risk keywords in the line', () => {
    const rows = parseEligibleBacklog(backlogPath)
    // S-004: Sistema section (excluded by section) + manual ejecutor
    expect(rows.map(r => r.id)).not.toContain('S-004')
    // KR-002: auto ejecutor but 'deploy a prod' triggers secondary safety net
    expect(rows.map(r => r.id)).not.toContain('KR-002')
  })

  it('excludes items with Ejecutor=cc', () => {
    const rows = parseEligibleBacklog(backlogPath)
    expect(rows.map(r => r.id)).not.toContain('KR-003')  // cc
    expect(rows.map(r => r.id)).not.toContain('SP-002')  // cc
  })

  it('excludes items with Ejecutor=manual', () => {
    const rows = parseEligibleBacklog(backlogPath)
    expect(rows.map(r => r.id)).not.toContain('AR-002')  // manual
  })

  it('item without Ejecutor column defaults to manual (not picked)', () => {
    const noCol = `## Kredy\n| ID | P | Descripción | Estado |\n|----|---|-------------|--------|\n| KR-099 | 2 | Feature sin columna | pending |\n`
    const tmpFile = path.join(tmpDir, 'noExecutor.md')
    writeFileSync(tmpFile, noCol, 'utf-8')
    expect(parseEligibleBacklog(tmpFile)).toHaveLength(0)
  })

  it('all returned rows have ejecutor === "auto"', () => {
    const rows = parseEligibleBacklog(backlogPath)
    rows.forEach(r => expect(r.ejecutor).toBe('auto'))
  })

  // Bug A: Sistema is Pipeline-2 — all its items must be excluded regardless of priority/state
  it('excludes ALL items from the Sistema section (Pipeline-2 scope)', () => {
    const rows = parseEligibleBacklog(backlogPath)
    const ids = rows.map(r => r.id)
    expect(ids).not.toContain('S-003')  // P2 pending — would have been eligible before the fix
    expect(ids).not.toContain('S-005')  // P2 pending — same
    expect(ids).not.toContain('S-006')  // P4 pending — same
  })

  it('no resulting target is "sistema"', () => {
    const rows = parseEligibleBacklog(backlogPath)
    expect(rows.every(r => r.target !== 'sistema')).toBe(true)
  })

  it('includes only Ejecutor=auto pending items from Pipeline-1 sections without risk keywords', () => {
    const rows = parseEligibleBacklog(backlogPath)
    const ids = rows.map(r => r.id)
    // auto items from Pipeline-1 sections (no risk keywords)
    expect(ids).toContain('KR-001')
    expect(ids).toContain('SP-001')
    expect(ids).toContain('AR-001')
    // cc/manual items must NOT be included even in eligible sections
    expect(ids).not.toContain('KR-003')  // cc
    expect(ids).not.toContain('SP-002')  // cc
    expect(ids).not.toContain('AR-002')  // manual
    // Sistema items must NOT be included (Pipeline-2 scope)
    expect(ids).not.toContain('S-003')
    expect(ids).not.toContain('S-005')
  })

  it('sorts by priority ascending', () => {
    const rows = parseEligibleBacklog(backlogPath)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].priority).toBeGreaterThanOrEqual(rows[i - 1].priority)
    }
    // KR-001 (P2) before SP-001 (P3) before AR-001 (P4)
    const p2 = rows.filter(r => r.priority === 2)
    const p3 = rows.filter(r => r.priority === 3)
    const p4 = rows.filter(r => r.priority === 4)
    expect(rows.indexOf(p2[0])).toBeLessThan(rows.indexOf(p3[0]))
    expect(rows.indexOf(p3[0])).toBeLessThan(rows.indexOf(p4[0]))
  })

  it('assigns correct target from section', () => {
    const rows = parseEligibleBacklog(backlogPath)
    const kr001 = rows.find(r => r.id === 'KR-001')
    const sp001 = rows.find(r => r.id === 'SP-001')
    const ar001 = rows.find(r => r.id === 'AR-001')
    expect(kr001?.target).toBe('kredy')
    expect(sp001?.target).toBe('spensiv')
    expect(ar001?.target).toBe('argos')
  })

  it('RISK_KEYWORDS export is non-empty and safety net blocks auto items with risk keywords', () => {
    expect(RISK_KEYWORDS.length).toBeGreaterThan(0)
    // auto item with risk keyword → caught by secondary safety net → not picked
    const custom = `## Kredy\n| ID | P | Descripción | Estado | Ejecutor |\n|----|---|-------------|--------|----------|\n| KR-099 | 2 | Manejar Dinero real | pending | auto |\n`
    const tmpFile = path.join(tmpDir, 'custom.md')
    writeFileSync(tmpFile, custom, 'utf-8')
    expect(parseEligibleBacklog(tmpFile)).toHaveLength(0)
  })
})

// ── markBacklogState ──────────────────────────────────────────────────────────

describe('markBacklogState', () => {
  let tmpDir: string
  let backlogPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'autopilot-mark-'))
    backlogPath = path.join(tmpDir, 'BACKLOG.md')
    writeFileSync(backlogPath, BACKLOG_FIXTURE, 'utf-8')
  })

  afterEach(() => { rmSync(tmpDir, { recursive: true }) })

  it('changes the state column for the matching ID', () => {
    markBacklogState('KR-001', 'armado (autopilot) 2026-06-27T00:00:00.000Z', backlogPath)
    const content = readFileSync(backlogPath, 'utf-8')
    expect(content).toContain('armado (autopilot) 2026-06-27T00:00:00.000Z')
  })

  it('does not change other rows', () => {
    markBacklogState('KR-001', 'done 2026-06-27 (autopilot)', backlogPath)
    const lines = readFileSync(backlogPath, 'utf-8').split('\n')
    const sp001line = lines.find(l => l.includes('SP-001'))
    expect(sp001line).toContain('pending')
  })

  it('no-op when ID does not exist', () => {
    const before = readFileSync(backlogPath, 'utf-8')
    markBacklogState('NONEXISTENT-999', 'done', backlogPath)
    const after = readFileSync(backlogPath, 'utf-8')
    expect(after).toBe(before)
  })

  it('is idempotent when called twice with same state', () => {
    markBacklogState('KR-001', 'done 2026-06-27 (autopilot)', backlogPath)
    markBacklogState('KR-001', 'done 2026-06-27 (autopilot)', backlogPath)
    const content = readFileSync(backlogPath, 'utf-8')
    const count = (content.match(/done 2026-06-27 \(autopilot\)/g) ?? []).length
    expect(count).toBe(1)
  })

  it('does not break non-table lines', () => {
    markBacklogState('KR-001', 'done', backlogPath)
    const content = readFileSync(backlogPath, 'utf-8')
    expect(content).toContain('# Backlog — test')
    expect(content).toContain('## Sistema')
  })
})

// ── acquireLock / releaseLock ─────────────────────────────────────────────────

describe('acquireLock / releaseLock', () => {
  let tmpDir: string
  let lockPath: string
  let hbPath: string  // non-existent by default → no heartbeat in most tests

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'autopilot-lock-'))
    lockPath = path.join(tmpDir, 'AUTOPILOT.lock')
    hbPath = path.join(tmpDir, 'NO_HB.json')  // doesn't exist — safe default
  })

  afterEach(() => { rmSync(tmpDir, { recursive: true }) })

  it('creates the lock file and returns true when no lock exists', () => {
    expect(existsSync(lockPath)).toBe(false)
    expect(acquireLock(60_000, lockPath, hbPath)).toBe(true)
    expect(existsSync(lockPath)).toBe(true)
  })

  it('returns false when a fresh lock already exists', () => {
    acquireLock(60_000, lockPath, hbPath)
    expect(acquireLock(60_000, lockPath, hbPath)).toBe(false)
  })

  it('overwrites a stale lock (older than staleMs) when no heartbeat', () => {
    const staleTs = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    writeFileSync(lockPath, JSON.stringify({ createdAt: staleTs, featureId: null }), 'utf-8')
    expect(acquireLock(10 * 60 * 1000, lockPath, hbPath)).toBe(true)
  })

  it('releaseLock removes the file', () => {
    acquireLock(60_000, lockPath, hbPath)
    releaseLock(lockPath)
    expect(existsSync(lockPath)).toBe(false)
  })

  it('releaseLock is a no-op when no lock file exists', () => {
    expect(() => releaseLock(lockPath)).not.toThrow()
  })

  // ── liveness-aware (S-027) ────────────────────────────────────────────────
  it('respects a stale-by-time lock when loop heartbeat is fresh', () => {
    const staleTs = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    writeFileSync(lockPath, JSON.stringify({ createdAt: staleTs, featureId: 'F-0099' }), 'utf-8')
    // Fresh heartbeat from the loop process
    writeFileSync(hbPath, JSON.stringify({
      featureId: 'F-0099', pid: 12345, phase: 'building:step-3',
      lastHeartbeat: new Date().toISOString(),
    } satisfies LoopHeartbeat), 'utf-8')
    // Lock must NOT be stolen — process is alive
    expect(acquireLock(10 * 60 * 1000, lockPath, hbPath)).toBe(false)
  })

  it('overwrites a stale lock when heartbeat is cold (loop hung)', () => {
    const staleTs = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    writeFileSync(lockPath, JSON.stringify({ createdAt: staleTs, featureId: 'F-0099' }), 'utf-8')
    // Cold heartbeat (>3 min old → LOOP_HB_STALE_MS)
    const coldHb = new Date(Date.now() - 4 * 60 * 1000).toISOString()
    writeFileSync(hbPath, JSON.stringify({
      featureId: 'F-0099', pid: 12345, phase: 'building:step-3',
      lastHeartbeat: coldHb,
    } satisfies LoopHeartbeat), 'utf-8')
    // Lock should be reclaimed — loop is hung
    expect(acquireLock(10 * 60 * 1000, lockPath, hbPath)).toBe(true)
  })

  it('written lock includes featureId field (null on first write)', () => {
    acquireLock(60_000, lockPath, hbPath)
    const lock = JSON.parse(readFileSync(lockPath, 'utf-8'))
    expect('featureId' in lock).toBe(true)
    expect(lock.featureId).toBeNull()
  })
})

// ── canTriggerToday / incrementCounter ───────────────────────────────────────

describe('canTriggerToday / incrementCounter', () => {
  let tmpDir: string
  let counterPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'autopilot-counter-'))
    counterPath = path.join(tmpDir, 'AUTOPILOT_COUNTER.json')
  })

  afterEach(() => { rmSync(tmpDir, { recursive: true }) })

  it('returns true when no counter file exists', () => {
    expect(canTriggerToday(5, counterPath)).toBe(true)
  })

  it('returns true when date is different from today (stale counter resets)', () => {
    writeFileSync(counterPath, JSON.stringify({ date: '2000-01-01', count: 10 }), 'utf-8')
    expect(canTriggerToday(5, counterPath)).toBe(true)
  })

  it('returns false when count has reached the cap today', () => {
    const today = new Date().toISOString().split('T')[0]
    writeFileSync(counterPath, JSON.stringify({ date: today, count: 5 }), 'utf-8')
    expect(canTriggerToday(5, counterPath)).toBe(false)
  })

  it('returns true when count is below cap', () => {
    const today = new Date().toISOString().split('T')[0]
    writeFileSync(counterPath, JSON.stringify({ date: today, count: 3 }), 'utf-8')
    expect(canTriggerToday(5, counterPath)).toBe(true)
  })

  it('incrementCounter creates file on first call', () => {
    incrementCounter(counterPath)
    const c = JSON.parse(readFileSync(counterPath, 'utf-8'))
    expect(c.count).toBe(1)
    expect(c.date).toBe(new Date().toISOString().split('T')[0])
  })

  it('incrementCounter accumulates for today', () => {
    incrementCounter(counterPath)
    incrementCounter(counterPath)
    incrementCounter(counterPath)
    const c = JSON.parse(readFileSync(counterPath, 'utf-8'))
    expect(c.count).toBe(3)
  })

  it('incrementCounter resets when date changes', () => {
    writeFileSync(counterPath, JSON.stringify({ date: '1999-12-31', count: 99 }), 'utf-8')
    incrementCounter(counterPath)
    const c = JSON.parse(readFileSync(counterPath, 'utf-8'))
    expect(c.count).toBe(1)
    expect(c.date).toBe(new Date().toISOString().split('T')[0])
  })
})

// ── tryAutopilotPick ──────────────────────────────────────────────────────────

describe('tryAutopilotPick', () => {
  let tmpDir: string
  let backlogPath: string
  let counterPath: string
  let lockPath: string
  let hbPath: string
  let mapPath: string
  let statePath: string
  let operatorStatePath: string
  let decisionsPath: string

  const mockIntake = (text: string) => ({
    ideaText: text,
    target: 'sistema' as const,  // overridden in tryAutopilotPick by pick.target
    classification: 'feature' as const,
    relatedAdrs: [],
    relatedFeatures: [],
    relatedBacklogIds: [],
    contextSummary: 'Target: kredy | Clasificación: feature',
    needsArchitect: true,
  })

  const mockArchitect = async (_intake: unknown) => path.join(tmpDir, 'F-0099.md')

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'autopilot-pick-'))
    backlogPath = path.join(tmpDir, 'BACKLOG.md')
    counterPath = path.join(tmpDir, 'COUNTER.json')
    lockPath = path.join(tmpDir, 'LOCK')
    hbPath = path.join(tmpDir, 'NO_HB.json')  // no heartbeat by default
    mapPath = path.join(tmpDir, 'MAP.json')
    statePath = path.join(tmpDir, 'STATE.json')
    operatorStatePath = path.join(tmpDir, 'OPERATOR_STATE.yaml')
    decisionsPath = path.join(tmpDir, 'DECISIONS.md')

    writeFileSync(backlogPath, BACKLOG_FIXTURE, 'utf-8')
    writeFileSync(operatorStatePath, SLEEP_YAML, 'utf-8')
    writeFileSync(decisionsPath, '# ADR\n', 'utf-8')
  })

  afterEach(() => { rmSync(tmpDir, { recursive: true }) })

  const baseOpts = () => ({
    backlogPath,
    counterPath,
    lockPath,
    hbPath,
    mapPath,
    statePath,
    operatorStatePath,
    decisionsPath,
    runIntakeFn: mockIntake,
    runArchitectFn: mockArchitect,
    spawnLoop: (_fid: string) => { /* no-op */ },
  })

  it('returns null when mode is not SLEEP', async () => {
    writeFileSync(operatorStatePath, PRODUCT_YAML, 'utf-8')
    const result = await tryAutopilotPick(baseOpts())
    expect(result).toBeNull()
  })

  it('returns null when STATE.json exists (loop busy)', async () => {
    writeFileSync(statePath, '{}', 'utf-8')
    const result = await tryAutopilotPick(baseOpts())
    expect(result).toBeNull()
  })

  it('returns null when daily cap is reached', async () => {
    const today = new Date().toISOString().split('T')[0]
    writeFileSync(counterPath, JSON.stringify({ date: today, count: 5 }), 'utf-8')
    const result = await tryAutopilotPick(baseOpts())
    expect(result).toBeNull()
  })

  it('returns null when a fresh lock already exists', async () => {
    writeFileSync(lockPath, JSON.stringify({ createdAt: new Date().toISOString() }), 'utf-8')
    const result = await tryAutopilotPick(baseOpts())
    expect(result).toBeNull()
  })

  // Bug A: first pick must come from Kredy/Spensiv/Argos — never from Sistema
  it('first pick is from Pipeline-1 sections (Kredy/Spensiv/Argos), never from Sistema', async () => {
    const result = await tryAutopilotPick(baseOpts())
    expect(result).not.toBeNull()
    // KR-001 is the first P2 pending item in a Pipeline-1 section
    expect(result?.backlogId).toBe('KR-001')
    // Sistema rows must be untouched
    const content = readFileSync(backlogPath, 'utf-8')
    expect(content).toContain('| S-003 | 2 | **Item P2 Sistema**')
    const s003line = content.split('\n').find(l => l.includes('S-003'))
    expect(s003line).toContain('pending')
  })

  it('successful pick: marks first eligible item as "armado" in backlog', async () => {
    await tryAutopilotPick(baseOpts())
    const content = readFileSync(backlogPath, 'utf-8')
    expect(content).toMatch(/armado \(autopilot\)/)
    // The marked item is KR-001, not any Sistema item
    const kr001line = content.split('\n').find(l => l.includes('KR-001'))
    expect(kr001line).toMatch(/armado \(autopilot\)/)
  })

  it('successful pick: returns featureId and backlogId', async () => {
    const result = await tryAutopilotPick(baseOpts())
    expect(result).not.toBeNull()
    expect(result?.featureId).toBe('F-0099')
    expect(result?.backlogId).toBe('KR-001')
  })

  it('successful pick: records featureId→backlogId in the map', async () => {
    const result = await tryAutopilotPick(baseOpts())
    expect(result).not.toBeNull()
    const backlogId = resolveBacklogId(result!.featureId, mapPath)
    expect(backlogId).toBe(result!.backlogId)
  })

  it('successful pick: increments the daily counter', async () => {
    await tryAutopilotPick(baseOpts())
    expect(canTriggerToday(5, counterPath)).toBe(true) // 1/5 used
    for (let i = 0; i < 4; i++) incrementCounter(counterPath)
    expect(canTriggerToday(5, counterPath)).toBe(false) // 5/5 used
  })

  it('successful pick: releases the lock after spawning', async () => {
    await tryAutopilotPick(baseOpts())
    expect(existsSync(lockPath)).toBe(false)
  })

  it('successful pick: calls spawnLoop with the featureId', async () => {
    let spawned: string | null = null
    await tryAutopilotPick({ ...baseOpts(), spawnLoop: (fid) => { spawned = fid } })
    expect(spawned).toBe('F-0099')
  })

  it('writes the autopilot ADR if not already in DECISIONS.md', async () => {
    await tryAutopilotPick(baseOpts())
    const content = readFileSync(decisionsPath, 'utf-8')
    expect(content.toLowerCase()).toContain('loops nocturnos')
  })

  it('does not write the ADR twice if already present', async () => {
    writeFileSync(decisionsPath, '# ADR\n## ADR-0001 · loops nocturnos\ndone\n', 'utf-8')
    await tryAutopilotPick(baseOpts())
    const content = readFileSync(decisionsPath, 'utf-8')
    const count = (content.toLowerCase().match(/loops nocturnos/g) ?? []).length
    expect(count).toBe(1)
  })

  // Bug B fix — test (a): fallo post-marca verifica los tres invariantes
  it('fallo post-marca: row queda "failed", counter sube, lock liberado', async () => {
    const opts = {
      ...baseOpts(),
      runArchitectFn: async () => { throw new Error('Opus timeout') },
    }
    const result = await tryAutopilotPick(opts)

    // tryAutopilotPick devuelve null
    expect(result).toBeNull()

    // La fila fue marcada 'failed (autopilot) ...' — no 'armado', no 'pending'
    const content = readFileSync(backlogPath, 'utf-8')
    const kr001line = content.split('\n').find(l => l.includes('KR-001'))
    expect(kr001line).toMatch(/failed \(autopilot\)/)
    expect(kr001line).not.toMatch(/armado/)
    expect(kr001line).not.toContain('pending')

    // El contador subió (1 intento consumido del cap)
    const c = JSON.parse(readFileSync(counterPath, 'utf-8'))
    expect(c.count).toBe(1)

    // El lock fue liberado
    expect(existsSync(lockPath)).toBe(false)
  })

  // Bug B fix — test (b): dos fallos consecutivos consumen 2 del cap (no runaway)
  it('dos fallos consecutivos de Architect consumen 2 del cap diario', async () => {
    const failingArch = async () => { throw new Error('timeout') }
    // Primera llamada: falla en KR-001 → queda 'failed', counter=1
    await tryAutopilotPick({ ...baseOpts(), runArchitectFn: failingArch })
    // Segunda llamada: KR-001 ya no es 'pending'; KR-002 tiene risk keyword (safety net) → SP-001 elegido, falla → counter=2
    await tryAutopilotPick({ ...baseOpts(), runArchitectFn: failingArch })

    const c = JSON.parse(readFileSync(counterPath, 'utf-8'))
    expect(c.count).toBe(2)

    // Con cap=2 ya no puede triggerear
    expect(canTriggerToday(2, counterPath)).toBe(false)
    // Con cap=5 (default) todavía puede (3 restantes)
    expect(canTriggerToday(5, counterPath)).toBe(true)
  })

  it('fallo en Architect no deja entrada muerta en el map', async () => {
    const opts = {
      ...baseOpts(),
      runArchitectFn: async () => { throw new Error('timeout') },
    }
    await tryAutopilotPick(opts)
    // No debe haber ninguna entrada en el map (no llegó a hacer recordPick)
    const mapContent = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, 'utf-8')) : {}
    expect(Object.keys(mapContent)).toHaveLength(0)
  })

  it('releases lock even if architect throws', async () => {
    const opts = {
      ...baseOpts(),
      runArchitectFn: async () => { throw new Error('Opus timeout') },
    }
    const result = await tryAutopilotPick(opts)
    expect(result).toBeNull()
    expect(existsSync(lockPath)).toBe(false)
  })

  it('stale lock (>10 min old) gets overwritten and pick succeeds', async () => {
    const staleTs = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    writeFileSync(lockPath, JSON.stringify({ createdAt: staleTs, featureId: null }), 'utf-8')
    const result = await tryAutopilotPick(baseOpts())
    expect(result).not.toBeNull()
  })

  it('returns null and does not throw when backlog is empty of eligible items', async () => {
    // Only a P1 Sistema item — excluded by both section filter and priority filter
    writeFileSync(backlogPath, '## Sistema\n| ID | P | Descripción | Estado |\n|----|---|-------------|--------|\n| S-001 | 1 | foo | pending |\n', 'utf-8')
    const result = await tryAutopilotPick(baseOpts())
    expect(result).toBeNull()
    expect(existsSync(lockPath)).toBe(false)
  })

  // ── Liveness-aware lock (Tarea 2, S-027) ────────────────────────────────────
  it('respects stale lock when loop heartbeat is fresh — no double spawn', async () => {
    const staleTs = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    writeFileSync(lockPath, JSON.stringify({ createdAt: staleTs, featureId: 'F-0099' }), 'utf-8')
    // Fresh heartbeat: the loop is alive
    writeFileSync(hbPath, JSON.stringify({
      featureId: 'F-0099', pid: 12345, phase: 'building:step-2',
      lastHeartbeat: new Date().toISOString(),
    } satisfies LoopHeartbeat), 'utf-8')
    const result = await tryAutopilotPick(baseOpts())
    // Must not spawn — would double-spawn over a live process
    expect(result).toBeNull()
  })

  it('reclaims stale lock when loop heartbeat is cold — spawns correctly', async () => {
    const staleTs = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    writeFileSync(lockPath, JSON.stringify({ createdAt: staleTs, featureId: 'F-DEAD' }), 'utf-8')
    // Cold heartbeat: the loop is hung/dead
    const coldHb = new Date(Date.now() - 4 * 60 * 1000).toISOString()
    writeFileSync(hbPath, JSON.stringify({
      featureId: 'F-DEAD', pid: 99999, phase: 'building:step-5',
      lastHeartbeat: coldHb,
    } satisfies LoopHeartbeat), 'utf-8')
    const result = await tryAutopilotPick(baseOpts())
    // Lock reclaimed, new pick should succeed
    expect(result).not.toBeNull()
  })

  // ── markBacklogState returns bool (Tarea 3, S-027) ───────────────────────────
  it('markBacklogState returns true when ID is found and false when missing', () => {
    expect(markBacklogState('KR-001', 'done 2026-06-27', backlogPath)).toBe(true)
    expect(markBacklogState('NONEXISTENT-999', 'done', backlogPath)).toBe(false)
  })

  it('successful pick: marked=true reflected in the map (pick proceeded)', async () => {
    const result = await tryAutopilotPick(baseOpts())
    expect(result).not.toBeNull()
    // The KR-001 row should be marked as armado (markBacklogState returned true)
    const content = readFileSync(backlogPath, 'utf-8')
    const kr001line = content.split('\n').find(l => l.includes('KR-001'))
    expect(kr001line).toMatch(/armado \(autopilot\)/)
  })
})
