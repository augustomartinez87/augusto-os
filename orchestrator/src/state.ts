import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs'
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
  adrIds: z.array(z.number()).default([]),
  humanApproved: z.boolean().default(false),
})

export const StateSchema = z.object({
  featureId: z.string(),
  branch: z.string(),
  steps: z.array(StepSchema),
  pausedUntil: z.string().nullable(),
  needsHumanApproval: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // ── Fase de release (post-merge) ──
  merged: z.boolean().default(false),  // branch ya mergeada a main (local)
  pushed: z.boolean().default(false),  // push a main hecho → Vercel deploya solo
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

export function saveState(state: OrchestratorState, statePath = STATE_PATH): void {
  state.updatedAt = new Date().toISOString()
  writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8')
}

export function initState(featureId: string, branch: string, steps: Omit<Step, 'commit' | 'sessionId' | 'retries' | 'status' | 'adrIds' | 'humanApproved'>[]): OrchestratorState {
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
      adrIds: [],
      humanApproved: false,
    })),
    pausedUntil: null,
    needsHumanApproval: null,
    createdAt: now,
    updatedAt: now,
    merged: false,
    pushed: false,
  }
  saveState(state)
  return state
}

export function markStepStatus(state: OrchestratorState, stepId: number, status: Step['status'], extra?: Partial<Step>, statePath = STATE_PATH): void {
  const step = state.steps.find(s => s.id === stepId)
  if (!step) throw new Error(`Step ${stepId} not found`)
  Object.assign(step, { status, ...extra })
  saveState(state, statePath)
}

export function getNextPendingStep(state: OrchestratorState): Step | null {
  const next = state.steps.find(s => s.status !== 'done') ?? null
  // A blocked step requires human intervention — return null so the loop stops
  // cleanly instead of re-executing the step in an inconsistent state.
  if (next?.status === 'blocked') return null
  return next
}

export function getBlockedStep(state: OrchestratorState): Step | null {
  return state.steps.find(s => s.status === 'blocked') ?? null
}

/**
 * Al completar un feature, archiva STATE.json a STATE.<featureId>.archived.json
 * para que el próximo `npm start <otroFeature>` arranque limpio en vez de resumir el viejo.
 */
export function archiveState(featureId: string, statePath = STATE_PATH): void {
  if (!existsSync(statePath)) return
  const archived = path.join(path.dirname(statePath), `STATE.${featureId}.archived.json`)
  renameSync(statePath, archived)
}
