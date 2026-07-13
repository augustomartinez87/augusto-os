import { describe, it, expect, vi, beforeAll } from 'vitest'
import { escalateStep, MAX_FIXER_ATTEMPTS, type FixerInvocationResult } from './escalation.js'
import { setActiveTarget } from './targets.js'
import type { OrchestratorState, Step } from './state.js'
import type { VerifyResult } from './verifier.js'

// buildFixerPrompt reads the active target (name + stack) — 'sistema' has dbModel:'none'
// so it never needs devDatabaseUrl env expansion (unlike kredy/spensiv/argos).
beforeAll(() => {
  setActiveTarget('sistema')
})

const FAKE_STEP: Step = {
  id: 2,
  desc: 'Agregar validación de monto en el form de simulación',
  status: 'blocked',
  commit: null,
  sessionId: null,
  retries: 3,
  ui: false,
  adrIds: [],
  humanApproved: false,
  failureHistory: [
    'builder: TypeError: Cannot read properties of undefined',
    'verifier: tsc --noEmit falló con 3 errores en simulate.ts',
  ],
}

const FAKE_STATE: OrchestratorState = {
  featureId: 'F-0099',
  branch: 'feature/f-0099',
  steps: [FAKE_STEP],
  pausedUntil: null,
  needsHumanApproval: null,
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
  merged: false,
  pushed: false,
}

const OK_VERIFY: VerifyResult = { ok: true, errors: '' }
const FAIL_VERIFY: VerifyResult = { ok: false, errors: 'tsc --noEmit: 1 error remaining' }

function fixerOk(sessionId = 'fixer-session-1'): FixerInvocationResult {
  return { ok: true, sessionId, output: 'fixed it', adrBlocks: [] }
}

function fixerFail(sessionId: string | null = null): FixerInvocationResult {
  return { ok: false, sessionId, output: 'claude exited 1', adrBlocks: [] }
}

describe('escalateStep', () => {
  it('succeeds when the fixer resolves the step and verifier passes on the first attempt', async () => {
    const invokeFixerFn = vi.fn().mockResolvedValue(fixerOk())
    const runVerifierFn = vi.fn().mockResolvedValue(OK_VERIFY)

    const result = await escalateStep(FAKE_STEP, FAKE_STATE, FAKE_STEP.failureHistory, { invokeFixerFn, runVerifierFn })

    expect(result.ok).toBe(true)
    expect(result.sessionId).toBe('fixer-session-1')
    expect(invokeFixerFn).toHaveBeenCalledTimes(1)
    expect(runVerifierFn).toHaveBeenCalledTimes(1)
  })

  it('passes the full failure history into the prompt sent to the fixer', async () => {
    let capturedPrompt = ''
    const invokeFixerFn = vi.fn().mockImplementation(async (prompt: string) => {
      capturedPrompt = prompt
      return fixerOk()
    })
    const runVerifierFn = vi.fn().mockResolvedValue(OK_VERIFY)

    await escalateStep(FAKE_STEP, FAKE_STATE, FAKE_STEP.failureHistory, { invokeFixerFn, runVerifierFn })

    expect(capturedPrompt).toContain('builder: TypeError: Cannot read properties of undefined')
    expect(capturedPrompt).toContain('verifier: tsc --noEmit falló con 3 errores en simulate.ts')
    expect(capturedPrompt).toContain('intento 1:')
    expect(capturedPrompt).toContain('intento 2:')
    expect(capturedPrompt).toContain(FAKE_STEP.desc)
  })

  it('retries with the fixer own session (not the stuck builder session) when the first attempt fails verifier', async () => {
    const invokeFixerFn = vi.fn()
      .mockResolvedValueOnce(fixerOk('fixer-attempt-1'))
      .mockResolvedValueOnce(fixerOk('fixer-attempt-2'))
    const runVerifierFn = vi.fn()
      .mockResolvedValueOnce(FAIL_VERIFY)
      .mockResolvedValueOnce(OK_VERIFY)

    const result = await escalateStep(FAKE_STEP, FAKE_STATE, FAKE_STEP.failureHistory, { invokeFixerFn, runVerifierFn })

    expect(result.ok).toBe(true)
    expect(result.sessionId).toBe('fixer-attempt-2')
    expect(invokeFixerFn).toHaveBeenCalledTimes(2)
    // Second call resumes the fixer's own session from attempt 1, not a fresh/builder session
    expect(invokeFixerFn.mock.calls[1][3]).toBe('fixer-attempt-1')
  })

  it('fails after exhausting MAX_FIXER_ATTEMPTS when the fixer invocation itself keeps failing', async () => {
    const invokeFixerFn = vi.fn().mockResolvedValue(fixerFail())
    const runVerifierFn = vi.fn()

    const result = await escalateStep(FAKE_STEP, FAKE_STATE, FAKE_STEP.failureHistory, { invokeFixerFn, runVerifierFn })

    expect(result.ok).toBe(false)
    expect(result.finalError).toContain('agotó')
    expect(invokeFixerFn).toHaveBeenCalledTimes(MAX_FIXER_ATTEMPTS)
    expect(runVerifierFn).not.toHaveBeenCalled()
  })

  it('fails after exhausting MAX_FIXER_ATTEMPTS when the fixer keeps failing verifier', async () => {
    const invokeFixerFn = vi.fn().mockResolvedValue(fixerOk())
    const runVerifierFn = vi.fn().mockResolvedValue(FAIL_VERIFY)

    const result = await escalateStep(FAKE_STEP, FAKE_STATE, FAKE_STEP.failureHistory, { invokeFixerFn, runVerifierFn })

    expect(result.ok).toBe(false)
    expect(result.finalError).toContain('tsc --noEmit: 1 error remaining')
    expect(invokeFixerFn).toHaveBeenCalledTimes(MAX_FIXER_ATTEMPTS)
    expect(runVerifierFn).toHaveBeenCalledTimes(MAX_FIXER_ATTEMPTS)
  })

  it('works with an empty failure history (falls back to a generic note in the prompt)', async () => {
    let capturedPrompt = ''
    const invokeFixerFn = vi.fn().mockImplementation(async (prompt: string) => {
      capturedPrompt = prompt
      return fixerOk()
    })
    const runVerifierFn = vi.fn().mockResolvedValue(OK_VERIFY)

    const result = await escalateStep(FAKE_STEP, FAKE_STATE, [], { invokeFixerFn, runVerifierFn })

    expect(result.ok).toBe(true)
    expect(capturedPrompt).toContain('sin historial detallado')
  })
})
