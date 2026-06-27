import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'fs'
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

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BACKLOG_FIXTURE = `# Backlog — test

## Sistema

| ID | P | Descripción | Estado |
|----|---|-------------|--------|
| S-001 | 1 | **Item de alta prioridad** — prioridad 1, excluido | pending |
| S-002 | ✅ | **Item completado** | done 2026-06-01 |
| S-003 | 2 | **Item P2 elegible** — feature limpia | pending |
| S-004 | 3 | **Item con mutuo** — toca mutuo y dinero | pending |
| S-005 | 2 | **Otro item P2** — segunda opción | pending |
| S-006 | 4 | **Item P4 limpio** | pending |
| S-007 | 2 | **Item waiting** — en espera | waiting |
| S-008 | 2 | **Item blocked** — bloqueado | blocked |
| S-009 | 2 | **Item done** — ya terminado | done 2026-06-20 |
| S-010 | 2 | **Item armado** — en proceso | armado (autopilot) 2026-06-26T00:00:00.000Z |

## Kredy

| ID | P | Descripción | Estado |
|----|---|-------------|--------|
| KR-001 | 2 | **Feature Kredy limpia** | pending |
| KR-002 | 2 | **Feature con producción** — deploy a prod | pending |

## Spensiv

| ID | P | Descripción | Estado |
|----|---|-------------|--------|
| SP-001 | 3 | **Seed data Spensiv** | pending |
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

  it('excludes items with risk keywords in the line', () => {
    const rows = parseEligibleBacklog(backlogPath)
    expect(rows.map(r => r.id)).not.toContain('S-004')  // contains 'mutuo'
    expect(rows.map(r => r.id)).not.toContain('KR-002') // contains 'producción'/'deploy a prod'
  })

  it('includes P2+ pending items without risk keywords', () => {
    const rows = parseEligibleBacklog(backlogPath)
    const ids = rows.map(r => r.id)
    expect(ids).toContain('S-003')
    expect(ids).toContain('S-005')
    expect(ids).toContain('KR-001')
    expect(ids).toContain('SP-001')
  })

  it('sorts by priority ascending', () => {
    const rows = parseEligibleBacklog(backlogPath)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].priority).toBeGreaterThanOrEqual(rows[i - 1].priority)
    }
    // P2 items come before P3 and P4
    const p2 = rows.filter(r => r.priority === 2)
    const p3 = rows.filter(r => r.priority === 3)
    const p4 = rows.filter(r => r.priority === 4)
    expect(rows.indexOf(p2[0])).toBeLessThan(rows.indexOf(p3[0]))
    expect(rows.indexOf(p3[0])).toBeLessThan(rows.indexOf(p4[0]))
  })

  it('assigns correct target from section', () => {
    const rows = parseEligibleBacklog(backlogPath)
    const s003 = rows.find(r => r.id === 'S-003')
    const kr001 = rows.find(r => r.id === 'KR-001')
    const sp001 = rows.find(r => r.id === 'SP-001')
    expect(s003?.target).toBe('sistema')
    expect(kr001?.target).toBe('kredy')
    expect(sp001?.target).toBe('spensiv')
  })

  it('RISK_KEYWORDS export is non-empty and case-insensitive checks work', () => {
    expect(RISK_KEYWORDS.length).toBeGreaterThan(0)
    // 'Dinero' (capitalized) should also be caught if the backlog line has it
    const custom = `## Sistema\n| ID | P | Descripción | Estado |\n|----|---|-------------|--------|\n| X-001 | 2 | Manejar Dinero real | pending |\n`
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
    markBacklogState('S-003', 'armado (autopilot) 2026-06-26T00:00:00.000Z', backlogPath)
    const content = require('fs').readFileSync(backlogPath, 'utf-8')
    expect(content).toContain('armado (autopilot) 2026-06-26T00:00:00.000Z')
  })

  it('does not change other rows', () => {
    markBacklogState('S-003', 'done 2026-06-26 (autopilot)', backlogPath)
    const { readFileSync: rfs } = require('fs')
    const lines = rfs(backlogPath, 'utf-8').split('\n')
    const s005line = lines.find((l: string) => l.includes('S-005'))
    expect(s005line).toContain('pending')
  })

  it('no-op when ID does not exist', () => {
    const before = require('fs').readFileSync(backlogPath, 'utf-8')
    markBacklogState('NONEXISTENT-999', 'done', backlogPath)
    const after = require('fs').readFileSync(backlogPath, 'utf-8')
    expect(after).toBe(before)
  })

  it('is idempotent when called twice with same state', () => {
    markBacklogState('S-003', 'done 2026-06-26 (autopilot)', backlogPath)
    markBacklogState('S-003', 'done 2026-06-26 (autopilot)', backlogPath)
    const content = require('fs').readFileSync(backlogPath, 'utf-8')
    const count = (content.match(/done 2026-06-26 \(autopilot\)/g) ?? []).length
    expect(count).toBe(1)
  })

  it('does not break non-table lines', () => {
    markBacklogState('S-003', 'done', backlogPath)
    const content = require('fs').readFileSync(backlogPath, 'utf-8')
    expect(content).toContain('# Backlog — test')
    expect(content).toContain('## Sistema')
  })
})

