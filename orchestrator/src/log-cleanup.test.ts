import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, utimesSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import {
  cleanDiskLogs, cleanSupabaseLogs, shouldRunCleanup,
  DISK_LOG_RETENTION_DAYS, CLEANUP_INTERVAL_MS,
} from './log-cleanup.js'

// ── helpers ────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

function makeFile(dir: string, name: string, daysOld: number): string {
  const p = path.join(dir, name)
  writeFileSync(p, `log content ${name}`, 'utf-8')
  const mtime = new Date(Date.now() - daysOld * DAY_MS)
  utimesSync(p, mtime, mtime)
  return p
}

const OLD = DISK_LOG_RETENTION_DAYS + 5   // definitivamente viejo
const NEW = 1                              // reciente (siempre se preserva)

// ── shouldRunCleanup ───────────────────────────────────────────────────────────

describe('shouldRunCleanup', () => {
  it('returns true on startup (lastCleanupAt=0)', () => {
    expect(shouldRunCleanup(0, Date.now())).toBe(true)
  })

  it('returns false when recently ran', () => {
    const now = Date.now()
    expect(shouldRunCleanup(now - 1000, now)).toBe(false)
  })

  it('returns true when full interval has passed', () => {
    const now = Date.now()
    expect(shouldRunCleanup(now - CLEANUP_INTERVAL_MS - 1, now)).toBe(true)
  })

  it('returns false when just under interval', () => {
    const now = Date.now()
    expect(shouldRunCleanup(now - CLEANUP_INTERVAL_MS + 100, now)).toBe(false)
  })
})

// ── cleanDiskLogs ──────────────────────────────────────────────────────────────

describe('cleanDiskLogs', () => {
  let logsDir: string
  let orchDir: string

  beforeEach(() => {
    logsDir = mkdtempSync(path.join(tmpdir(), 'logs-test-'))
    orchDir = mkdtempSync(path.join(tmpdir(), 'orch-test-'))
  })

  afterEach(() => {
    rmSync(logsDir, { recursive: true })
    rmSync(orchDir, { recursive: true })
  })

  function opts(extra: Partial<Parameters<typeof cleanDiskLogs>[0]> = {}) {
    return { logsDir, orchDir, maxAgeMs: DISK_LOG_RETENTION_DAYS * DAY_MS, now: Date.now(), activeFeatureId: null as string | null, ...extra }
  }

  it('deletes old .log files in logs/ dir', () => {
    makeFile(logsDir, 'F-0001-step1.log', OLD)
    const r = cleanDiskLogs(opts())
    expect(r.deleted).toContain('F-0001-step1.log')
    expect(existsSync(path.join(logsDir, 'F-0001-step1.log'))).toBe(false)
  })

  it('keeps recent .log files in logs/ dir', () => {
    makeFile(logsDir, 'F-0002-step1.log', NEW)
    const r = cleanDiskLogs(opts())
    expect(r.skipped).toContain('F-0002-step1.log')
    expect(existsSync(path.join(logsDir, 'F-0002-step1.log'))).toBe(true)
  })

  it('always preserves orchestrator.log even if old', () => {
    makeFile(orchDir, 'orchestrator.log', OLD)
    const r = cleanDiskLogs(opts())
    expect(r.skipped).toContain('orchestrator.log')
    expect(existsSync(path.join(orchDir, 'orchestrator.log'))).toBe(true)
  })

  it('preserves active feature files even if old (featureId guard)', () => {
    makeFile(logsDir, 'F-0042-step3.log', OLD)
    const r = cleanDiskLogs(opts({ activeFeatureId: 'F-0042' }))
    expect(r.skipped).toContain('F-0042-step3.log')
    expect(existsSync(path.join(logsDir, 'F-0042-step3.log'))).toBe(true)
  })

  it('deletes old loop-F-XXXX.log in orchDir root', () => {
    makeFile(orchDir, 'loop-F-0001.log', OLD)
    const r = cleanDiskLogs(opts())
    expect(r.deleted).toContain('loop-F-0001.log')
    expect(existsSync(path.join(orchDir, 'loop-F-0001.log'))).toBe(false)
  })

  it('preserves loop-F-XXXX.log of active feature', () => {
    makeFile(orchDir, 'loop-F-0042.log', OLD)
    const r = cleanDiskLogs(opts({ activeFeatureId: 'F-0042' }))
    expect(r.skipped).toContain('loop-F-0042.log')
    expect(existsSync(path.join(orchDir, 'loop-F-0042.log'))).toBe(true)
  })

  it('deletes old blocked.log when stale', () => {
    makeFile(orchDir, 'blocked.log', OLD)
    const r = cleanDiskLogs(opts())
    expect(r.deleted).toContain('blocked.log')
  })

  it('is idempotent — second run deletes nothing', () => {
    makeFile(logsDir, 'F-0001-step1.log', OLD)
    const o = opts()
    cleanDiskLogs(o)
    const second = cleanDiskLogs(o)
    expect(second.deleted).toHaveLength(0)
  })

  it('mixes: deletes old, keeps recent, in same run', () => {
    makeFile(logsDir, 'F-0001-step1.log', OLD)
    makeFile(logsDir, 'F-0002-step1.log', NEW)
    const r = cleanDiskLogs(opts())
    expect(r.deleted).toContain('F-0001-step1.log')
    expect(r.skipped).toContain('F-0002-step1.log')
  })

  it('no-op when logs/ dir does not exist', () => {
    const r = cleanDiskLogs({ logsDir: '/nonexistent/path/for/test', orchDir, maxAgeMs: 0, now: Date.now(), activeFeatureId: null })
    expect(r.deleted).toHaveLength(0)
  })
})

