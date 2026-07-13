import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import {
  getNextPendingStep, getBlockedStep, markStepStatus, archiveState, appendFailureHistory,
  type OrchestratorState, type Step,
} from './state.js'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeStep(id: number, status: Step['status']): Step {
  return { id, desc: `Step ${id}`, status, commit: null, sessionId: null, retries: 0, ui: false, adrIds: [], humanApproved: false, failureHistory: [] }
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

// Use a temp directory for STATE.json writes so the running loop's STATE.json is never touched.
let tmpDir: string
let tmpStatePath: string

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'state-test-'))
  tmpStatePath = path.join(tmpDir, 'STATE.json')
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
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
    markStepStatus(state, 1, 'done', undefined, tmpStatePath)
    expect(state.steps[0].status).toBe('done')
  })

  it('merges extra fields into the step', () => {
    const state = makeState([makeStep(1, 'running')])
    markStepStatus(state, 1, 'done', { commit: 'abc123' }, tmpStatePath)
    expect(state.steps[0].commit).toBe('abc123')
    expect(state.steps[0].status).toBe('done')
  })

  it('throws for an unknown step id', () => {
    const state = makeState([makeStep(1, 'pending')])
    expect(() => markStepStatus(state, 99, 'done', undefined, tmpStatePath)).toThrow('Step 99 not found')
  })
})

// ── appendFailureHistory (S-039) ───────────────────────────────────────────────

describe('appendFailureHistory', () => {
  it('appends a single entry to an empty history', () => {
    const state = makeState([makeStep(1, 'running')])
    appendFailureHistory(state, 1, 'builder: TypeError', tmpStatePath)
    expect(state.steps[0].failureHistory).toEqual(['builder: TypeError'])
  })

  it('accumulates entries across multiple failure types instead of overwriting', () => {
    const state = makeState([makeStep(1, 'running')])
    appendFailureHistory(state, 1, 'builder: fallo en intento 1', tmpStatePath)
    appendFailureHistory(state, 1, 'verifier: tsc falla', tmpStatePath)
    appendFailureHistory(state, 1, 'QA: screenshot no matchea', tmpStatePath)
    appendFailureHistory(state, 1, 'reviewer: CHANGES_REQUESTED', tmpStatePath)
    expect(state.steps[0].failureHistory).toEqual([
      'builder: fallo en intento 1',
      'verifier: tsc falla',
      'QA: screenshot no matchea',
      'reviewer: CHANGES_REQUESTED',
    ])
  })

  it('caps the history to the last N entries', () => {
    const state = makeState([makeStep(1, 'running')])
    for (let i = 1; i <= 10; i++) {
      appendFailureHistory(state, 1, `fallo ${i}`, tmpStatePath)
    }
    const history = state.steps[0].failureHistory!
    expect(history.length).toBeLessThan(10)
    expect(history[history.length - 1]).toBe('fallo 10')
    expect(history).not.toContain('fallo 1')
  })

  it('truncates a single very long entry instead of blowing up the fixer context', () => {
    const state = makeState([makeStep(1, 'running')])
    const huge = 'x'.repeat(5000)
    appendFailureHistory(state, 1, huge, tmpStatePath)
    expect(state.steps[0].failureHistory![0].length).toBeLessThan(5000)
  })

  it('throws for an unknown step id', () => {
    const state = makeState([makeStep(1, 'running')])
    expect(() => appendFailureHistory(state, 99, 'x', tmpStatePath)).toThrow('Step 99 not found')
  })
})

// ── archiveState ──────────────────────────────────────────────────────────────

describe('archiveState', () => {
  it('is a no-op when STATE.json does not exist', () => {
    // tmpStatePath was never created → archiveState should return early without throwing
    expect(() => archiveState('F-GHOST', tmpStatePath)).not.toThrow()
  })
})
