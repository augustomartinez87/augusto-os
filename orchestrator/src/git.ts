import { execa } from 'execa'
import { log } from './limits.js'
import { getRepoRoot } from './targets.js'

async function git(args: string[], cwd?: string): Promise<string> {
  const root = cwd ?? getRepoRoot()
  const result = await execa('git', args, { cwd: root, reject: false })
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  }
  return result.stdout
}

export async function currentBranch(): Promise<string> {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'])
}

export async function createFeatureBranch(featureId: string, title: string): Promise<string> {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
  const branch = `feat/${featureId}-${slug}`
  const exists = await git(['branch', '--list', branch])
  if (!exists.trim()) {
    await git(['checkout', '-b', branch])
    log(`[git] Branch creado: ${branch}`)
  } else {
    await git(['checkout', branch])
    log(`[git] Branch existente: ${branch}`)
  }
  return branch
}

export async function stageAll(): Promise<void> {
  await git(['add', '-A'])
}

export async function commitStep(stepId: number, desc: string): Promise<string> {
  await stageAll()
  const msg = `feat(orchestrator): step ${stepId} — ${desc.slice(0, 60)}\n\n[orchestrator auto-commit]`
  await git(['commit', '-m', msg])
  const sha = await git(['rev-parse', 'HEAD'])
  log(`[git] Commit ${sha.slice(0, 8)}: step ${stepId}`)
  return sha.trim()
}

export async function hasUncommittedChanges(): Promise<boolean> {
  const status = await git(['status', '--porcelain'])
  return status.trim().length > 0
}

export async function createPR(featureId: string, title: string, body: string): Promise<void> {
  try {
    const result = await execa('gh', ['pr', 'create', '--title', `[${featureId}] ${title}`, '--body', body], {
      cwd: getRepoRoot(),
      reject: false,
    })
    if (result.exitCode === 0) {
      log(`[git] PR creado: ${result.stdout}`)
    } else {
      log(`[git] No se pudo crear PR: ${result.stderr}`)
    }
  } catch {
    log('[git] gh CLI no disponible — crear PR manualmente')
  }
}
