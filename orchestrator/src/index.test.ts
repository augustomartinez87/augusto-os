import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { appendProgress } from './progress.js'
import { acquireRunLock, commitStepWithAdrs } from './index.js'
import { releaseLock } from './autopilot.js'
import type { LoopHeartbeat } from './loop-heartbeat.js'
import { markStepStatus, type OrchestratorState, type Step } from './state.js'
import type { AdrDraft } from './adr.js'

// ── appendProgress (S-019c dedup) ─────────────────────────────────────────────

describe('appendProgress', () => {
  let tmpDir: string
  let progressPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'progress-test-'))
    progressPath = path.join(tmpDir, 'PROGRESS.md')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true })
  })

  it('creates the file and writes the entry on first call', () => {
    appendProgress(progressPath, 'F-0001', 'some summary')
    expect(existsSync(progressPath)).toBe(true)
    const content = readFileSync(progressPath, 'utf-8')
    expect(content).toContain('F-0001 completado')
    expect(content).toContain('some summary')
  })

  it('does not duplicate the entry when called a second time with the same featureId', () => {
    appendProgress(progressPath, 'F-0001', 'first summary')
    appendProgress(progressPath, 'F-0001', 'second summary — should not appear')
    const content = readFileSync(progressPath, 'utf-8')
    const count = (content.match(/F-0001 completado/g) ?? []).length
    expect(count).toBe(1)
    expect(content).not.toContain('should not appear')
  })

  it('allows distinct entries for different featureIds', () => {
    appendProgress(progressPath, 'F-0001', 'first')
    appendProgress(progressPath, 'F-0002', 'second')
    const content = readFileSync(progressPath, 'utf-8')
    expect(content).toContain('F-0001 completado')
    expect(content).toContain('F-0002 completado')
  })

  it('does not duplicate when PROGRESS.md already contains the featureId from a prior run', () => {
    writeFileSync(progressPath, '\n## 2026-06-01 — F-0003 completado\n\nold summary\n', 'utf-8')
    appendProgress(progressPath, 'F-0003', 'resumed session summary')
    const content = readFileSync(progressPath, 'utf-8')
    const count = (content.match(/F-0003 completado/g) ?? []).length
    expect(count).toBe(1)
  })
})

// ── acquireRunLock (S-041 — lock cross-run) ───────────────────────────────────
// acquireLock() en sí ya está probado a fondo en autopilot.test.ts (liveness por
// heartbeat, staleness por tiempo, lock malformado, etc). Acá solo se verifica
// que acquireRunLock() invoca ese flujo correctamente para un run manual de
// main() — no se duplican esos casos.

describe('acquireRunLock', () => {
  let tmpDir: string
  let lockPath: string
  let hbPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'run-lock-test-'))
    lockPath = path.join(tmpDir, 'AUTOPILOT.lock')
    hbPath = path.join(tmpDir, 'LOOP_HEARTBEAT.json') // no existe por defecto
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true })
  })

  it('lock libre → adquiere y devuelve true', () => {
    expect(existsSync(lockPath)).toBe(false)
    expect(acquireRunLock(lockPath, hbPath)).toBe(true)
    expect(existsSync(lockPath)).toBe(true)
  })

  it('lock tomado con heartbeat fresco → no procede, devuelve false sin pisar el lock', () => {
    writeFileSync(lockPath, JSON.stringify({ createdAt: new Date().toISOString(), featureId: 'F-0099' }), 'utf-8')
    writeFileSync(hbPath, JSON.stringify({
      featureId: 'F-0099', pid: 4242, phase: 'building:step-2',
      lastHeartbeat: new Date().toISOString(),
    } satisfies LoopHeartbeat), 'utf-8')

    expect(acquireRunLock(lockPath, hbPath)).toBe(false)
    // El lock del "proceso vivo" sigue intacto — no lo reclamó.
    const lock = JSON.parse(readFileSync(lockPath, 'utf-8'))
    expect(lock.featureId).toBe('F-0099')
  })

  it('lock tomado pero heartbeat stale → lo reclama y procede', () => {
    const staleTs = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    writeFileSync(lockPath, JSON.stringify({ createdAt: staleTs, featureId: 'F-0050' }), 'utf-8')
    const coldHb = new Date(Date.now() - 5 * 60 * 1000).toISOString() // > LOOP_HB_STALE_MS (3 min)
    writeFileSync(hbPath, JSON.stringify({
      featureId: 'F-0050', pid: 1111, phase: 'verifying:step-1',
      lastHeartbeat: coldHb,
    } satisfies LoopHeartbeat), 'utf-8')

    expect(acquireRunLock(lockPath, hbPath)).toBe(true)
    const lock = JSON.parse(readFileSync(lockPath, 'utf-8'))
    // Lock reclamado y reseteado (featureId null hasta que el nuevo run lo actualice).
    expect(lock.featureId).toBeNull()
  })

  it('tras un segundo intento fallido, releaseLock libera el lock del primero (simula fin de run)', () => {
    expect(acquireRunLock(lockPath, hbPath)).toBe(true)
    // Sin heartbeat escrito (simula ventana antes de writeLoopHeartbeat) — un segundo
    // proceso, dentro del período de gracia, no debe poder pisarlo.
    expect(acquireRunLock(lockPath, hbPath)).toBe(false)
    releaseLock(lockPath)
    expect(existsSync(lockPath)).toBe(false)
    // Liberado — un tercer intento ahora sí adquiere.
    expect(acquireRunLock(lockPath, hbPath)).toBe(true)
  })
})

// ── commitStepWithAdrs (F-0066 step 3) ───────────────────────────────────────

