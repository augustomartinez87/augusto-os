import { execa } from 'execa'
import { readFileSync } from 'fs'
import path from 'path'
import { z } from 'zod'
import { log } from './limits.js'
import { getRepoRoot, getActiveTargetName, getTargetConfig } from './targets.js'
import { getDbEnvOverride } from './db-guard.js'
import { fileURLToPath } from 'url'
import { MODEL_PLANNER } from './models.js'

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

export async function planFeature(featureMd: string): Promise<PlanStep[]> {
  log('[planner] Invocando Opus para descomponer feature...')

  const targetName = getActiveTargetName()
  const stack = getTargetConfig().stack
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

SPEC DEL FEATURE:
${featureMd}`

  const result = await execa('claude', [
    '--model', MODEL_PLANNER,
    '--max-turns', '1',
    '--output-format', 'text',
    '--dangerously-skip-permissions',
    '--strict-mcp-config',
    '-p', prompt,
  ], {
    cwd: getRepoRoot(),
    reject: false,
    stdin: 'ignore',
    env: { ...process.env, ...getDbEnvOverride() },
  })

  if (result.exitCode !== 0) {
    throw new Error(`Planner falló: ${result.stderr}`)
  }

  const jsonMatch = result.stdout.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`Planner no devolvió JSON válido:\n${result.stdout}`)

  const parsed = PlanSchema.safeParse(JSON.parse(jsonMatch[0]))
  if (!parsed.success) throw new Error(`JSON del planner inválido: ${parsed.error.message}`)

  return parsed.data.steps.map((s, i) => ({ id: i + 1, ...s }))
}

export function loadFeatureSpec(featureId: string): string {
  const featureDir = path.join(__dirname, '..', 'features')
  const filePath = path.join(featureDir, `${featureId}.md`)
  return readFileSync(filePath, 'utf-8')
}
