import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { appendProgress } from './progress.js'
import { acquireRunLock } from './index.js'
import { releaseLock } from './autopilot.js'
import type { LoopHeartbeat } from './loop-heartbeat.js'

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
