import { readFileSync, writeFileSync, existsSync } from 'fs'
import { z } from 'zod'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const STATE_PATH = path.join(__dirname, '..', 'STATE.json')

export const StepStatus = z.enum(['pending', 'running', 'done', 'blocked', 'needs_human'])

export const StepSchema = z.object({
  id: z.number(),
  desc: z.string(),
  status: StepStatus,
  commit: z.string().nullable(),
  sessionId: z.string().nullable(),
  retries: z.number().default(0),
  ui: z.boolean().default(false),
  error: z.string().nullable().optional(),
})

export const StateSchema = z.object({
  featureId: z.string(),
  branch: z.string(),
  steps: z.array(StepSchema),
  pausedUntil: z.string().nullable(),
  needsHumanApproval: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type Step = z.infer<typeof StepSchema>
export type OrchestratorState = z.infer<typeof StateSchema>

export function loadState(): OrchestratorState | null {
  if (!existsSync(STATE_PATH)) return null
  const raw = readFileSync(STATE_PATH, 'utf-8')
  const parsed = StateSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    console.error('[state] STATE.json inválido:', parsed.error.message)
    return null
  }
  return parsed.data
}

export function saveState(state: OrchestratorState): void {
  state.updatedAt = new Date().toISOString()
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8')
}

export function initState(featureId: string, branch: string, steps: Omit<Step, 'commit' | 'sessionId' | 'retries' | 'status'>[]): OrchestratorState {
  const now = new Date().toISOString()
  const state: OrchestratorState = {
    featureId,
    branch,
    steps: steps.map((s, i) => ({
      ...s,
      id: i + 1,
      status: 'pending',
      commit: null,
      sessionId: null,
      retries: 0,
    })),
    pausedUntil: null,
    needsHumanApproval: null,
    createdAt: now,
    updatedAt: now,
  }
  saveState(state)
  return state
}

export function markStepStatus(state: OrchestratorState, stepId: number, status: Step['status'], extra?: Partial<Step>): void {
  const step = state.steps.find(s => s.id === stepId)
  if (!step) throw new Error(`Step ${stepId} not found`)
  Object.assign(step, { status, ...extra })
  saveState(state)
}

export function getNextPendingStep(state: OrchestratorState): Step | null {
  return state.steps.find(s => s.status !== 'done') ?? null
}
