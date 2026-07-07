import { describe, it, expect, vi } from 'vitest'
import { runEvaluate, EvaluateLabel } from './evaluate.js'

const VALID_LABELS = new Set(EvaluateLabel.options)

describe('runEvaluate', () => {
  it('devuelve etiqueta del conjunto cerrado cuando Claude responde con etiqueta válida', async () => {
    const callClaude = vi.fn(async (_: string) =>
      JSON.stringify({ etiqueta: 'IMPLEMENTAR', resumen: 'Vale la pena implementarlo.' })
    )

    const result = await runEvaluate('Un post de X de prueba', { callClaude })

    // callClaude inyectado — defaultCallClaude (execa/red) nunca se invoca
    expect(callClaude).toHaveBeenCalledOnce()
    expect(VALID_LABELS.has(result.etiqueta)).toBe(true)
    expect(result.etiqueta).toBe('IMPLEMENTAR')
    expect(typeof result.resumen).toBe('string')
  })

  it('normaliza a IGNORAR cuando Claude responde con etiqueta fuera del conjunto cerrado', async () => {
    const callClaude = vi.fn(async (_: string) =>
      JSON.stringify({ etiqueta: 'TRENDING', resumen: 'Algo irrelevante.' })
    )

    const result = await runEvaluate('Un post con etiqueta desconocida', { callClaude })

    expect(callClaude).toHaveBeenCalledOnce()
    expect(VALID_LABELS.has(result.etiqueta)).toBe(true)
    expect(result.etiqueta).toBe('IGNORAR')
    expect(typeof result.resumen).toBe('string')
  })
})
