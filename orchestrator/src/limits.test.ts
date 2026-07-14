import { describe, it, expect, vi } from 'vitest'
import { isUsageLimitError, isContextWindowError, parseResetTime, probeAvailability, isProbeAvailable, PROBE_INTERVAL_MS, handleUsageLimit } from './limits.js'
import type { OrchestratorState } from './state.js'

vi.mock('./state.js', () => ({ saveState: vi.fn() }))

// ── isUsageLimitError ──────────────────────────────────────────────────────────

describe('isUsageLimitError', () => {
  it('detects explicit rate limit phrases', () => {
    expect(isUsageLimitError('Error: rate limit exceeded')).toBe(true)
    expect(isUsageLimitError('You have hit your usage limit')).toBe(true)
    expect(isUsageLimitError('too many requests, slow down')).toBe(true)
    expect(isUsageLimitError('USAGE_LIMIT_REACHED')).toBe(true)
  })

  it('detects a standalone HTTP 429 status', () => {
    expect(isUsageLimitError('HTTP 429 Too Many Requests')).toBe(true)
    expect(isUsageLimitError('"status": 429,')).toBe(true)
  })

  it('does NOT false-positive on "429" embedded inside an unrelated number', () => {
    // Regression: a successful step's JSON output can legitimately contain
    // "cache_read_input_tokens":42906 — this must never be read as an HTTP 429.
    const successfulOutput = '{"type":"result","is_error":false,"usage":{"cache_read_input_tokens":42906}}'
    expect(isUsageLimitError(successfulOutput)).toBe(false)
  })

  it('does not flag normal successful output', () => {
    const output = '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":0.24}'
    expect(isUsageLimitError(output)).toBe(false)
  })
})

// ── isContextWindowError ───────────────────────────────────────────────────────

describe('isContextWindowError', () => {
  it('detects context window phrases', () => {
    expect(isContextWindowError('context window exceeded')).toBe(true)
    expect(isContextWindowError('context_length_exceeded')).toBe(true)
    expect(isContextWindowError('maximum context reached')).toBe(true)
  })

  it('does not flag unrelated output', () => {
    expect(isContextWindowError('{"result":"ok"}')).toBe(false)
  })
})

// ── PROBE_INTERVAL_MS ──────────────────────────────────────────────────────────

describe('PROBE_INTERVAL_MS', () => {
  it('is 15 minutes in milliseconds', () => {
    expect(PROBE_INTERVAL_MS).toBe(15 * 60 * 1000)
  })
})

// ── probeAvailability ──────────────────────────────────────────────────────────

describe('probeAvailability', () => {
  it('returns true when injectable probeFn resolves true', async () => {
    const result = await probeAvailability({ probeFn: async () => true })
    expect(result).toBe(true)
  })

  it('returns false when injectable probeFn resolves false', async () => {
    const result = await probeAvailability({ probeFn: async () => false })
    expect(result).toBe(false)
  })
})

// ── isProbeAvailable (lógica de decisión del probe real) ─────────────────────────
// Cubre la rama que probeAvailability ejecuta contra el CLI real, que los tests con
// probeFn inyectado nunca tocan. Disponibilidad = "no hay señal de límite", NO exit 0.

describe('isProbeAvailable', () => {
  it('is available on a clean success (exit 0, no limit text)', () => {
    expect(isProbeAvailable('{"type":"result","is_error":false}', 0)).toBe(true)
  })

  it('is available when --max-turns 1 cuts a successful call to exit 1', () => {
    // Falso negativo que hundió los intentos previos: la API respondió (hay tokens)
    // pero el loop se cortó al emitir tool_use en el turno 1. Debe reanudar igual.
    expect(isProbeAvailable('assistant emitted tool_use then ran out of turns', 1)).toBe(true)
  })

  it('is NOT available when exit is 0 but the output reports a usage limit', () => {
    // Falso positivo: reanudar acá volvería a chocar el límite de inmediato.
    expect(isProbeAvailable('You have hit your usage limit', 0)).toBe(false)
  })

  it('is NOT available on a 429 exit code', () => {
    expect(isProbeAvailable('', 429)).toBe(false)
  })

  it('tolerates a null exit code (treated as no 429)', () => {
    expect(isProbeAvailable('ok', null)).toBe(true)
  })
})

// ── handleUsageLimit ────────────────────────────────────────────────────────────

const makeState = (): OrchestratorState => ({
  featureId: 'F-test',
  branch: 'feat/test',
  steps: [],
  pausedUntil: null,
  needsHumanApproval: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  merged: false,
  pushed: false,
})

const noSleep = async (_ms: number) => {}
const noSleepUntil = async (_d: Date) => {}