// ── acquireLock / releaseLock ─────────────────────────────────────────────────

describe('acquireLock / releaseLock', () => {
  let tmpDir: string
  let lockPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'autopilot-lock-'))
    lockPath = path.join(tmpDir, 'AUTOPILOT.lock')
  })

  afterEach(() => { rmSync(tmpDir, { recursive: true }) })

  it('creates the lock file and returns true when no lock exists', () => {
    expect(existsSync(lockPath)).toBe(false)
    expect(acquireLock(60_000, lockPath)).toBe(true)
    expect(existsSync(lockPath)).toBe(true)
  })

  it('returns false when a fresh lock already exists', () => {
    acquireLock(60_000, lockPath)
    expect(acquireLock(60_000, lockPath)).toBe(false)
  })

  it('overwrites a stale lock (older than staleMs) and returns true', () => {
    const staleTs = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    writeFileSync(lockPath, JSON.stringify({ createdAt: staleTs }), 'utf-8')
    expect(acquireLock(10 * 60 * 1000, lockPath)).toBe(true)
  })

  it('releaseLock removes the file', () => {
    acquireLock(60_000, lockPath)
    releaseLock(lockPath)
    expect(existsSync(lockPath)).toBe(false)
  })

  it('releaseLock is a no-op when no lock file exists', () => {
    expect(() => releaseLock(lockPath)).not.toThrow()
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
    const c = JSON.parse(require('fs').readFileSync(counterPath, 'utf-8'))
    expect(c.count).toBe(1)
    expect(c.date).toBe(new Date().toISOString().split('T')[0])
  })

  it('incrementCounter accumulates for today', () => {
    incrementCounter(counterPath)
    incrementCounter(counterPath)
    incrementCounter(counterPath)
    const c = JSON.parse(require('fs').readFileSync(counterPath, 'utf-8'))
    expect(c.count).toBe(3)
  })

  it('incrementCounter resets when date changes', () => {
    writeFileSync(counterPath, JSON.stringify({ date: '1999-12-31', count: 99 }), 'utf-8')
    incrementCounter(counterPath)
    const c = JSON.parse(require('fs').readFileSync(counterPath, 'utf-8'))
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
  let mapPath: string
  let statePath: string
  let operatorStatePath: string
  let decisionsPath: string

  const mockIntake = (text: string) => ({
    ideaText: text,
    target: 'sistema' as const,
    classification: 'feature' as const,
    relatedAdrs: [],
    relatedFeatures: [],
    relatedBacklogIds: [],
    contextSummary: 'Target: sistema | Clasificación: feature',
    needsArchitect: true,
  })

  const mockArchitect = async (_intake: unknown) => path.join(tmpDir, 'F-0099.md')

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'autopilot-pick-'))
    backlogPath = path.join(tmpDir, 'BACKLOG.md')
    counterPath = path.join(tmpDir, 'COUNTER.json')
    lockPath = path.join(tmpDir, 'LOCK')
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

  it('successful pick: marks first eligible item as "armado" in backlog', async () => {
    await tryAutopilotPick(baseOpts())
    const content = require('fs').readFileSync(backlogPath, 'utf-8')
    // S-003 is the first P2 pending item (note: S-004 is P2 but has 'mutuo'; S-005 is P2 clean)
    // Actually from the fixture, S-003 is P2 clean so it should be first
    expect(content).toMatch(/armado \(autopilot\)/)
  })

  it('successful pick: returns featureId and backlogId', async () => {
    const result = await tryAutopilotPick(baseOpts())
    expect(result).not.toBeNull()
    expect(result?.featureId).toBe('F-0099')
    expect(result?.backlogId).toBeTruthy()
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
    const content = require('fs').readFileSync(decisionsPath, 'utf-8')
    expect(content.toLowerCase()).toContain('loops nocturnos')
  })

  it('does not write the ADR twice if already present', async () => {
    writeFileSync(decisionsPath, '# ADR\n## ADR-0001 · loops nocturnos\ndone\n', 'utf-8')
    await tryAutopilotPick(baseOpts())
    const content = require('fs').readFileSync(decisionsPath, 'utf-8')
    const count = (content.toLowerCase().match(/loops nocturnos/g) ?? []).length
    expect(count).toBe(1)
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
    writeFileSync(lockPath, JSON.stringify({ createdAt: staleTs }), 'utf-8')
    const result = await tryAutopilotPick(baseOpts())
    expect(result).not.toBeNull()
  })

  it('returns null and does not throw when backlog is empty of eligible items', async () => {
    writeFileSync(backlogPath, '## Sistema\n| ID | P | Descripción | Estado |\n|----|---|-------------|--------|\n| S-001 | 1 | foo | pending |\n', 'utf-8')
    const result = await tryAutopilotPick(baseOpts())
    expect(result).toBeNull()
    expect(existsSync(lockPath)).toBe(false)
  })
})
