import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { parseReviewOutput, runReviewer } from './reviewer.js'
import type { OrchestratorState, Step } from './state.js'

// ── parseReviewOutput ─────────────────────────────────────────────────────────

describe('parseReviewOutput', () => {
  it('returns approved=true for REVIEW: APPROVED', () => {
    const result = parseReviewOutput('REVIEW: APPROVED')
    expect(result.approved).toBe(true)
    expect(result.feedback).toBe('')
  })

  it('returns approved=true for REVIEW: APPROVED with trailing text', () => {
    const result = parseReviewOutput('REVIEW: APPROVED\nsome extra text')
    expect(result.approved).toBe(true)
  })

  it('returns approved=false with parsed feedback for REVIEW: CHANGES_REQUESTED', () => {
    const raw = 'REVIEW: CHANGES_REQUESTED\n- Issue 1\n- Issue 2'
    const result = parseReviewOutput(raw)
    expect(result.approved).toBe(false)
    expect(result.feedback).toBe('- Issue 1\n- Issue 2')
  })

  it('returns approved=false with full text as feedback for unrecognized format (fail-safe)', () => {
    const raw = 'I think this looks good overall but there are some concerns...'
    const result = parseReviewOutput(raw)
    expect(result.approved).toBe(false)
    expect(result.feedback).toBe(raw)
  })

  it('fail-safe: partial APPROVED text without prefix does not approve', () => {
    const result = parseReviewOutput('The code is APPROVED but I have questions')
    expect(result.approved).toBe(false)
  })

  it('trims whitespace before parsing', () => {
    const result = parseReviewOutput('  REVIEW: APPROVED  \n')
    expect(result.approved).toBe(true)
  })
})

// ── runReviewer ───────────────────────────────────────────────────────────────

const FAKE_STEP: Step = {
  id: 3,
  desc: 'Agregar endpoint /api/export/csv',
  status: 'running',
  commit: null,
  sessionId: null,
  retries: 0,
  ui: false,
  adrIds: [],
  humanApproved: false,
}

const FAKE_STATE: OrchestratorState = {
  featureId: 'F-0005',
  branch: 'feature/f-0005',
  steps: [FAKE_STEP],
  pausedUntil: null,
  needsHumanApproval: null,
  createdAt: '2026-06-26T00:00:00.000Z',
  updatedAt: '2026-06-26T00:00:00.000Z',
  merged: false,
  pushed: false,
}

// We use a real git repo as repoRoot so `git diff` works without hitting the active target.
// All tests inject callClaude so the model is never actually invoked.
let tmpDir: string
let gitRoot: string

describe('runReviewer', () => {
  beforeEach(async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'reviewer-test-'))
    gitRoot = path.join(tmpDir, 'repo')
    mkdirSync(gitRoot)

    // Init a bare-minimum git repo so `git diff` returns an empty diff by default
    const { execa } = await import('execa')
    await execa('git', ['init'], { cwd: gitRoot, reject: false })
    await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: gitRoot, reject: false })
    await execa('git', ['config', 'user.name', 'Test'], { cwd: gitRoot, reject: false })
    // Create an initial commit so HEAD exists
    writeFileSync(path.join(gitRoot, 'README.md'), 'init')
    await execa('git', ['add', '.'], { cwd: gitRoot, reject: false })
    await execa('git', ['commit', '-m', 'init'], { cwd: gitRoot, reject: false })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true })
    vi.restoreAllMocks()
  })

  it('returns approved=true without calling the model when diff is empty', async () => {
    const callClaude = vi.fn()

    const result = await runReviewer(FAKE_STEP, FAKE_STATE, { repoRoot: gitRoot, callClaude })

    expect(result.approved).toBe(true)
    expect(result.feedback).toBe('')
    expect(callClaude).not.toHaveBeenCalled()
  })

  async function stageFile(filename: string, content: string) {
    const { execa } = await import('execa')
    writeFileSync(path.join(gitRoot, filename), content)
    await execa('git', ['add', filename], { cwd: gitRoot, reject: false })
  }

  it('returns approved=true when model responds REVIEW: APPROVED', async () => {
    await stageFile('foo.ts', 'export function foo() {}')

    const callClaude = vi.fn().mockResolvedValue('REVIEW: APPROVED')

    const result = await runReviewer(FAKE_STEP, FAKE_STATE, { repoRoot: gitRoot, callClaude })

    expect(result.approved).toBe(true)
    expect(callClaude).toHaveBeenCalledOnce()
  })

  it('returns approved=false with parsed feedback when model responds CHANGES_REQUESTED', async () => {
    await stageFile('bar.ts', 'const x = 1')

    const callClaude = vi.fn().mockResolvedValue(
      'REVIEW: CHANGES_REQUESTED\n- Variable x no tiene nombre descriptivo\n- Falta export'
    )

    const result = await runReviewer(FAKE_STEP, FAKE_STATE, { repoRoot: gitRoot, callClaude })

    expect(result.approved).toBe(false)
    expect(result.feedback).toContain('Variable x no tiene nombre descriptivo')
    expect(result.feedback).toContain('Falta export')
  })

  it('returns approved=false when model output does not match format (fail-safe)', async () => {
    await stageFile('baz.ts', 'const x = 1')

    const callClaude = vi.fn().mockResolvedValue('Looks good to me! The change is clean.')

    const result = await runReviewer(FAKE_STEP, FAKE_STATE, { repoRoot: gitRoot, callClaude })

    expect(result.approved).toBe(false)
    expect(result.feedback).toBe('Looks good to me! The change is clean.')
  })

  it('includes step desc and featureId in the prompt sent to the model', async () => {
    await stageFile('qux.ts', 'export const x = 1')

    let capturedPrompt = ''
    const callClaude = vi.fn().mockImplementation(async (prompt: string) => {
      capturedPrompt = prompt
      return 'REVIEW: APPROVED'
    })

    await runReviewer(FAKE_STEP, FAKE_STATE, { repoRoot: gitRoot, callClaude })

    expect(capturedPrompt).toContain('Agregar endpoint /api/export/csv')
    expect(capturedPrompt).toContain('F-0005')
    expect(capturedPrompt).toContain('step 3')
  })

  it('truncates large diffs and includes a truncation note in the prompt', async () => {
    const bigContent = Array.from({ length: 500 }, (_, i) => `export const var${i} = ${i}`).join('\n')
    await stageFile('large.ts', bigContent)

    let capturedPrompt = ''
    const callClaude = vi.fn().mockImplementation(async (prompt: string) => {
      capturedPrompt = prompt
      return 'REVIEW: APPROVED'
    })

    await runReviewer(FAKE_STEP, FAKE_STATE, { repoRoot: gitRoot, callClaude })

    expect(capturedPrompt).toContain('diff truncado')
  })
})