describe('handleUsageLimit — poll path (sin hora explícita)', () => {
  it('llama probeFn hasta que retorna true, luego limpia pausedUntil', async () => {
    const state = makeState()
    let calls = 0
    const probeFn = async () => { calls++; return calls >= 3 }

    await handleUsageLimit('unrelated error text', state, { probeFn, sleepMs: noSleep })

    expect(calls).toBe(3)
    expect(state.pausedUntil).toBeNull()
  })

  it('reanuda en el primer intento si el probe ya pasa', async () => {
    const state = makeState()
    let calls = 0
    const probeFn = async () => { calls++; return true }

    await handleUsageLimit('generic failure', state, { probeFn, sleepMs: noSleep })

    expect(calls).toBe(1)
    expect(state.pausedUntil).toBeNull()
  })

  it('probe falla N veces y luego pasa — sleepUntilFn nunca se llama, sleepMs usa PROBE_INTERVAL_MS', async () => {
    const state = makeState()
    let probeCount = 0
    const sleepMsCalls: number[] = []
    let sleepUntilCalled = false

    const probeFn = async () => { probeCount++; return probeCount >= 3 }
    const sleepMs = async (ms: number) => { sleepMsCalls.push(ms) }
    const sleepUntilFn = async (_d: Date) => { sleepUntilCalled = true }

    await handleUsageLimit('quota exhausted, please try later', state, { probeFn, sleepMs, sleepUntilFn })

    expect(sleepUntilCalled).toBe(false)                                         // sin bloque fijo
    expect(probeCount).toBe(3)                                                   // 2 fallos + 1 éxito
    expect(sleepMsCalls).toHaveLength(3)                                         // poll sleep antes de cada probe
    expect(sleepMsCalls.every(ms => ms === PROBE_INTERVAL_MS)).toBe(true)
    expect(state.pausedUntil).toBeNull()
  })
})

describe('handleUsageLimit — explicit-time path (retry-after / resets at)', () => {
  it('duerme hasta resetAt, prueba probe de confirmación y limpia pausedUntil', async () => {
    const state = makeState()
    let sleptUntil: Date | null = null
    let probes = 0
    const probeFn = async () => { probes++; return true }
    const sleepUntilFn = async (d: Date) => { sleptUntil = d }

    await handleUsageLimit('retry-after: 3600', state, { probeFn, sleepMs: noSleep, sleepUntilFn })

    expect(sleptUntil).not.toBeNull()
    expect((sleptUntil as unknown as Date).getTime()).toBeGreaterThan(Date.now() + 3_500_000)
    expect(probes).toBe(1)
    expect(state.pausedUntil).toBeNull()
  })

  it('reintenta probe si el límite persiste tras el sleep', async () => {
    const state = makeState()
    let probes = 0
    const probeFn = async () => { probes++; return probes >= 2 }

    await handleUsageLimit('resets at 14:00', state, { probeFn, sleepMs: noSleep, sleepUntilFn: noSleepUntil })

    expect(probes).toBe(2)
    expect(state.pausedUntil).toBeNull()
  })

  it('persiste pausedUntil con la hora real antes de dormir', async () => {
    const state = makeState()
    const capturedPausedUntil: (string | null)[] = []
    const probeFn = async () => true
    const sleepUntilFn = async (_d: Date) => {
      capturedPausedUntil.push(state.pausedUntil)
    }

    await handleUsageLimit('retry-after: 60', state, { probeFn, sleepMs: noSleep, sleepUntilFn })

    // Durante el sleep, pausedUntil debe ser un ISO string (no null)
    expect(capturedPausedUntil[0]).not.toBeNull()
    expect(typeof capturedPausedUntil[0]).toBe('string')
    // Al terminar, siempre null
    expect(state.pausedUntil).toBeNull()
  })
})

// ── parseResetTime ──────────────────────────────────────────────────────────────

describe('parseResetTime', () => {
  it('parses retry-after seconds', () => {
    const before = Date.now()
    const result = parseResetTime('retry-after: 120')
    expect(result.getTime()).toBeGreaterThanOrEqual(before + 119_000)
    expect(result.getTime()).toBeLessThanOrEqual(before + 121_000)
  })

  // Rama defensiva de parseResetTime. handleUsageLimit la llama solo cuando
  // hasExplicitResetTime es true, por lo que este branch es dead code en ese flujo.
  // El path sin hora explícita usa probeAvailability en su lugar (ver poll path tests).
  it('fallback a ~5h adelante (top of hour) cuando no hay info de reset — aplica solo en aislamiento', () => {
    const before = Date.now()
    const result = parseResetTime('some unrelated error text')
    const diffHours = (result.getTime() - before) / (60 * 60 * 1000)
    // setHours(h+5,0,0,0) zeroes minutes/seconds, so the delta ranges from
    // just over 4h (called near :59) to exactly 5h (called at :00).
    expect(diffHours).toBeGreaterThan(4)
    expect(diffHours).toBeLessThanOrEqual(5)
  })
})
