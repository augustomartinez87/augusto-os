import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { execa } from 'execa'
import { pathToFileURL } from 'node:url'
import { setActiveTarget, getRepoRoot } from './targets.js'

export interface CheckResult {
  name: string
  ok: boolean
  detail: string
}

export interface RunOutput {
  ok: boolean
  stdout: string
  stderr: string
}

type RunFn = (cmd: string, args: string[], cwd: string) => Promise<RunOutput>

// stdout y stderr van SEPARADOS a propósito: el stdout de `git status --porcelain` es
// dato para parsear, el stderr es ruido para diagnóstico (git escribe warnings ahí
// incluso con exit code 0, ej. `warning: ... LF will be replaced by CRLF` en Windows).
// Mergearlos (execa `all: true`) hace imposible distinguirlos después.
async function run(cmd: string, args: string[], cwd: string): Promise<RunOutput> {
  const result = await execa(cmd, args, { cwd, reject: false })
  const stderr = result.stderr || result.message || ''
  return { ok: !result.failed && result.exitCode === 0, stdout: result.stdout || '', stderr }
}

export function parseGitStatus(porcelainOutput: string): string[] {
  return porcelainOutput
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => line.slice(3).trim())
    .filter(file => file.length > 0)
}

export async function checkWorkingTree(cwd: string, runFn: RunFn = run): Promise<CheckResult> {
  const result = await runFn('git', ['status', '--porcelain'], cwd)

  // Si git no pudo correr (no es un repo, git ausente, index corrupto) el stderr NO es
  // porcelain: reportarlo como error de ejecución, no como working tree sucio.
  if (!result.ok) {
    const reason = result.stderr.trim() || 'sin salida de error'
    return {
      name: 'working-tree',
      ok: false,
      detail: `No se pudo ejecutar \`git status --porcelain\` en ${cwd}: ${reason}`,
    }
  }

  const files = parseGitStatus(result.stdout)
  if (files.length === 0) {
    return { name: 'working-tree', ok: true, detail: 'Working tree limpio' }
  }
  return {
    name: 'working-tree',
    ok: false,
    detail: `${files.length} archivo(s) con cambios sin commitear:\n${files.map(f => `  ${f}`).join('\n')}`,
  }
}

type FsDeps = {
  existsSync: (p: string) => boolean
  statSync: (p: string) => { mtimeMs: number }
}

function formatAge(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `hace ${h}h ${m}m`
  if (m > 0) return `hace ${m}m ${s}s`
  return `hace ${s}s`
}

export function checkIndexLock(
  cwd: string,
  fsDeps: FsDeps = { existsSync, statSync },
  now: () => number = () => Date.now(),
): CheckResult {
  const gitDir = path.join(cwd, '.git')
  if (!fsDeps.existsSync(gitDir)) {
    return {
      name: 'index-lock',
      ok: true,
      detail: `Advertencia: ${cwd} no parece ser un repo git válido (no existe .git/) — chequeo de lock omitido`,
    }
  }

  const lockPath = path.join(gitDir, 'index.lock')
  if (!fsDeps.existsSync(lockPath)) {
    return { name: 'index-lock', ok: true, detail: 'Sin lock (index.lock no existe)' }
  }

  const { mtimeMs } = fsDeps.statSync(lockPath)
  const age = formatAge(now() - mtimeMs)
  return {
    name: 'index-lock',
    ok: false,
    detail: `Existe .git/index.lock (${age}). Puede ser un proceso git en curso o un lock huérfano. Si no hay procesos git activos, puede eliminarse manualmente.`,
  }
}

export async function checkTypecheck(cwd: string, runFn: RunFn = run): Promise<CheckResult> {
  const result = await runFn('npx', ['tsc', '--noEmit'], cwd)
  if (result.ok) {
    return { name: 'typecheck', ok: true, detail: 'typecheck OK' }
  }
  const combined = [result.stdout, result.stderr].filter(Boolean).join('\n')
  const lines = combined.split('\n')
  const truncated =
    lines.length > 40 ? `...(truncado, mostrando últimas 40 líneas)\n${lines.slice(-40).join('\n')}` : combined
  return { name: 'typecheck', ok: false, detail: `typecheck falló:\n${truncated}` }
}

async function main(): Promise<void> {
  const target = process.argv[2]
  if (!target) {
    console.error('Uso: npm run check-repo-health <target>')
    process.exit(1)
  }

  try {
    setActiveTarget(target)
  } catch (err) {
    console.error(`[check-repo-health] Target inválido: ${(err as Error).message}`)
    process.exit(1)
  }

  const repoRoot = getRepoRoot()
  console.log(`[check-repo-health] repo root: ${repoRoot}`)

  const checks: CheckResult[] = []

  const wt = await checkWorkingTree(repoRoot)
  checks.push(wt)

  const lock = checkIndexLock(repoRoot)
  checks.push(lock)

  const tc = await checkTypecheck(repoRoot)
  checks.push(tc)

  for (const c of checks) {
    const icon = c.ok ? '✓' : '✗'
    console.log(`${icon} ${c.name}: ${c.detail}`)
  }

  const allOk = checks.every(c => c.ok)
  process.exit(allOk ? 0 : 1)
}

// Solo auto-ejecutar como CLI: sin este guard, importar el módulo desde un test
// dispara main() y su process.exit(), lo que anula el propósito de inyectar runFn.
const invokedPath = process.argv[1]
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) {
  main()
}
