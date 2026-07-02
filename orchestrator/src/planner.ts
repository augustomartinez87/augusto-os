import { execa } from 'execa'
import { readFileSync } from 'fs'
import path from 'path'
import { z } from 'zod'
import { log } from './limits.js'
import { getRepoRoot, getActiveTargetName, getTargetConfig } from './targets.js'
import { getDbEnvOverride } from './db-guard.js'
import { fileURLToPath } from 'url'
import { MODEL_PLANNER, MAX_TURNS } from './models.js'
import { parseClaudeJson, recordInvocation } from './metrics.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface PlanStep {
  id: number
  desc: string
  ui: boolean
}

const PlanSchema = z.object({
  steps: z.array(z.object({
    desc: z.string(),
    ui: z.boolean().default(false),
  }))
})

async function defaultCallClaude(prompt: string, featureId: string): Promise<string> {
  const startMs = Date.now()
  const result = await execa('claude', [
    '--model', MODEL_PLANNER,
    '--max-turns', String(MAX_TURNS),
    '--output-format', 'json',
    '--dangerously-skip-permissions',
    '--strict-mcp-config',
    '-p', prompt,
  ], {
    cwd: getRepoRoot(),
    reject: false,
    stdin: 'ignore',
    env: { ...process.env, ...getDbEnvOverride() },
  })

  const { text, parsed } = parseClaudeJson(result.stdout ?? '')
  try {
    recordInvocation({
      featureId,
      role: 'planner',
      model: MODEL_PLANNER,
      inputTokens: parsed?.usage?.input_tokens ?? 0,
      outputTokens: parsed?.usage?.output_tokens ?? 0,
      costUsd: parsed?.total_cost_usd ?? 0,
      durationMs: parsed?.duration_ms ?? (Date.now() - startMs),
      exitCode: result.exitCode ?? 0,
    })
  } catch { /* métricas nunca tumban el pipeline */ }

  if (result.exitCode !== 0) {
    throw new Error(`Planner (Claude) falló con código ${result.exitCode}:\n[stderr]\n${result.stderr || '(vacío)'}\n[stdout]\n${result.stdout || '(vacío)'}`)
  }

  return text
}

export interface PlannerOpts {
  callClaude?: (prompt: string) => Promise<string>
  research?: string
}

export async function planFeature(featureMd: string, opts?: PlannerOpts): Promise<PlanStep[]> {
  log('[planner] Invocando Opus para descomponer feature...')

  const featureIdMatch = featureMd.match(/^id:\s*(F-\d+)/m)
  const featureId = featureIdMatch?.[1] ?? 'unknown'

  const targetName = getActiveTargetName()
  const stack = getTargetConfig().stack

  const researchBlock = opts?.research
    ? `\n## Investigación del repo (evidencia verificada contra filesystem)\n${opts.research}\n\nNO explores el repo para redescubrir esto; estas rutas están verificadas. Preferí Grep/Glob sobre Read completo para lo que falte.\n`
    : ''

  const prompt = `Sos el planner de un orquestador de código. Dada la siguiente spec de feature para el repo "${targetName}" (stack: ${stack}), descomponela en pasos atómicos e implementables por un agente de código.

Reglas:
- Cada paso debe ser implementable de forma independiente y resultar en código que typecheque y pase lint.
- Marcá "ui: true" solo si el paso toca UI que necesita verificación visual (componentes, páginas).
- NO incluyas pasos de migración SQL, deploy a Vercel, ni cambios legales — esos son gate humano.
- Máximo 10 pasos. Mínimo 2.

Respondé SOLO con JSON válido en este formato:
{
  "steps": [
    { "desc": "descripción del paso", "ui": false },
    { "desc": "otro paso", "ui": true }
  ]
}
${researchBlock}
SPEC DEL FEATURE:
${featureMd}`

  const invoke = opts?.callClaude ?? ((p: string) => defaultCallClaude(p, featureId))
  const raw = await invoke(prompt)

  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`Planner no devolvió JSON válido:\n${raw}`)

  const parsed = PlanSchema.safeParse(JSON.parse(jsonMatch[0]))
  if (!parsed.success) throw new Error(`JSON del planner inválido: ${parsed.error.message}`)

  return parsed.data.steps.map((s, i) => ({ id: i + 1, ...s }))
}

export function loadFeatureSpec(featureId: string): string {
  const featureDir = path.join(__dirname, '..', 'features')
  const filePath = path.join(featureDir, `${featureId}.md`)
  return readFileSync(filePath, 'utf-8')
}
