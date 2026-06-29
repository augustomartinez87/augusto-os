import { describe, it, expect, vi } from 'vitest'
import { MAX_TURNS } from './models.js'

vi.mock('./targets.js', () => ({
  getActiveTargetName: () => 'argos',
  getTargetConfig: () => ({ stack: 'vite+supabase', path: '/fake', dbModel: 'none' }),
  getRepoRoot: () => '/fake',
}))

vi.mock('./db-guard.js', () => ({
  getDbEnvOverride: () => ({}),
}))

const { planFeature } = await import('./planner.js')

const VALID_JSON_RESPONSE = JSON.stringify({
  steps: [
    { desc: 'Agregar columna fee_rate en orch_backlog', ui: false },
    { desc: 'Mostrar fee_rate en la vista de detalle', ui: true },
  ],
})

// ── MAX_TURNS sanity check ─────────────────────────────────────────────────────

describe('MAX_TURNS', () => {
  it('is at least 10 so a tool_use on turn 1 does not cut the loop', () => {
    expect(MAX_TURNS).toBeGreaterThanOrEqual(10)
  })
})

// ── planFeature with injectable callClaude ────────────────────────────────────

describe('planFeature', () => {
  it('returns parsed steps when callClaude returns valid JSON', async () => {
    const callClaude = vi.fn().mockResolvedValue(VALID_JSON_RESPONSE)

    const steps = await planFeature('## Spec de feature\n...', { callClaude })

    expect(steps).toHaveLength(2)
    expect(steps[0]).toMatchObject({ id: 1, desc: 'Agregar columna fee_rate en orch_backlog', ui: false })
    expect(steps[1]).toMatchObject({ id: 2, desc: 'Mostrar fee_rate en la vista de detalle', ui: true })
    expect(callClaude).toHaveBeenCalledOnce()
  })

  it('passes the feature spec text in the prompt', async () => {
    let capturedPrompt = ''
    const callClaude = vi.fn().mockImplementation(async (p: string) => {
      capturedPrompt = p
      return VALID_JSON_RESPONSE
    })

    await planFeature('SPEC TEXTO ÚNICO', { callClaude })

    expect(capturedPrompt).toContain('SPEC TEXTO ÚNICO')
  })

  it('throws when callClaude throws (propagates Reached max turns scenario)', async () => {
    const callClaude = vi.fn().mockRejectedValue(
      new Error('Planner (Claude) falló con código 1:\n[stderr]\nReached max turns (1)\n[stdout]\n(vacío)')
    )

    await expect(planFeature('spec', { callClaude })).rejects.toThrow('Reached max turns')
  })

  it('throws when callClaude returns no JSON', async () => {
    const callClaude = vi.fn().mockResolvedValue('solo texto sin JSON')

    await expect(planFeature('spec', { callClaude })).rejects.toThrow('JSON válido')
  })

  it('throws when callClaude returns invalid JSON schema', async () => {
    const callClaude = vi.fn().mockResolvedValue('{ "pasos": [] }')

    await expect(planFeature('spec', { callClaude })).rejects.toThrow('JSON del planner inválido')
  })

  it('assigns sequential ids starting from 1', async () => {
    const callClaude = vi.fn().mockResolvedValue(
      JSON.stringify({ steps: [{ desc: 'A', ui: false }, { desc: 'B', ui: false }, { desc: 'C', ui: true }] })
    )

    const steps = await planFeature('spec', { callClaude })

    expect(steps.map(s => s.id)).toEqual([1, 2, 3])
  })
})