// ── cleanSupabaseLogs ──────────────────────────────────────────────────────────

describe('cleanSupabaseLogs', () => {
  it('returns 0 deleted when restFn is null (no Supabase configured)', async () => {
    const r = await cleanSupabaseLogs(null)
    expect(r.deletedRows).toBe(0)
  })

  it('calls DELETE on orch_logs with ts=lt.<cutoff>', async () => {
    const now = Date.now()
    const calls: [string, string, unknown, Record<string, string> | undefined][] = []
    const mockRest = async (method: string, q: string, body?: unknown, extra?: Record<string, string>) => {
      calls.push([method, q, body, extra])
      return []
    }
    await cleanSupabaseLogs(mockRest, { retentionDays: 7, now })
    expect(calls).toHaveLength(1)
    const [method, query] = calls[0]
    expect(method).toBe('DELETE')
    expect(query).toMatch(/^orch_logs\?ts=lt\./)
    // cutoff date string must appear in the query
    const expectedDate = new Date(now - 7 * DAY_MS).toISOString().slice(0, 10)
    expect(query).toContain(expectedDate)
  })

  it('returns count of deleted rows (array length)', async () => {
    const mockRest = async () => [{ id: 1 }, { id: 2 }, { id: 3 }]
    const r = await cleanSupabaseLogs(mockRest as any)
    expect(r.deletedRows).toBe(3)
  })

  it('returns 0 when response is not an array', async () => {
    const mockRest = async () => null
    const r = await cleanSupabaseLogs(mockRest as any)
    expect(r.deletedRows).toBe(0)
  })

  it('returns 0 on network error (graceful degradation)', async () => {
    const mockRest = async () => { throw new Error('network error') }
    const r = await cleanSupabaseLogs(mockRest as any)
    expect(r.deletedRows).toBe(0)
  })

  it('sends Prefer: return=representation to get the deleted count', async () => {
    const extras: (Record<string, string> | undefined)[] = []
    const mockRest = async (_m: string, _q: string, _b: unknown, extra?: Record<string, string>) => {
      extras.push(extra); return []
    }
    await cleanSupabaseLogs(mockRest)
    expect(extras[0]?.Prefer).toContain('return=representation')
  })

  it('uses retentionDays from opts, not the default, when provided', async () => {
    const now = Date.now()
    let capturedQuery = ''
    const mockRest = async (_m: string, q: string) => { capturedQuery = q; return [] }
    await cleanSupabaseLogs(mockRest, { retentionDays: 3, now })
    const expected = new Date(now - 3 * DAY_MS).toISOString().slice(0, 10)
    expect(capturedQuery).toContain(expected)
  })

  // Throttle no está embebido en cleanSupabaseLogs sino en sync.ts vía shouldRunCleanup.
  // Este test verifica que shouldRunCleanup no dispara cleanup en cada tick:
  it('shouldRunCleanup: NOT triggered on consecutive ticks within interval', () => {
    const now = Date.now()
    const lastCleanup = now - 1000  // hace 1 segundo — dentro del intervalo de 1 hora
    expect(shouldRunCleanup(lastCleanup, now)).toBe(false)
  })
})
