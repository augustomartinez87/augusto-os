import { describe, it, expect } from 'vitest'
import { resolveQaBaseUrl } from './targets.js'

// ── resolveQaBaseUrl (F-0031 / S-037) ─────────────────────────────────────────

describe('resolveQaBaseUrl', () => {
  it('usa el qaBaseUrl del target cuando no hay QA_BASE_URL (caso argos → 5173)', () => {
    expect(resolveQaBaseUrl(undefined, 'http://localhost:5173')).toBe('http://localhost:5173')
  })

  it('QA_BASE_URL gana sobre el valor del target', () => {
    expect(resolveQaBaseUrl('http://localhost:9999', 'http://localhost:5173')).toBe('http://localhost:9999')
  })

  it('qaBaseUrl vacío (caso sistema) → fallback a localhost:3000', () => {
    expect(resolveQaBaseUrl(undefined, '')).toBe('http://localhost:3000')
  })

  it('qaBaseUrl undefined → fallback a localhost:3000', () => {
    expect(resolveQaBaseUrl(undefined, undefined)).toBe('http://localhost:3000')
  })

  it('QA_BASE_URL vacía o solo espacios → no gana, se usa el target', () => {
    expect(resolveQaBaseUrl('', 'http://localhost:5173')).toBe('http://localhost:5173')
    expect(resolveQaBaseUrl('   ', 'http://localhost:5173')).toBe('http://localhost:5173')
  })
})
