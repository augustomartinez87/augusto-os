import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execa } from 'execa'
import { getDefaultBranch } from './git.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const BACKLOG_PATH = path.join(__dirname, '..', '..', 'system', 'BACKLOG.md')
const AUGUSTO_OS_ROOT = path.join(__dirname, '..', '..')

export interface BacklogUpdateResult {
  updated: string[]
  missing: string[]
}

// Marca en system/BACKLOG.md las filas resueltas por un feature liberado a prod:
// columna Prioridad (2da) → ✅, columna Estado (4ta) → `done <date> (<featureId>, orquestador, liberado a prod)`.
// Matchea el ID completo entre pipes (parts[1] tras split('|')) para evitar colisiones de
// substring (TS-1 vs TS-17). IDs de `resolves` que no aparecen en el archivo van a `missing`,
// nunca crashea — el release ya pasó el gate de push cuando esto corre.
export function updateBacklogStatus(
  featureId: string,
  resolves: string[],
  date: string,
  backlogPath: string = BACKLOG_PATH,
): BacklogUpdateResult {
  if (!resolves.length) return { updated: [], missing: [] }
  if (!existsSync(backlogPath)) return { updated: [], missing: [...resolves] }

  const wanted = new Set(resolves)
  const found = new Set<string>()
  const content = readFileSync(backlogPath, 'utf-8')
  const lines = content.split('\n')

  const updatedLines = lines.map(ln => {
    if (!ln.startsWith('|')) return ln
    const parts = ln.split('|')
    // '' | ID | P | Descripción | Estado | Ejecutor | ''  → parts[1]=ID, parts[2]=P, parts[4]=Estado
    if (parts.length < 5) return ln
    const id = parts[1].trim()
    if (!wanted.has(id)) return ln

    found.add(id)
    parts[2] = ' ✅ '
    parts[4] = ` done ${date} (${featureId}, orquestador, liberado a prod) `
    return parts.join('|')
  })

  const updated: string[] = []
  const missing: string[] = []
  for (const id of resolves) {
    if (found.has(id)) updated.push(id)
    else missing.push(id)
  }

  if (updated.length) {
    writeFileSync(backlogPath, updatedLines.join('\n'), 'utf-8')
  }

  return { updated, missing }
}

export interface BacklogPushResult {
  committed: boolean
  pushed: boolean
  branch?: string
  error?: string
}

// Núcleo compartido de commitAndPushBacklog() y pushBacklogFile() de abajo. Comitea y pushea
// ÚNICAMENTE system/BACKLOG.md (git add explícito de ese path, nunca `-A` ni `.`) para no
// arrastrar cambios ajenos que puedan estar sueltos en el working tree de augusto-os. No
// pushea si el repo no está parado en su default branch — mismo criterio de seguridad que
// pushMain() en git.ts — para no pushear en medio de otra operación en curso sobre este mismo
// repo (p.ej. una feature de target "sistema" a mitad de merge).
async function commitAndPush(repoRoot: string, message: string): Promise<BacklogPushResult> {
  const status = await execa('git', ['status', '--porcelain', 'system/BACKLOG.md'], { cwd: repoRoot, reject: false })
  if (status.exitCode !== 0) return { committed: false, pushed: false, error: status.stderr }
  if (!status.stdout.trim()) return { committed: false, pushed: false } // ya estaba al día (idempotente)

  const branch = await getDefaultBranch(repoRoot)
  const current = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot, reject: false })
  if (current.stdout.trim() !== branch) {
    return {
      committed: false,
      pushed: false,
      branch,
      error: `HEAD en '${current.stdout.trim()}', no en '${branch}' — no se toca`,
    }
  }

  const add = await execa('git', ['add', 'system/BACKLOG.md'], { cwd: repoRoot, reject: false })
  if (add.exitCode !== 0) return { committed: false, pushed: false, branch, error: add.stderr }

  const commit = await execa('git', ['commit', '-m', message], { cwd: repoRoot, reject: false })
  if (commit.exitCode !== 0) return { committed: false, pushed: false, branch, error: commit.stderr }

  const push = await execa('git', ['push', 'origin', branch], { cwd: repoRoot, reject: false })
  if (push.exitCode !== 0) return { committed: true, pushed: false, branch, error: push.stderr }

  return { committed: true, pushed: true, branch }
}

// S-0XX: updateBacklogStatus() de arriba solo escribe en disco. Sin este paso, el archivo
// queda actualizado en el working tree de augusto-os pero el repo remoto (GitHub) nunca se
// entera — el loop comitea/pushea el repo del TARGET (kredy/argos/tres-saltenas, vía
// getRepoRoot() en targets.ts), que es un repo distinto al de augusto-os donde vive
// system/BACKLOG.md. Resultado real observado: cualquier lectura fresca desde
// raw.githubusercontent.com (o un `git clone` nuevo) del backlog muestra ítems ya resueltos
// como "pending"/"armado", porque el commit con el estado real nunca salió de esta máquina.
//
// Llamar SOLO después de updateBacklogStatus() con los mismos `updatedIds` que esa función
// devolvió — nunca con IDs a mano, para no comitear un estado que updateBacklogStatus no
// escribió de verdad.
export async function commitAndPushBacklog(
  featureId: string,
  updatedIds: string[],
  repoRoot: string = AUGUSTO_OS_ROOT,
): Promise<BacklogPushResult> {
  if (!updatedIds.length) return { committed: false, pushed: false }
  const msg = `chore(backlog): marcar ${updatedIds.join(', ')} done (${featureId})\n\n[orchestrator auto-commit]`
  return commitAndPush(repoRoot, msg)
}

// Para reconciliación MANUAL (sesiones de Cowork/Claude Code fuera del loop, que suelen editar
// system/BACKLOG.md a mano con notas largas en prosa — no el formato mecánico de
// updateBacklogStatus). Pensado para invocarse vía `npm run backlog:push -- "<mensaje>"`
// (ver backlog-cli.ts) al cerrar cualquier sesión que haya tocado el backlog a mano, así ese
// cambio también sale del disco local. Mismas garantías de seguridad que commitAndPushBacklog:
// solo ese archivo, solo si el repo está en su default branch, nunca crashea si no hay nada
// para comitear.
export async function pushBacklogFile(
  message: string,
  repoRoot: string = AUGUSTO_OS_ROOT,
): Promise<BacklogPushResult> {
  const full = `${message}\n\n[reconciliación manual — Cowork/Claude Code]`
  return commitAndPush(repoRoot, full)
}
