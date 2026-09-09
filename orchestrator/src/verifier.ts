import { execa } from 'execa'
import { readdirSync, readFileSync, existsSync, type Dirent } from 'fs'
import path from 'path'
import { log } from './limits.js'
import { getRepoRoot, getTargetConfig } from './targets.js'
import { getDbEnvOverride } from './db-guard.js'

export interface VerifyResult {
  ok: boolean
  errors: string
}

async function run(cmd: string, args: string[]): Promise<{ ok: boolean; output: string }> {
  const cwd = getRepoRoot()
  const result = await execa(cmd, args, {
    cwd,
    reject: false,
    all: true,
    // preferLocal: resuelve el binario desde <cwd>/node_modules/.bin antes que el PATH global.
    // Sin esto, un testCmd/verifyCmd como 'vitest run' (target argos) puede resolver un binario
    // vitest distinto al que corresponde a este repo (ej. el de augusto-os/orchestrator) y romper
    // con errores tipo 'No handler function exported from .../vitest/dist/worker.js' por mezclar
    // versiones de vitest/tinypool entre dos node_modules distintos. npm run <script> evitaba esto
    // por construccion (siempre resolvia local); al pasar a correr verifyCmd/testCmd tal cual, hay
    // que pedirlo explicitamente.
    preferLocal: true,
    localDir: cwd,
    env: { ...process.env, ...getDbEnvOverride() },
  })
  return { ok: result.exitCode === 0, output: result.all ?? '' }
}

function parseCmd(cmdStr: string): { cmd: string; args: string[] } {
  const parts = cmdStr.trim().split(/\s+/)
  return { cmd: parts[0], args: parts.slice(1) }
}

export async function runVerifier(): Promise<VerifyResult> {
  const target = getTargetConfig()

  log('[verifier] Corriendo typecheck...')
  const tcCmd = parseCmd(target.verifyCmd)
  const tc = await run(tcCmd.cmd, tcCmd.args)
  if (!tc.ok) {
    log('[verifier] FAIL: typecheck')
    return { ok: false, errors: tc.output }
  }

  if (!target.lintCmd || !target.lintCmd.trim()) {
    log('[verifier] lint omitido (target sin lintCmd configurado)')
  } else {
  log('[verifier] Corriendo lint...')
  const lintCmd = parseCmd(target.lintCmd)
  const lint = await run(lintCmd.cmd, lintCmd.args)
  if (!lint.ok) {
    const noScript = /missing script/i.test(lint.output)
    if (!noScript) {
      log('[verifier] FAIL: lint')
      return { ok: false, errors: lint.output }
    }
    log('[verifier] WARNING: target sin script "lint" — omitido')
  }
  }

  log('[verifier] Corriendo tests...')
  const testCmd = parseCmd(target.testCmd)
  const test = await run(testCmd.cmd, testCmd.args)
  if (!test.ok) {
    const noTests = /No test files found|0 tests|no tests ran|no tests collected/i.test(test.output)
    if (!noTests) {
      log('[verifier] FAIL: tests')
      return { ok: false, errors: test.output }
    }
    log('[verifier] WARNING: no hay test files — continuando')
  }

  log('[verifier] OK: typecheck + lint + tests')
  return { ok: true, errors: '' }
}

// ── Release checks (pre push+deploy a prod) ───────────────────────────────────

export interface ReleaseResult {
  ok: boolean
  errors: string
  tnaNote: string
}

// Patrones que NO deben aparecer como texto en vistas de prestatario.
const FORBIDDEN_BORROWER_PATTERNS: RegExp[] = [
  /\bTNA\b/,
  /tasa\s+nominal/i,
  /tasa\s+anual/i,
  /\bTEA\b/,
  /interés\s+anual/i,
]

// Carpetas con vistas de PRESTATARIO a escanear (las que existan).
// OJO: NO incluir app/ap — es la consola del Agente Productor, donde ver/fijar TNA es legítimo.
const BORROWER_DIRS = ['app/l', 'app/simular', 'app/share']

function walkFiles(dir: string, exts: string[]): string[] {
  const out: string[] = []
  let entries: Dirent[]
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walkFiles(full, exts))
    else if (exts.some(x => e.name.endsWith(x))) out.push(full)
  }
  return out
}

/** Escaneo estático best-effort: busca patrones TNA/tasa en el código de vistas de prestatario. Informativo. */
function scanTnaLeak(repoRoot: string): string {
  try {
    const hits: string[] = []
    for (const rel of BORROWER_DIRS) {
      const dir = path.join(repoRoot, rel)
      if (!existsSync(dir)) continue
      for (const file of walkFiles(dir, ['.tsx', '.ts'])) {
        const lines = readFileSync(file, 'utf-8').split('\n')
        lines.forEach((line, i) => {
          if (FORBIDDEN_BORROWER_PATTERNS.some(p => p.test(line))) {
            hits.push(`${path.relative(repoRoot, file)}:${i + 1}`)
          }
        })
      }
    }
    if (hits.length === 0) return 'TNA check: limpio (sin patrones TNA/tasa/TEA en vistas de prestatario)'
    return `TNA check: ⚠️ REVISAR ${hits.length} coincidencia(s) — ${hits.slice(0, 10).join(', ')}${hits.length > 10 ? ' …' : ''}`
  } catch (err) {
    return `TNA check: no se pudo escanear (${(err as Error).message})`
  }
}

/**
 * Battery completa previa al push+deploy: typecheck + lint + tests + build de prod,
 * más un escaneo informativo de fuga de TNA/tasa. Hard-fail solo en typecheck/lint/tests/build.
 */
export async function runReleaseChecks(): Promise<ReleaseResult> {
  const tnaNote = scanTnaLeak(getRepoRoot())
  const target = getTargetConfig()

  log('[release] typecheck...')
  const tcCmd = parseCmd(target.verifyCmd)
  const tc = await run(tcCmd.cmd, tcCmd.args)
  if (!tc.ok) return { ok: false, errors: `typecheck:\n${tc.output}`, tnaNote }

  if (target.lintCmd && target.lintCmd.trim()) {
    log('[release] lint...')
    const lintCmd = parseCmd(target.lintCmd)
    const lint = await run(lintCmd.cmd, lintCmd.args)
    if (!lint.ok && !/missing script/i.test(lint.output)) return { ok: false, errors: `lint:\n${lint.output}`, tnaNote }
  } else {
    log('[release] lint omitido (target sin lintCmd configurado)')
  }

  log('[release] tests...')
  const testCmd = parseCmd(target.testCmd)
  const test = await run(testCmd.cmd, testCmd.args)
  if (!test.ok) {
    const noTests = /No test files found|0 tests|no tests ran|no tests collected/i.test(test.output)
    if (!noTests) return { ok: false, errors: `tests:\n${test.output}`, tnaNote }
  }

  const buildCmdStr = target.buildCmd ?? 'npm run build'
  if (buildCmdStr.trim()) {
    log('[release] build de prod...')
    const buildCmd = parseCmd(buildCmdStr)
    const build = await run(buildCmd.cmd, buildCmd.args)
    if (!build.ok && !/missing script/i.test(build.output)) return { ok: false, errors: `build:\n${build.output.slice(-4000)}`, tnaNote }
  } else {
    log('[release] build omitido (target sin buildCmd)')
  }

  log(`[release] OK: typecheck + lint + tests + build. ${tnaNote}`)
  return { ok: true, errors: '', tnaNote }
}
