import { execa } from 'execa'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { log } from './limits.js'
import { type OrchestratorState, type Step } from './state.js'
import { getRepoRoot, getActiveTargetName, getTargetConfig } from './targets.js'
import { getDbEnvOverride } from './db-guard.js'
import { loadSpecSections, RESTRICCIONES_ABSOLUTAS } from './executor.js'
import { parseAdrBlocks, type AdrDraft } from './adr.js'
import { MODEL_FIXER } from './models.js'
import { parseClaudeJson, recordInvocation } from './metrics.js'
import { runVerifier, type VerifyResult } from './verifier.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGS_DIR = path.join(__dirname, '..', 'logs')

// Presupuesto propio del fixer: última instancia antes de bloquear, no un loop paralelo
// de reintentos infinito como el del builder normal (MAX_RETRIES en executor.ts).
export const MAX_FIXER_ATTEMPTS = 2

export interface EscalationResult {
  ok: boolean
  sessionId: string | null
  adrBlocks: AdrDraft[]
  finalError?: string
}

function summarizeFailureHistory(failureHistory: string[]): string {
  if (!failureHistory.length) return '(sin historial detallado disponible — usá el motivo de arriba)'
  return failureHistory.map((entry, i) => `intento ${i + 1}: ${entry}`).join('\n\n')
}

function buildFixerPrompt(
  step: Step,
  featureId: string,
  specSections: { fueraDeAlcance: string; restriccionesClave: string },
  failureHistory: string[],
): string {
  const targetName = getActiveTargetName()
  const stack = getTargetConfig().stack

  const alcanceBlock = specSections.fueraDeAlcance
    ? `\nFUERA DE ALCANCE (no hacer):\n${specSections.fueraDeAlcance}\n`
    : ''
  const restriccionesBlock = specSections.restriccionesClave
    ? `\nRESTRICCIONES CLAVE (no romper):\n${specSections.restriccionesClave}\n`
    : ''

  return `Sos un agente de código senior escalado para resolver el step ${step.id} del feature ${featureId} en el repo "${targetName}" (stack: ${stack}), después de que el builder normal (un modelo más chico) falló repetidamente con el mismo enfoque.

TAREA ORIGINAL: ${step.desc}
${alcanceBlock}${restriccionesBlock}
HISTORIAL COMPLETO DE FALLOS (builder/verifier/QA/reviewer, en orden cronológico):
${summarizeFailureHistory(failureHistory)}

${RESTRICCIONES_ABSOLUTAS}

IMPORTANTE: los intentos anteriores ya fallaron repitiendo variantes del mismo enfoque. Antes de tocar código, diagnosticá la CAUSA RAÍZ del fallo repetido — si el enfoque anterior era conceptualmente incorrecto, cambialo; no repitas lo mismo esperando un resultado distinto.

Implementá el fix mínimo necesario. Al terminar verificá que typecheque con npx tsc --noEmit.

ADR: Si tomaste una decisión de diseño no trivial para resolver esto, emití al final de tu respuesta un bloque con el siguiente formato exacto:
===ADR===
target: <nombre del target, ej: kredy>
origen: <Instrucción de Augusto | Supuesto del agente>
titulo: <título corto>
decision: <qué se decidió, 1-2 frases>
contexto: <por qué surgió>
alternativas: <qué se descartó, o "ninguna">
consecuencias: <qué queda abierto, o "ninguna">
===END ADR===
Escribí el ADR SIEMPRE en español. Si el fix fue mecánico y no ameritó ninguna decisión, no emitas ningún bloque.`
}

export interface FixerInvocationResult {
  ok: boolean
  sessionId: string | null
  output: string
  adrBlocks: AdrDraft[]
}

export interface EscalationOpts {
  /** Injectable for tests: replaces the `claude` execa invocation. */
  invokeFixerFn?: (prompt: string, step: Step, state: OrchestratorState, fixerSessionId: string | null) => Promise<FixerInvocationResult>
  /** Injectable for tests: replaces the verifier run after each fixer attempt. */
  runVerifierFn?: () => Promise<VerifyResult>
}

