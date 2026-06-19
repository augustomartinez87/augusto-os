import { execa } from 'execa'
import { log } from './limits.js'
import { getRepoRoot } from './targets.js'
import { getDbEnvOverride } from './db-guard.js'

export interface VerifyResult {
  ok: boolean
  errors: string
}

async function run(cmd: string, args: string[]): Promise<{ ok: boolean; output: string }> {
  const result = await execa(cmd, args, {
    cwd: getRepoRoot(),
    reject: false,
    all: true,
    env: { ...process.env, ...getDbEnvOverride() },
  })
  return { ok: result.exitCode === 0, output: result.all ?? '' }
}

export async function runVerifier(): Promise<VerifyResult> {
  log('[verifier] Corriendo typecheck...')
  const tc = await run('npx', ['tsc', '--noEmit'])
  if (!tc.ok) {
    log('[verifier] FAIL: typecheck')
    return { ok: false, errors: tc.output }
  }

  log('[verifier] Corriendo lint...')
  const lint = await run('npm', ['run', 'lint'])
  if (!lint.ok) {
    log('[verifier] FAIL: lint')
    return { ok: false, errors: lint.output }
  }

  log('[verifier] Corriendo tests...')
  const test = await run('npm', ['run', 'test'])
  if (!test.ok) {
    const noTests = test.output.includes('No test files found') || test.output.includes('0 tests')
    if (!noTests) {
      log('[verifier] FAIL: tests')
      return { ok: false, errors: test.output }
    }
    log('[verifier] WARNING: no hay test files — continuando')
  }

  log('[verifier] OK: typecheck + lint + tests')
  return { ok: true, errors: '' }
}
