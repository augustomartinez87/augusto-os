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
