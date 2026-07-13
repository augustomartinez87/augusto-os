import { execa } from 'execa'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { log, isUsageLimitError, isContextWindowError, handleUsageLimit, exponentialBackoff } from './limits.js'
import { type OrchestratorState, type Step } from './state.js'
import { getRepoRoot, getActiveTargetName, getTargetConfig } from './targets.js'
import { getDbEnvOverride } from './db-guard.js'
import { parseAdrBlocks, type AdrDraft } from './adr.js'
import { MODEL_BUILDER } from './models.js'
import { parseClaudeJson, recordInvocation } from './metrics.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGS_DIR = path.join(__dirname, '..', 'logs')
const FEATURES_DIR = path.join(__dirname, '..', 'features')

function extractSection(md: string, heading: string): string {
  const idx = md.indexOf(`## ${heading}`)
  if (idx === -1) return ''
  const after = md.slice(idx + `## ${heading}`.length)
  const nextHeading = after.search(/^## /m)
  return (nextHeading === -1 ? after : after.slice(0, nextHeading)).trim()
}

export function loadSpecSections(featureId: string): { fueraDeAlcance: string; restriccionesClave: string } {
  const specPath = path.join(FEATURES_DIR, `${featureId}.md`)
  if (!existsSync(specPath)) return { fueraDeAlcance: '', restriccionesClave: '' }
  const md = readFileSync(specPath, 'utf-8')
  return {
    fueraDeAlcance: extractSection(md, 'Fuera de alcance'),
    restriccionesClave: extractSection(md, 'Restricciones clave'),
  }
}

export const MAX_RETRIES = 3

export interface ExecutorResult {
  ok: boolean
  sessionId: string | null
  output: string
  usageLimit: boolean
  contextFull: boolean
  adrBlocks: AdrDraft[]
}

function buildPrompt(
  step: Step,
  featureId: string,
  specSections: { fueraDeAlcance: string; restriccionesClave: string },
  priorError?: string,
  research?: string,
): string {
  const targetName = getActiveTargetName()
  const stack = getTargetConfig().stack

  const alcanceBlock = specSections.fueraDeAlcance
    ? `\nFUERA DE ALCANCE (no hacer):\n${specSections.fueraDeAlcance}\n`
    : ''
  const restriccionesBlock = specSections.restriccionesClave
    ? `\nRESTRICCIONES CLAVE (no romper):\n${specSections.restriccionesClave}\n`
    : ''
  const researchBlock = research
    ? `\n## Investigación del repo (evidencia verificada contra filesystem)\n${research}\n\nNO explores el repo para redescubrir esto; estas rutas están verificadas. Preferí Grep/Glob sobre Read completo para lo que falte.\n`
    : ''

  const base = `Sos un agente de código implementando el step ${step.id} del feature ${featureId} en el repo "${targetName}" (stack: ${stack}).

TAREA: ${step.desc}
${alcanceBlock}${restriccionesBlock}${researchBlock}
RESTRICCIONES ABSOLUTAS:
- NO corras "prisma migrate", "prisma db push", ni SQL destructivo.
- NO deployés a Vercel.
- NO toques main branch ni archivos de mutuo/pagaré.
- La TNA/tasa NUNCA debe mostrarse en vistas de prestatario.
- Columnas en camelCase sin @map en Prisma.
- Para conocer modelos y campos del schema, leé prisma/schema.prisma del repo. NUNCA consultes la DB en vivo (DATABASE_URL apunta a producción directamente).

Implementá el cambio mínimo necesario. Al terminar verificá que typecheque con npx tsc --noEmit.

ADR: Si durante este step tomaste una **decisión de diseño no trivial** (elegiste entre enfoques, introdujiste o rompiste una convención, o **asumiste algo que el spec no especifica** y que cambiaría el resultado si fuera distinto), emití al final de tu respuesta un bloque con el siguiente formato exacto:
===ADR===
target: <nombre del target, ej: kredy>
origen: <Instrucción de Augusto | Supuesto del agente>
titulo: <título corto>
decision: <qué se decidió, 1-2 frases>
contexto: <por qué surgió>
alternativas: <qué se descartó, o "ninguna">
consecuencias: <qué queda abierto, o "ninguna">
===END ADR===
Escribí el ADR SIEMPRE en español, independientemente del idioma del código del repo.
Clasificá origen: "Instrucción de Augusto" si la decisión deriva del spec del feature o de una orden explícita; "Supuesto del agente" si la elegiste por criterio propio. Steps mecánicos (rename, fix de typecheck, cambios obvios) NO generan ADR — en ese caso no emitas ningún bloque.`

  if (priorError) {
    return `${base}

CORRECCIÓN REQUERIDA — el intento anterior falló con:
${priorError}

Analizá el error y aplicá la corrección.`
  }

  return base
}

function writeStepLog(featureId: string, stepId: number, output: string): string {
  mkdirSync(LOGS_DIR, { recursive: true })
  const logPath = path.join(LOGS_DIR, `${featureId}-step${stepId}.log`)
  writeFileSync(logPath, output, 'utf-8')
  return logPath
}

function printLastLines(output: string, n = 20): void {
  const lines = output.split('\n').filter(l => l.trim())
  const tail = lines.slice(-n)
  log(`[executor:error] — últimas ${tail.length} líneas de salida:`)
  tail.forEach(line => console.log(`  ${line}`))
}

export async function executeStep(
  step: Step,
  state: OrchestratorState,
  priorError?: string,
  research?: string,
): Promise<ExecutorResult> {
  // Load research from disk when not provided — ensures retries and fresh sessions always have context
  let effectiveResearch = research
  if (!effectiveResearch) {
    const researchPath = path.join(FEATURES_DIR, `${state.featureId}.research.md`)
    if (existsSync(researchPath)) {
      try { effectiveResearch = readFileSync(researchPath, 'utf-8') } catch { /* non-fatal */ }
    }
  }
  const specSections = loadSpecSections(state.featureId)
  const prompt = buildPrompt(step, state.featureId, specSections, priorError, effectiveResearch)

  const args = [
    '--model', MODEL_BUILDER,
    '--output-format', 'json',
    '--dangerously-skip-permissions',
    '--allowedTools', 'Read,Edit,Write,Bash,Glob,Grep',
    '--strict-mcp-config',
    '-p', prompt,
  ]

  if (step.sessionId) {
    args.push('--resume', step.sessionId)
    log(`[executor] Resumiendo sesión ${step.sessionId} para step ${step.id}`)
  } else {
    log(`[executor] Iniciando sesión nueva para step ${step.id}: ${step.desc}`)
  }

  const startMs = Date.now()
  const result = await execa('claude', args, {
    cwd: getRepoRoot(),
    reject: false,
    all: true,
    stdin: 'ignore',
    env: { ...process.env, ...getDbEnvOverride() },
  })

  const output = result.all ?? result.stdout ?? ''

  const logPath = writeStepLog(state.featureId, step.id, output)
  log(`[executor] Log completo en: ${logPath}`)

  // Extract session_id from JSON (primary) then fall back to regex on all output
  let sessionId: string | null = null
  const { text, parsed } = parseClaudeJson(result.stdout ?? '')
  if (parsed?.session_id) {
    sessionId = parsed.session_id
  } else {
    const sessionMatch = output.match(/session[_-]?id[:\s]+([a-z0-9-]+)/i)
    sessionId = sessionMatch?.[1] ?? null
  }
  sessionId = sessionId ?? step.sessionId ?? null

  try {
    recordInvocation({
      featureId: state.featureId,
      stepId: step.id,
      role: 'executor',
      model: MODEL_BUILDER,
      inputTokens: parsed?.usage?.input_tokens ?? 0,
      outputTokens: parsed?.usage?.output_tokens ?? 0,
      costUsd: parsed?.total_cost_usd ?? 0,
      durationMs: parsed?.duration_ms ?? (Date.now() - startMs),
      exitCode: result.exitCode ?? 0,
    })
  } catch { /* métricas nunca tumban el pipeline */ }

  if (isUsageLimitError(output) || result.exitCode === 429) {
    log('[executor] Usage limit detectado')
    return { ok: false, sessionId, output, usageLimit: true, contextFull: false, adrBlocks: [] }
  }

  if (isContextWindowError(output)) {
    log('[executor] Context window lleno — arrancar sesión fresca')
    return { ok: false, sessionId: null, output, usageLimit: false, contextFull: true, adrBlocks: [] }
  }

  if (result.exitCode !== 0) {
    log(`[executor] claude salió con código ${result.exitCode} — ver log completo: ${logPath}`)
    printLastLines(output)
    return { ok: false, sessionId, output, usageLimit: false, contextFull: false, adrBlocks: [] }
  }

  return { ok: true, sessionId, output, usageLimit: false, contextFull: false, adrBlocks: parseAdrBlocks(text || output) }
}

export async function executeStepWithRetry(
  step: Step,
  state: OrchestratorState,
  onVerifyFail: (errors: string) => string,
  research?: string,
): Promise<{ ok: boolean; sessionId: string | null; finalError?: string; adrBlocks: AdrDraft[] }> {
  let priorError: string | undefined
  let sessionId = step.sessionId

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result = await executeStep({ ...step, sessionId }, state, priorError, research)
    sessionId = result.sessionId

    if (result.usageLimit) {
      await handleUsageLimit(result.output, state)
      attempt--
      continue
    }

    if (!result.ok && !result.contextFull) {
      priorError = result.output.slice(-2000)
      await exponentialBackoff(attempt)
      continue
    }

    if (result.ok) {
      return { ok: true, sessionId, adrBlocks: result.adrBlocks }
    }

    if (result.contextFull) {
      sessionId = null
      priorError = `Context window lleno. Continuá implementando: ${step.desc}`
    }
  }

  return { ok: false, sessionId, finalError: priorError, adrBlocks: [] }
}