const DECISIONS_FIXTURE = `# Decisiones de Diseño (ADR)

---

## ADR-0001 · 2026-01-01 · decisión anterior

**Estado:** aceptada
**Origen:** Instrucción de Augusto
**Target:** sistema

**Decisión:** alguna decisión anterior.
**Contexto:** contexto previo.
**Alternativas descartadas:** ninguna
**Consecuencias / riesgo residual:** ninguna

> Generado por el loop · feature F-0001 · step 1

---

`

function makeState(stepOverrides: Partial<Step> = {}): OrchestratorState {
  const now = new Date().toISOString()
  const step: Step = {
    id: 1,
    desc: 'test step',
    status: 'running',
    commit: null,
    sessionId: null,
    retries: 0,
    ui: false,
    adrIds: [],
    humanApproved: false,
    failureHistory: [],
    ...stepOverrides,
  }
  return {
    featureId: 'F-9999',
    branch: 'feat/F-9999',
    steps: [step],
    pausedUntil: null,
    needsHumanApproval: null,
    createdAt: now,
    updatedAt: now,
    merged: false,
    pushed: false,
  }
}

const ADR_DRAFT: AdrDraft = {
  target: 'sistema',
  origen: 'Supuesto del agente',
  titulo: 'decisión de prueba',
  decision: 'usar inyección para testear.',
  contexto: 'tests necesitan aislamiento.',
  alternativas: 'ninguna',
  consecuencias: 'ninguna',
}

describe('commitStepWithAdrs', () => {
  let tmpDir: string
  let decisionsPath: string
  let statePath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'commit-step-adrs-test-'))
    decisionsPath = path.join(tmpDir, 'DECISIONS.md')
    statePath = path.join(tmpDir, 'STATE.json')
    writeFileSync(decisionsPath, DECISIONS_FIXTURE, 'utf-8')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true })
  })

  it('sin bloques ADR: devuelve el sha sin tocar DECISIONS.md ni STATE.json', async () => {
    const state = makeState()
    const stub = async (_: number, __: string) => 'deadbeef01'
    const { sha, adrIds } = await commitStepWithAdrs(
      state.steps[0], [], state,
      { decisionsPath, statePath, _commitStep: stub },
    )
    expect(sha).toBe('deadbeef01')
    expect(adrIds).toEqual([])
    expect(existsSync(statePath)).toBe(false)
    expect(readFileSync(decisionsPath, 'utf-8')).toBe(DECISIONS_FIXTURE)
  })

  it('con bloques ADR: escribe DECISIONS.md antes de llamar a _commitStep', async () => {
    const state = makeState()
    let decisionsContentAtCommit = ''
    const stub = async (_: number, __: string) => {
      decisionsContentAtCommit = readFileSync(decisionsPath, 'utf-8')
      return 'sha1sha1sha1'
    }
    await commitStepWithAdrs(
      state.steps[0], [ADR_DRAFT], state,
      { decisionsPath, statePath, _commitStep: stub },
    )
    expect(decisionsContentAtCommit).toContain('ADR-0002')
    expect(decisionsContentAtCommit).toContain('decisión de prueba')
  })

  it('con bloques ADR: persiste adrIds en STATE.json antes de llamar a _commitStep', async () => {
    const state = makeState()
    writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8')
    let stateAtCommit: any = null
    const stub = async (_: number, __: string) => {
      stateAtCommit = JSON.parse(readFileSync(statePath, 'utf-8'))
      return 'sha2sha2sha2'
    }
    const { adrIds } = await commitStepWithAdrs(
      state.steps[0], [ADR_DRAFT], state,
      { decisionsPath, statePath, _commitStep: stub },
    )
    expect(adrIds).toEqual([2])
    expect(stateAtCommit.steps[0].adrIds).toEqual([2])
  })

  it('idempotencia: si step.adrIds ya tiene entradas, no llama appendAdr pero devuelve el conjunto efectivo', async () => {
    const state = makeState({ adrIds: [2] })
    writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8')
    const stub = async (_: number, __: string) => 'sha3sha3sha3'
    const { adrIds } = await commitStepWithAdrs(
      state.steps[0], [ADR_DRAFT], state,
      { decisionsPath, statePath, _commitStep: stub },
    )
    // Devuelve los adrIds YA persistidos ([2]), no [] — así el caller que hace
    // markStepStatus('done', { adrIds }) no pisa el valor persistido con [].
    expect(adrIds).toEqual([2])
    // DECISIONS.md no debe tener ADR-0003 (no se escribió uno nuevo)
    const content = readFileSync(decisionsPath, 'utf-8')
    expect(content).not.toContain('ADR-0003')
    expect(content).not.toContain('ADR-0002')
  })

  it('resume tras fallo de commit: el ADR persistido no queda huérfano al marcar el step done', async () => {
    // Simula el flujo del caller (index.ts runLoop): primera corrida escribe el ADR
    // y persiste step.adrIds=[2], pero el commit falla. En el resume el step recarga
    // con adrIds=[2], el guard salta appendAdr, y el caller marca el step 'done' con
    // los adrIds que devuelve commitStepWithAdrs. Debe seguir referenciando [2].
    const state = makeState({ adrIds: [2] })
    writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8')
    const stub = async (_: number, __: string) => 'sha4sha4sha4'
    const { sha, adrIds } = await commitStepWithAdrs(
      state.steps[0], [ADR_DRAFT], state,
      { decisionsPath, statePath, _commitStep: stub },
    )
    // El caller escribe done con estos adrIds (Object.assign vía markStepStatus).
    markStepStatus(state, state.steps[0].id, 'done', { commit: sha, adrIds }, statePath)
    const persisted = JSON.parse(readFileSync(statePath, 'utf-8'))
    expect(persisted.steps[0].adrIds).toEqual([2])
    expect(persisted.steps[0].status).toBe('done')
  })
})
