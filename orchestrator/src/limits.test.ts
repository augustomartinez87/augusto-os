import { describe, it, expect } from 'vitest'
import { isUsageLimitError, isContextWindowError, parseResetTime } from './limits.js'

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

// ── parseResetTime ──────────────────────────────────────────────────────────────

describe('parseResetTime', () => {
  it('parses retry-after seconds', () => {
    const before = Date.now()
    const result = parseResetTime('retry-after: 120')
    expect(result.getTime()).toBeGreaterThanOrEqual(before + 119_000)
    expect(result.getTime()).toBeLessThanOrEqual(before + 121_000)
  })

  it('falls back to ~5h ahead (top of hour) when no explicit reset info is present', () => {
    const before = Date.now()
    const result = parseResetTime('some unrelated error text')
    const diffHours = (result.getTime() - before) / (60 * 60 * 1000)
    // Implementation zeroes minutes/seconds (setHours(h+5,0,0,0)), so the delta
    // ranges from just over 4h (called near :59) to exactly 5h (called at :00).
    expect(diffHours).toBeGreaterThan(4)
    expect(diffHours).toBeLessThanOrEqual(5)
  })
})
