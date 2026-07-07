import { execa } from 'execa'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { z } from 'zod'
import { MODEL_ARCHITECT, MAX_TURNS } from './models.js'
import { parseClaudeJson, recordInvocation } from './metrics.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..', '..')

const ARQUITECTURA_PATH = path.join(REPO_ROOT, 'system', 'ARQUITECTURA-ACTUAL.md')
const BACKLOG_PATH = path.join(REPO_ROOT, 'system', 'BACKLOG.md')

const MAX_CONTEXT_CHARS = 8_000

function readContextFile(filePath: string, label: string): string {
  if (!existsSync(filePath)) {
    console.warn(`[evaluate] ${label} no encontrado en ${filePath} — degradando a [no disponible]`)
    return `## ${label}\n[no disponible]`
  }
  const content = readFileSync(filePath, 'utf-8').slice(0, MAX_CONTEXT_CHARS)
  return `## ${label}\n${content}`
}

export function readSystemContext(): string {
  const arquitectura = readContextFile(ARQUITECTURA_PATH, 'ARQUITECTURA-ACTUAL.md')
  const backlog = readContextFile(BACKLOG_PATH, 'BACKLOG.md')
  return `${arquitectura}\n\n${backlog}`
}

export function buildEvaluatePrompt(postText: string, systemContext: string): string {
  return `Sos el Evaluator agent de augusto-os. Tu tarea es evaluar un post de X/Twitter contra la arquitectura real del sistema y decidir si la idea que propone ya existe, vale la pena implementarla, es bait, o debe ignorarse.

## Contexto del sistema
${systemContext}

## Post a evaluar
"${postText}"

## Instrucciones de evaluación

Respondé las tres preguntas siguientes. Sé directo y concreto; 2-3 oraciones por pregunta:

1. **¿Ya está implementado y dónde?** Si la idea (o algo funcionalmente equivalente) ya existe en el orchestrator, indicá exactamente en qué archivo o función. Si no existe, decilo.
2. **¿Vale la pena y qué beneficio concreto trae?** Si no está implementado, evaluá si tiene valor real para el sistema actual. El beneficio debe ser concreto y medible, no abstracto.
3. **¿Es bait y por qué?** Indicá si es una idea que suena bien pero no aplica al contexto real, introduce complejidad innecesaria, o desvía el foco sin beneficio claro.

Respondé SOLO con el siguiente JSON (sin texto antes ni después, sin fences de código):

{
  "etiqueta": "<YA-EXISTE|IMPLEMENTAR|BAIT|IGNORAR>",
  "resumen": "<prosa corta de 2-4 oraciones que condensa las tres respuestas>"
}

Reglas para la etiqueta:
- \`YA-EXISTE\`: la idea o algo funcionalmente equivalente ya está implementada en el sistema.
- \`IMPLEMENTAR\`: no existe aún, tiene valor concreto y vale la pena hacerla.
- \`BAIT\`: suena atractivo pero introduce complejidad innecesaria, no aplica al contexto, o desvía el foco sin beneficio claro.
- \`IGNORAR\`: no aplica al sistema, es irrelevante, o no hay información suficiente para evaluarla.`
}

export const EvaluateLabel = z.enum(['YA-EXISTE', 'IMPLEMENTAR', 'BAIT', 'IGNORAR'])
export type EvaluateLabel = z.infer<typeof EvaluateLabel>

export const EvaluateResultSchema = z.object({
  etiqueta: EvaluateLabel,
  resumen: z.string(),
})
export type EvaluateResult = z.infer<typeof EvaluateResultSchema>

const VALID_LABELS = new Set(EvaluateLabel.options)

export function normalizeLabel(raw: string): EvaluateLabel {
  if (VALID_LABELS.has(raw as EvaluateLabel)) return raw as EvaluateLabel
  return 'IGNORAR'
}

export interface EvaluateOpts {
  callClaude?: (prompt: string) => Promise<string>
}

async function defaultCallClaude(prompt: string): Promise<string> {
  const result = await execa('claude', [
    '--model', MODEL_ARCHITECT,
    '--max-turns', String(MAX_TURNS),
    '--output-format', 'json',
    '--dangerously-skip-permissions',
    '--strict-mcp-config',
    '-p', prompt,
  ], {
    cwd: REPO_ROOT,
    reject: false,
    stdin: 'ignore',
  })

  if (result.exitCode !== 0) {
    throw new Error(`Evaluator (Claude) falló con código ${result.exitCode}:\n[stderr]\n${result.stderr || '(vacío)'}\n[stdout]\n${result.stdout || '(vacío)'}`)
  }

  return result.stdout ?? ''
}

export async function runEvaluate(postText: string, opts?: EvaluateOpts): Promise<EvaluateResult> {
  const callClaude = opts?.callClaude ?? defaultCallClaude
  const systemContext = readSystemContext()
  const prompt = buildEvaluatePrompt(postText, systemContext)

  const startMs = Date.now()
  const raw = await callClaude(prompt)

  const { text, parsed } = parseClaudeJson(raw)

  try {
    recordInvocation({
      featureId: 'evaluate',
      role: 'evaluator',
      model: MODEL_ARCHITECT,
      inputTokens: parsed?.usage?.input_tokens ?? 0,
      outputTokens: parsed?.usage?.output_tokens ?? 0,
      costUsd: parsed?.total_cost_usd ?? 0,
      durationMs: parsed?.duration_ms ?? (Date.now() - startMs),
      exitCode: 0,
    })
  } catch { /* métricas nunca tumban el flujo */ }

  let inner: unknown
  try {
    inner = JSON.parse(text)
  } catch {
    throw new Error(`Evaluator no devolvió JSON válido. Primeros 300 chars:\n${text.slice(0, 300)}`)
  }

  if (typeof inner !== 'object' || inner === null) {
    throw new Error(`Evaluator devolvió un valor no-objeto: ${String(inner).slice(0, 100)}`)
  }

  const obj = inner as Record<string, unknown>
  const withNormalized = {
    ...obj,
    etiqueta: normalizeLabel(String(obj['etiqueta'] ?? '')),
  }

  return EvaluateResultSchema.parse(withNormalized)
}
