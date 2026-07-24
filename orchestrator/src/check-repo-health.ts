import { execa } from 'execa'
import { setActiveTarget, getRepoRoot } from './targets.js'

export interface CheckResult {
  name: string
  ok: boolean
  detail: string
}

async function run(cmd: string, args: string[], cwd: string): Promise<{ ok: boolean; output: string }> {
  const result = await execa(cmd, args, {
    cwd,
    reject: false,
    all: true,
  })
  return { ok: result.exitCode === 0, output: result.all ?? '' }
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
  process.exit(0)
}

main()
