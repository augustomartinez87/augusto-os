import { execa } from 'execa'
import { log, UsageLimitError, isUsageLimitError, handleUsageLimit, type ProbeOpts } from './limits.js'
import { type OrchestratorState, type Step } from './state.js'
import { getRepoRoot, getTargetConfig } from './targets.js'
import { loadSpecSections, buildRestriccionesAbsolutas } from './executor.js'
import { MODEL_REVIEWER, MAX_TURNS } from './models.js'
import { parseClaudeJson, recordInvocation } from './metrics.js'

export interface ReviewResult {
  approved: boolean
  feedback: string
}

export interface ReviewerOpts {
  callClaude?: (prompt: string) => Promise<string>
  repoRoot?: string
  usageLimitOpts?: ProbeOpts
}

const DIFF_MAX_CHARS = 8000

export async function runReviewer(
  step: Step,
  state: OrchestratorState,
  opts?: ReviewerOpts,
): Promise<ReviewResult> {
  const root = opts?.repoRoot ?? getRepoRoot()

  // Register new untracked files with intent-to-add so `git diff HEAD` shows their content.
  // Respects .gitignore via --exclude-standard; does not stage content.
  const lsResult = await execa('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: root,
    reject: false,
  })
  const newFiles = (lsResult.stdout ?? '').split('\n')
    .filter(f => f.trim().length > 0)
    .filter(f => f !== 'system/DECISIONS.md' && f !== 'system/PROGRESS.md')
  if (newFiles.length > 0) {
    log(`[reviewer] ${newFiles.length} archivo(s) nuevo(s) incluidos en el diff`)
    await execa('git', ['add', '-N', '--', '.', ':(exclude)system/DECISIONS.md', ':(exclude)system/PROGRESS.md'], {
      cwd: root,
      reject: false,
    })
  }

  const diffResult = await execa('git', ['diff', 'HEAD', '--', '.', ':(exclude)system/DECISIONS.md', ':(exclude)system/PROGRESS.md'], {
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
${buildRestriccionesAbsolutas(getTargetConfig().dbModel)}

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

  const invoke = opts?.callClaude ?? ((p: string) => defaultCallClaude(p, root, state.featureId))
  while (true) {
    try {
      const raw = await invoke(prompt)
      return parseReviewOutput(raw)
    } catch (err) {
      if (err instanceof UsageLimitError) {
        log(`[reviewer] Límite de uso alcanzado en step ${step.id} — esperando disponibilidad`)
        await handleUsageLimit(err.output, state, opts?.usageLimitOpts)
      } else {
        throw err
      }
    }
  }
}

export function parseReviewOutput(raw: string): ReviewResult {
  const text = raw.trim()

  // Primary: starts with the verdict (model followed instructions)
  if (text.startsWith('REVIEW: APPROVED')) {
    return { approved: true, feedback: '' }
  }

  // Fallback: model added preamble before the verdict — check last non-empty line
  const lastLine = text.split('\n').filter(l => l.trim()).pop()?.trim() ?? ''
  if (lastLine === 'REVIEW: APPROVED') {
    return { approved: true, feedback: '' }
  }

  const changesMatch = /^REVIEW: CHANGES_REQUESTED\n([\s\S]*)$/.exec(text)
  if (changesMatch) {
    return { approved: false, feedback: changesMatch[1].trim() }
  }

  // Fallback: CHANGES_REQUESTED with preamble
  if (text.includes('REVIEW: CHANGES_REQUESTED')) {
    const after = text.split('REVIEW: CHANGES_REQUESTED').pop()?.trim() ?? ''
    return { approved: false, feedback: after || text }
  }

  // Fail-safe: unrecognized format → don't approve silently
  return { approved: false, feedback: text }
}

async function defaultCallClaude(prompt: string, repoRoot: string, featureId: string): Promise<string> {
  const startMs = Date.now()
  const result = await execa('claude', [
    '--model', MODEL_REVIEWER,
    '--max-turns', String(MAX_TURNS),
    '--output-format', 'json',
    '--dangerously-skip-permissions',
    '--allowedTools', '',
    '--strict-mcp-config',
    '-p',
  ], {
    cwd: repoRoot,
    reject: false,
    input: prompt,
    all: true,
  })

  const { text, parsed } = parseClaudeJson(result.stdout ?? result.all ?? '')
  try {
    recordInvocation({
      featureId,
      role: 'reviewer',
      model: MODEL_REVIEWER,
      inputTokens: parsed?.usage?.input_tokens ?? 0,
      outputTokens: parsed?.usage?.output_tokens ?? 0,
      costUsd: parsed?.total_cost_usd ?? 0,
      durationMs: parsed?.duration_ms ?? (Date.now() - startMs),
      exitCode: result.exitCode ?? 0,
    })
  } catch { /* métricas nunca tumban el pipeline */ }

  if (isUsageLimitError(result.all ?? '') || result.exitCode === 429) {
    throw new UsageLimitError(result.all ?? result.stderr ?? '')
  }

  if (result.exitCode !== 0) {
    throw new Error(`Reviewer (Claude) falló con código ${result.exitCode}:\n${result.all ?? result.stderr}`)
  }

  return text
}
