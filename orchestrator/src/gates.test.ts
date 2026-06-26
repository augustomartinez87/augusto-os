import { describe, it, expect } from 'vitest'
import { checkHumanGate } from './gates.js'

describe('checkHumanGate', () => {
  // ── commands that MUST be blocked ──────────────────────────────────────────

  it('blocks prisma migrate dev', () => {
    expect(checkHumanGate('npx prisma migrate dev').blocked).toBe(true)
  })

  it('blocks prisma migrate reset', () => {
    expect(checkHumanGate('prisma migrate reset').blocked).toBe(true)
  })

  it('blocks prisma db push', () => {
    expect(checkHumanGate('npx prisma db push').blocked).toBe(true)
  })

  it('blocks vercel deploy', () => {
    expect(checkHumanGate('vercel deploy --prod').blocked).toBe(true)
  })

  it('blocks bare vercel command', () => {
    expect(checkHumanGate('vercel').blocked).toBe(true)
  })

  it('blocks DROP TABLE', () => {
    expect(checkHumanGate('DROP TABLE users;').blocked).toBe(true)
  })

  it('blocks TRUNCATE', () => {
    expect(checkHumanGate('TRUNCATE loans;').blocked).toBe(true)
  })

  it('blocks git push to main', () => {
    expect(checkHumanGate('git push origin main').blocked).toBe(true)
  })

  it('blocks git push main shorthand', () => {
    expect(checkHumanGate('git push main').blocked).toBe(true)
  })

  it('blocks commands mentioning mutuo', () => {
    const r = checkHumanGate('node generate-mutuo.js')
    expect(r.blocked).toBe(true)
    expect(r.label).toBe('mutuo-pagare')
  })

  it('blocks commands mentioning pagaré', () => {
    const r = checkHumanGate('open pagaré.docx')
    expect(r.blocked).toBe(true)
    expect(r.label).toBe('mutuo-pagare')
  })

  it('blocks commands mentioning pagare (sin tilde)', () => {
    expect(checkHumanGate('node pagare.js').blocked).toBe(true)
  })

  // ── commands that must NOT be blocked ─────────────────────────────────────

  it('does not block prisma migrate status', () => {
    expect(checkHumanGate('npx prisma migrate status').blocked).toBe(false)
  })

  it('does not block tsc --noEmit', () => {
    expect(checkHumanGate('tsc --noEmit').blocked).toBe(false)
  })

  it('does not block git push to a feature branch', () => {
    expect(checkHumanGate('git push origin feat/F-0001-my-feature').blocked).toBe(false)
  })

  it('does not block npm test', () => {
    expect(checkHumanGate('npm test').blocked).toBe(false)
  })

  it('does not block reading the schema', () => {
    expect(checkHumanGate('cat prisma/schema.prisma').blocked).toBe(false)
  })
})
