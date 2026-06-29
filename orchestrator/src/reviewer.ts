import { execa } from 'execa'
import { log } from './limits.js'
import { type OrchestratorState, type Step } from './state.js'
import { getRepoRoot } from './targets.js'
import { loadSpecSections } from './executor.js'
import { MODEL_REVIEWER, MAX_TURNS } from './models.js'

export interface ReviewResult {
  approved: boolean
  feedback: string
}

export interface ReviewerOpts {
  callClaude?: (prompt: string) => Promise<string>
  repoRoot?: string
}

const DIFF_MAX_CHARS = 8000

export async function runReviewer(
  step: Step,
  state: OrchestratorState,
  opts?: ReviewerOpts,
): Promise<ReviewResult> {
  const root = opts?.repoRoot ?? getRepoRoot()
  const diffResult = await execa('git', ['diff', 'HEAD'], {
    cwd: root,
    reject: false,
    all: true,
  })

  const rawDiff = diffResult.all ?? ''

  if (!rawDiff.trim()) {
    log(`[reviewer] Diff vacío — step ${step.id} aprobado sin invocar modelo`)
    return { approved: true, feedback: '' }
  }

  let diff = rawDiff
  let truncationNote = ''
  if (diff.length > DIFF_MAX_CHARS) {
    diff = rawDiff.slice(0, DIFF_MAX_CHARS)
    truncationNote = `\n[diff truncado — primeras ${DIFF_MAX_CHARS} de ${rawDiff.length} caracteres (${rawDiff.split('\n').length} líneas totales)]`
  }

  const specSections = loadSpecSections(state.featureId)
  const fueraDeAlcanceBlock = specSections.fueraDeAlcance
    ? `\nFUERA DE ALCANCE (no implementar):\n${specSections.fueraDeAlcance}\n`
    : ''
  const restriccionesBlock = specSections.restriccionesClave
    ? `\nRESTRICCIONES CLAVE:\n${specSections.restriccionesClave}\n`
    : ''

  const prompt = `Sos un Code Reviewer independiente revisando el diff de un step antes de commitear.

STEP A REVISAR (${state.featureId} / step ${step.id}):
${step.desc}
${fueraDeAlcanceBlock}${restriccionesBlock}
RESTRICCIONES ABSOLUTAS DEL DOMINIO (nunca deben violarse):
- La TNA/tasa NUNCA debe mostrarse en vistas de prestatario
- Columnas en camelCase sin @map en Prisma
- No tocar archivos de mutuo/pagaré
- No correr prisma migrate/db push

DIFF:
\`\`\`diff
${diff}${truncationNote}
\`\`\`

Evaluá el diff en base a estos criterios:
1. ¿El cambio hace exactamente lo que dice el step, ni más ni menos (scope creep)?
2. ¿Viola alguna restricción del spec o regla de dominio conocida?
3. ¿Hay un error de lógica evidente que typecheck/tests no van a agarrar (condición invertida, off-by-one, null no manejado)?
4. ¿Calidad mínima: nombres claros, sin duplicación obvia, sin dead code dejado por error?

IMPORTANTE: El typecheck, lint y tests ya pasaron. Solo revisás lo que esas herramientas no pueden detectar: scope, dominio, lógica, calidad.

Respondé ÚNICAMENTE en uno de estos dos formatos exactos (sin texto extra antes ni después):

Si aprobás:
REVIEW: APPROVED

Si pedís cambios:
REVIEW: CHANGES_REQUESTED
- <issue 1>
- <issue 2>`

  const invoke = opts?.callClaude ?? ((p: string) => defaultCallClaude(p, root))
  const raw = await invoke(prompt)
  return parseReviewOutput(raw)
}

export function parseReviewOutput(raw: string): ReviewResult {
  const text = raw.trim()

  if (text.startsWith('REVIEW: APPROVED')) {
    return { approved: true, feedback: '' }
  }

  const changesMatch = /^REVIEW: CHANGES_REQUESTED\n([\s\S]*)$/.exec(text)
  if (changesMatch) {
    return { approved: false, feedback: changesMatch[1].trim() }
  }

  // Fail-safe: unrecognized format → don't approve silently
  return { approved: false, feedback: text }
}

async function defaultCallClaude(prompt: string, repoRoot: string): Promise<string> {
  const result = await execa('claude', [
    '--model', MODEL_REVIEWER,
    '--max-turns', String(MAX_TURNS),
    '--output-format', 'text',
    '--dangerously-skip-permissions',
    '--allowedTools', '',
    '--strict-mcp-config',
    '-p', prompt,
  ], {
    cwd: repoRoot,
    reject: false,
    stdin: 'ignore',
    all: true,
  })

  if (result.exitCode !== 0) {
    throw new Error(`Reviewer (Claude) falló con código ${result.exitCode}:\n${result.all ?? result.stderr}`)
  }

  return result.all ?? result.stdout ?? ''
}
