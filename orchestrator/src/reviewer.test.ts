import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { parseReviewOutput, runReviewer } from './reviewer.js'
import { setActiveTarget } from './targets.js'
import type { OrchestratorState, Step } from './state.js'
import { UsageLimitError } from './limits.js'
import type { ProbeOpts } from './limits.js'

vi.mock('./state.js', () => ({ saveState: vi.fn() }))

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
  failureHistory: [],
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
  // runReviewer ahora lee el target activo (getTargetConfig().dbModel) para armar las
  // restricciones absolutas — 'sistema' tiene dbModel:'none' y no requiere env de DB.
  beforeAll(() => {
    setActiveTarget('sistema')
  })

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

  it('retries after UsageLimitError and returns the review result on the next call', async () => {
    await stageFile('limit.ts', 'export const x = 1')

    const usageLimitOpts: ProbeOpts = {
      sleepMs: () => Promise.resolve(),
      sleepUntilFn: () => Promise.resolve(),
      probeFn: () => Promise.resolve(true),
    }

    let callCount = 0
    const callClaude = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) throw new UsageLimitError('usage limit reached')
      return 'REVIEW: APPROVED'
    })

    const result = await runReviewer(FAKE_STEP, FAKE_STATE, { repoRoot: gitRoot, callClaude, usageLimitOpts })

    expect(result.approved).toBe(true)
    expect(result.feedback).toBe('')
    expect(callClaude).toHaveBeenCalledTimes(2)
  })

  it('never returns approved=false with limit text as feedback when UsageLimitError is thrown', async () => {
    await stageFile('limit2.ts', 'export const y = 2')

    const usageLimitOpts: ProbeOpts = {
      sleepMs: () => Promise.resolve(),
      sleepUntilFn: () => Promise.resolve(),
      probeFn: () => Promise.resolve(true),
    }

    const callClaude = vi.fn()
      .mockRejectedValueOnce(new UsageLimitError('session limit reached — resets 3am'))
      .mockResolvedValue('REVIEW: APPROVED')

    const result = await runReviewer(FAKE_STEP, FAKE_STATE, { repoRoot: gitRoot, callClaude, usageLimitOpts })

    expect(result.approved).toBe(true)
    expect(result.feedback).not.toContain('session limit')
  })

  // ── exclusión de archivos de sistema ─────────────────────────────────────────

  it('solo system/DECISIONS.md staged → diff excluido → approved=true sin invocar callClaude', async () => {
    const { execa } = await import('execa')
    mkdirSync(path.join(gitRoot, 'system'), { recursive: true })
    writeFileSync(path.join(gitRoot, 'system', 'DECISIONS.md'), '## ADR-0001\ndecision\n')
    await execa('git', ['add', 'system/DECISIONS.md'], { cwd: gitRoot, reject: false })

    const callClaude = vi.fn()

    const result = await runReviewer(FAKE_STEP, FAKE_STATE, { repoRoot: gitRoot, callClaude })

    expect(result.approved).toBe(true)
    expect(result.feedback).toBe('')
    expect(callClaude).not.toHaveBeenCalled()
  })

  it('solo system/PROGRESS.md staged (modificado) → diff excluido → approved=true sin invocar callClaude', async () => {
    const { execa } = await import('execa')
    mkdirSync(path.join(gitRoot, 'system'), { recursive: true })
    writeFileSync(path.join(gitRoot, 'system', 'PROGRESS.md'), '# Progress inicial\n')
    await execa('git', ['add', 'system/PROGRESS.md'], { cwd: gitRoot, reject: false })
    await execa('git', ['commit', '-m', 'add progress'], { cwd: gitRoot, reject: false })
    writeFileSync(path.join(gitRoot, 'system', 'PROGRESS.md'), '# Progress actualizado\n')
    await execa('git', ['add', 'system/PROGRESS.md'], { cwd: gitRoot, reject: false })

    const callClaude = vi.fn()

    const result = await runReviewer(FAKE_STEP, FAKE_STATE, { repoRoot: gitRoot, callClaude })

    expect(result.approved).toBe(true)
    expect(result.feedback).toBe('')
    expect(callClaude).not.toHaveBeenCalled()
  })

  it('cambio en .ts + system/DECISIONS.md → prompt incluye el .ts y excluye DECISIONS.md', async () => {
    const { execa } = await import('execa')
    mkdirSync(path.join(gitRoot, 'system'), { recursive: true })
    writeFileSync(path.join(gitRoot, 'feature.ts'), 'export const featureX = 42')
    writeFileSync(path.join(gitRoot, 'system', 'DECISIONS.md'), '## ADR-0001\ndecision\n')
    await execa('git', ['add', 'feature.ts', 'system/DECISIONS.md'], { cwd: gitRoot, reject: false })

    let capturedPrompt = ''
    const callClaude = vi.fn().mockImplementation(async (prompt: string) => {
      capturedPrompt = prompt
      return 'REVIEW: APPROVED'
    })

    const result = await runReviewer(FAKE_STEP, FAKE_STATE, { repoRoot: gitRoot, callClaude })

    expect(result.approved).toBe(true)
    expect(callClaude).toHaveBeenCalledOnce()
    expect(capturedPrompt).toContain('feature.ts')
    expect(capturedPrompt).not.toContain('DECISIONS.md')
  })

  it('repo sin system/DECISIONS.md ni PROGRESS.md → sin error al revisar cambio normal', async () => {
    await stageFile('plain.ts', 'export const plain = true')

    const callClaude = vi.fn().mockResolvedValue('REVIEW: APPROVED')

    const result = await runReviewer(FAKE_STEP, FAKE_STATE, { repoRoot: gitRoot, callClaude })

    expect(result.approved).toBe(true)
    expect(callClaude).toHaveBeenCalledOnce()
  })

  // ── F-0068: archivos nuevos sin trackear ──────────────────────────────────────

  it('(F-0068-a) solo archivo nuevo sin trackear → callClaude invocado con contenido del archivo', async () => {
    mkdirSync(path.join(gitRoot, 'src'), { recursive: true })
    writeFileSync(path.join(gitRoot, 'src', 'nuevo.ts'), 'export const x = 1')
    // No git add — archivo queda sin trackear

    let capturedPrompt = ''
    const callClaude = vi.fn().mockImplementation(async (prompt: string) => {
      capturedPrompt = prompt
      return 'REVIEW: APPROVED'
    })

    const result = await runReviewer(FAKE_STEP, FAKE_STATE, { repoRoot: gitRoot, callClaude })

    expect(callClaude).toHaveBeenCalledOnce()
    expect(capturedPrompt).toContain('nuevo.ts')
    expect(capturedPrompt).toContain('export const x = 1')
    expect(result.approved).toBe(true)
  })

  it('(F-0068-b) archivo nuevo sin trackear + modificación trackeada → ambos en el prompt', async () => {
    const { execa: exec } = await import('execa')
    writeFileSync(path.join(gitRoot, 'existing.ts'), 'export const a = 1')
    await exec('git', ['add', 'existing.ts'], { cwd: gitRoot, reject: false })
    await exec('git', ['commit', '-m', 'add existing'], { cwd: gitRoot, reject: false })
    writeFileSync(path.join(gitRoot, 'existing.ts'), 'export const a = 2')
    writeFileSync(path.join(gitRoot, 'new.ts'), 'export const b = 3')

    let capturedPrompt = ''
    const callClaude = vi.fn().mockImplementation(async (prompt: string) => {
      capturedPrompt = prompt
      return 'REVIEW: APPROVED'
    })

    await runReviewer(FAKE_STEP, FAKE_STATE, { repoRoot: gitRoot, callClaude })

    expect(callClaude).toHaveBeenCalledOnce()
    expect(capturedPrompt).toContain('existing.ts')
    expect(capturedPrompt).toContain('new.ts')
  })

  it('(F-0068-c) archivo ignorado por .gitignore → no aparece en el prompt', async () => {
    const { execa: exec } = await import('execa')
    writeFileSync(path.join(gitRoot, '.gitignore'), 'logs/\n')
    await exec('git', ['add', '.gitignore'], { cwd: gitRoot, reject: false })
    await exec('git', ['commit', '-m', 'add gitignore'], { cwd: gitRoot, reject: false })
    mkdirSync(path.join(gitRoot, 'logs'), { recursive: true })
    writeFileSync(path.join(gitRoot, 'logs', 'x.log'), 'some log')
    writeFileSync(path.join(gitRoot, 'real.ts'), 'export const real = true')

    let capturedPrompt = ''
    const callClaude = vi.fn().mockImplementation(async (prompt: string) => {
      capturedPrompt = prompt
      return 'REVIEW: APPROVED'
    })

    await runReviewer(FAKE_STEP, FAKE_STATE, { repoRoot: gitRoot, callClaude })

    expect(callClaude).toHaveBeenCalledOnce()
    expect(capturedPrompt).toContain('real.ts')
    expect(capturedPrompt).not.toContain('x.log')
  })

  it('(F-0068-d) system/DECISIONS.md y system/PROGRESS.md nuevos sin trackear → excluidos, diff vacío', async () => {
    mkdirSync(path.join(gitRoot, 'system'), { recursive: true })
    writeFileSync(path.join(gitRoot, 'system', 'DECISIONS.md'), '## ADR-001\n')
    writeFileSync(path.join(gitRoot, 'system', 'PROGRESS.md'), '# Progress\n')

    const callClaude = vi.fn()

    const result = await runReviewer(FAKE_STEP, FAKE_STATE, { repoRoot: gitRoot, callClaude })

    expect(result.approved).toBe(true)
    expect(result.feedback).toBe('')
    expect(callClaude).not.toHaveBeenCalled()
  })

  it('(F-0068-d2) system/DECISIONS.md nuevo + feature.ts nuevo → prompt incluye feature.ts, excluye DECISIONS.md', async () => {
    mkdirSync(path.join(gitRoot, 'system'), { recursive: true })
    writeFileSync(path.join(gitRoot, 'system', 'DECISIONS.md'), '## ADR-001\n')
    writeFileSync(path.join(gitRoot, 'feature.ts'), 'export const feature = 42')

    let capturedPrompt = ''
    const callClaude = vi.fn().mockImplementation(async (prompt: string) => {
      capturedPrompt = prompt
      return 'REVIEW: APPROVED'
    })

    await runReviewer(FAKE_STEP, FAKE_STATE, { repoRoot: gitRoot, callClaude })

    expect(callClaude).toHaveBeenCalledOnce()
    expect(capturedPrompt).toContain('feature.ts')
    expect(capturedPrompt).not.toContain('DECISIONS.md')
  })

  it('(F-0068-e) repo sin cambios ni archivos nuevos → approved=true sin invocar modelo', async () => {
    const callClaude = vi.fn()

    const result = await runReviewer(FAKE_STEP, FAKE_STATE, { repoRoot: gitRoot, callClaude })

    expect(result.approved).toBe(true)
    expect(result.feedback).toBe('')
    expect(callClaude).not.toHaveBeenCalled()
  })

  it('(F-0068-f) tras runReviewer + git add -A + commit, git status --porcelain queda vacío y archivo nuevo figura en el commit', async () => {
    const { execa: exec } = await import('execa')
    writeFileSync(path.join(gitRoot, 'nuevo.ts'), 'export const nuevo = true')

    const callClaude = vi.fn().mockResolvedValue('REVIEW: APPROVED')

    await runReviewer(FAKE_STEP, FAKE_STATE, { repoRoot: gitRoot, callClaude })

    // Simula commitStep: git add -A && git commit
    await exec('git', ['add', '-A'], { cwd: gitRoot })
    await exec('git', ['commit', '-m', 'test commit'], { cwd: gitRoot })

    const porcelain = (await exec('git', ['status', '--porcelain'], { cwd: gitRoot })).stdout
    expect(porcelain.trim()).toBe('')

    const changed = (await exec('git', ['diff', '--name-only', 'HEAD~1', 'HEAD'], { cwd: gitRoot })).stdout
    expect(changed).toContain('nuevo.ts')
  })
})
