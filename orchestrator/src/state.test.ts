import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'fs'
import {
  getNextPendingStep, getBlockedStep, markStepStatus, archiveState,
  STATE_PATH, type OrchestratorState, type Step,
} from './state.js'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeStep(id: number, status: Step['status']): Step {
  return { id, desc: `Step ${id}`, status, commit: null, sessionId: null, retries: 0, ui: false, adrIds: [], humanApproved: false }
}

function makeState(steps: Step[]): OrchestratorState {
  const now = new Date().toISOString()
  return {
    featureId: 'F-TEST',
    branch: 'feat/test',
    steps,
    pausedUntil: null,
    needsHumanApproval: null,
    createdAt: now,
    updatedAt: now,
    merged: false,
    pushed: false,
  }
}

// Save/restore STATE.json around tests that call markStepStatus (which writes to disk).
let savedState: string | null = null

beforeEach(() => {
  savedState = existsSync(STATE_PATH) ? readFileSync(STATE_PATH, 'utf-8') : null
})

afterEach(() => {
  if (savedState !== null) {
    writeFileSync(STATE_PATH, savedState, 'utf-8')
  } else if (existsSync(STATE_PATH)) {
    unlinkSync(STATE_PATH)
  }
})

// ── getNextPendingStep ────────────────────────────────────────────────────────

describe('getNextPendingStep', () => {
  it('returns null when all steps are done', () => {
    const state = makeState([makeStep(1, 'done'), makeStep(2, 'done')])
    expect(getNextPendingStep(state)).toBeNull()
  })

  it('returns the first pending step', () => {
    const state = makeState([makeStep(1, 'done'), makeStep(2, 'pending'), makeStep(3, 'pending')])
    expect(getNextPendingStep(state)?.id).toBe(2)
  })

  it('returns null when the first non-done step is blocked (S-019a fix)', () => {
    const state = makeState([makeStep(1, 'done'), makeStep(2, 'blocked'), makeStep(3, 'pending')])
    expect(getNextPendingStep(state)).toBeNull()
  })

  it('returns null when the only step is blocked', () => {
    const state = makeState([makeStep(1, 'blocked')])
    expect(getNextPendingStep(state)).toBeNull()
  })

  it('returns a running step (resume case)', () => {
    const state = makeState([makeStep(1, 'done'), makeStep(2, 'running')])
    expect(getNextPendingStep(state)?.id).toBe(2)
  })
})

// ── getBlockedStep ────────────────────────────────────────────────────────────

describe('getBlockedStep', () => {
  it('returns null when no step is blocked', () => {
    const state = makeState([makeStep(1, 'done'), makeStep(2, 'pending')])
    expect(getBlockedStep(state)).toBeNull()
  })

  it('returns the blocked step', () => {
    const state = makeState([makeStep(1, 'done'), makeStep(2, 'blocked'), makeStep(3, 'pending')])
    const s = getBlockedStep(state)
    expect(s?.id).toBe(2)
    expect(s?.status).toBe('blocked')
  })

  it('returns the first blocked step when multiple are blocked', () => {
    const state = makeState([makeStep(1, 'blocked'), makeStep(2, 'blocked')])
    expect(getBlockedStep(state)?.id).toBe(1)
  })
})

// ── markStepStatus ────────────────────────────────────────────────────────────

describe('markStepStatus', () => {
  it('updates the step status in memory', () => {
    const state = makeState([makeStep(1, 'pending')])
    markStepStatus(state, 1, 'done')
    expect(state.steps[0].status).toBe('done')
  })

  it('merges extra fields into the step', () => {
    const state = makeState([makeStep(1, 'running')])
    markStepStatus(state, 1, 'done', { commit: 'abc123' })
    expect(state.steps[0].commit).toBe('abc123')
    expect(state.steps[0].status).toBe('done')
  })

  it('throws for an unknown step id', () => {
    const state = makeState([makeStep(1, 'pending')])
    expect(() => markStepStatus(state, 99, 'done')).toThrow('Step 99 not found')
  })
})

// ── archiveState ──────────────────────────────────────────────────────────────

describe('archiveState', () => {
  it('is a no-op when STATE.json does not exist', () => {
    // savedState guard already covers cleanup; just verify no throw when file absent
    if (existsSync(STATE_PATH)) unlinkSync(STATE_PATH)
    expect(() => archiveState('F-GHOST')).not.toThrow()
  })
})
