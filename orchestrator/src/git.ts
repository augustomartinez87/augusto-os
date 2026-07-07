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

/**
 * Detecta la rama default real del remoto (origin/HEAD) en vez de asumir 'main'.
 * Fallback a `git remote show origin` (repopula origin/HEAD si no estaba seteado)
 * y como último recurso a 'main', logueando que se usó el fallback.
 */
export async function getDefaultBranch(cwd?: string): Promise<string> {
  const root = cwd ?? getRepoRoot()
  const symbolicRef = await execa('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd: root, reject: false })
  if (symbolicRef.exitCode === 0) {
    const branch = symbolicRef.stdout.trim().replace(/^refs\/remotes\/origin\//, '')
    if (branch) return branch
  }
  const remoteShow = await execa('git', ['remote', 'show', 'origin'], { cwd: root, reject: false })
  if (remoteShow.exitCode === 0) {
    const match = remoteShow.stdout.match(/HEAD branch:\s*(\S+)/)
    if (match) return match[1]
  }
  log(`[git] No se pudo detectar la rama default de origin (repo: ${root}) — usando 'main' como fallback`)
  return 'main'
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
  if (!(await hasUncommittedChanges())) {
    const headSha = (await git(['rev-parse', 'HEAD'])).trim()
    log(`[git] Step ${stepId}: sin cambios para commitear (no-op) — se mantiene HEAD ${headSha.slice(0, 8)}`)
    return headSha
  }
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

/**
 * Mergea la feature branch a main de forma LOCAL (--no-ff), sin push.
 * El push a main y el deploy quedan como acción manual de Augusto (gates de prod).
 * Devuelve true si mergeó, false si no pudo (ej. conflicto) — el caller decide.
 */
export async function mergeIntoMain(branch: string, baseBranch: string): Promise<boolean> {
  const checkout = await execa('git', ['checkout', baseBranch], { cwd: getRepoRoot(), reject: false })
  if (checkout.exitCode !== 0) {
    log(`[git] No se pudo cambiar a ${baseBranch}: ${checkout.stderr}`)
    return false
  }
  const merge = await execa('git', ['merge', '--no-ff', branch, '-m', `merge: ${branch} (orquestador, sin review humano)`], {
    cwd: getRepoRoot(), reject: false,
  })
  if (merge.exitCode !== 0) {
    log(`[git] Merge de ${branch} → ${baseBranch} FALLÓ (posible conflicto). Abortando merge y dejando la branch intacta.`)
    await execa('git', ['merge', '--abort'], { cwd: getRepoRoot(), reject: false })
    await execa('git', ['checkout', branch], { cwd: getRepoRoot(), reject: false })
    return false
  }
  log(`[git] Merge OK: ${branch} → ${baseBranch} (local, sin push). Push a ${baseBranch} y deploy = manual.`)
  return true
}

/**
 * Push de main al remoto. Con la integración Git↔Vercel, esto dispara el deploy a prod.
 * Acción de prod → solo se llama DESPUÉS del OK humano y de pasar todas las verificaciones.
 * Aborta si HEAD no está en baseBranch para evitar pushear contenido equivocado a prod.
 */
export async function pushMain(baseBranch: string): Promise<boolean> {
  let current: string
  try {
    current = (await currentBranch()).trim()
  } catch (e) {
    log(`[git] push abortado — no se pudo determinar el branch actual: ${e}`)
    return false
  }
  if (current !== baseBranch) {
    log(`[git] push abortado — HEAD está en '${current}', no en '${baseBranch}'. Verificá que el merge se completó correctamente.`)
    return false
  }
  const res = await execa('git', ['push', 'origin', baseBranch], { cwd: getRepoRoot(), reject: false })
  if (res.exitCode !== 0) {
    log(`[git] push a ${baseBranch} FALLÓ: ${res.stderr}`)
    return false
  }
  log(`[git] push a ${baseBranch} OK → Vercel deploya prod automáticamente`)
  return true
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