async function invokeFixer(
  prompt: string,
  step: Step,
  state: OrchestratorState,
  fixerSessionId: string | null,
): Promise<FixerInvocationResult> {
  const args = [
    '--model', MODEL_FIXER,
    '--output-format', 'json',
    '--dangerously-skip-permissions',
    '--allowedTools', 'Read,Edit,Write,Bash,Glob,Grep',
    '--strict-mcp-config',
    '-p', prompt,
  ]

  if (fixerSessionId) {
    args.push('--resume', fixerSessionId)
    log(`[escalation] Resumiendo sesión del fixer ${fixerSessionId} para step ${step.id}`)
  } else {
    log(`[escalation] Iniciando sesión nueva del fixer (Opus) para step ${step.id} — sin resumir la sesión trabada del builder`)
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

  mkdirSync(LOGS_DIR, { recursive: true })
  const logPath = path.join(LOGS_DIR, `${state.featureId}-step${step.id}-fixer.log`)
  writeFileSync(logPath, output, 'utf-8')
  log(`[escalation] Log del fixer en: ${logPath}`)

  const { text, parsed } = parseClaudeJson(result.stdout ?? '')
  const sessionId = parsed?.session_id ?? fixerSessionId ?? null

  try {
    recordInvocation({
      featureId: state.featureId,
      stepId: step.id,
      role: 'fixer',
      model: MODEL_FIXER,
      inputTokens: parsed?.usage?.input_tokens ?? 0,
      outputTokens: parsed?.usage?.output_tokens ?? 0,
      costUsd: parsed?.total_cost_usd ?? 0,
      durationMs: parsed?.duration_ms ?? (Date.now() - startMs),
      exitCode: result.exitCode ?? 0,
    })
  } catch { /* métricas nunca tumban el pipeline */ }

  if (result.exitCode !== 0) {
    log(`[escalation] Fixer (Opus) salió con código ${result.exitCode} para step ${step.id}`)
    return { ok: false, sessionId, output, adrBlocks: [] }
  }

  return { ok: true, sessionId, output, adrBlocks: parseAdrBlocks(text || output) }
}

/**
 * Escalación de último recurso (S-039): cuando un step se trabó 3 veces con el builder
 * normal (MODEL_BUILDER), le da una sesión fresca a un modelo más capaz (MODEL_FIXER,
 * Opus) con el historial completo de fallos, para que diagnostique la causa raíz en vez
 * de repetir el mismo enfoque. Corre el verifier después de cada intento exitoso del
 * fixer — nunca se saltea esa verificación solo porque el modelo es más caro/confiable.
 */
export async function escalateStep(
  step: Step,
  state: OrchestratorState,
  failureHistory: string[],
  opts?: EscalationOpts,
): Promise<EscalationResult> {
  const specSections = loadSpecSections(state.featureId)
  const prompt = buildFixerPrompt(step, state.featureId, specSections, failureHistory)
  const invoke = opts?.invokeFixerFn ?? invokeFixer
  const verifyFn = opts?.runVerifierFn ?? runVerifier

  let fixerSessionId: string | null = null
  let lastDetail = ''

  for (let attempt = 0; attempt < MAX_FIXER_ATTEMPTS; attempt++) {
    log(`[escalation] Step ${step.id}: intento ${attempt + 1}/${MAX_FIXER_ATTEMPTS} del fixer (Opus)`)
    const invoked = await invoke(prompt, step, state, fixerSessionId)
    fixerSessionId = invoked.sessionId

    if (!invoked.ok) {
      lastDetail = invoked.output.slice(-1000)
      log(`[escalation] Fixer falló en el intento ${attempt + 1} para step ${step.id}`)
      continue
    }

    const verify = await verifyFn()
    if (verify.ok) {
      log(`[escalation] Fixer (Opus) resolvió el step ${step.id} y pasó verifier`)
      return { ok: true, sessionId: fixerSessionId, adrBlocks: invoked.adrBlocks }
    }

    lastDetail = verify.errors.slice(-1000)
    log(`[escalation] Fixer corrigió pero verifier sigue fallando en el intento ${attempt + 1} para step ${step.id}`)
  }

  return {
    ok: false,
    sessionId: fixerSessionId,
    adrBlocks: [],
    finalError: `Fixer (Opus) agotó ${MAX_FIXER_ATTEMPTS} intento(s) sin pasar verifier.\nÚltimo detalle:\n${lastDetail}`,
  }
}
