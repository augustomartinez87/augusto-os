import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { updateBacklogStatus } from './backlog.js'

// Filas reales copiadas de system/BACKLOG.md (secciones Sistema y Kredy), tal cual el formato
// de la fecha de este test — ID | P | Descripción | Estado | Ejecutor.
const FIXTURE = `# Backlog — augusto-os

Formato: \`P<n>\` = prioridad (1 = más urgente) · \`[target]\` = repo destino · \`Ejecutor\` = quién ejecuta (ver CONVENTIONS §5)

---

## Sistema (orchestrator / augusto-os)

| ID | P | Descripción | Estado | Ejecutor |
|----|---|-------------|--------|----------|
| S-005 | 5 | Fase 5: Product Analyst (backlog desde métricas de uso real) | pending | cc |
| S-023 | 4 | **Closed learning loop** (idea de Hermes) — cuando el loop resuelve un patrón recurrente, auto-generar un spec/template reutilizable para no re-razonar. Evolución del ADR/specs, en NUESTRO sistema (no adoptar Hermes como motor) | pending | cc |
| S-014 | 2 | **Routing multi-modelo** — Builder barato (DeepSeek V4 vía Claude Code Router) con Opus de Planner; el Verifier cubre el riesgo. Pilot en 1 feature, medir reintentos. Eval en \`system/MODEL-ROUTING.md\` | pending | cc |

## Kredy [kredy]  (préstamos/crédito — ex "Spensiv", renombrado 2026-06-20)

| ID | P | Descripción | Estado | Ejecutor |
|----|---|-------------|--------|----------|
| SP-005 | 3 | Refinanciación Fase 2: UI de propuesta de refinanciación | pending | manual |
| SP-006 | 3 | Refinanciación Fase 3: router refinanceLoan + Prisma RefinancingRequest | pending | manual |
`

describe('updateBacklogStatus', () => {
  let tmpDir: string
  let tmpFile: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'backlog-test-'))
    tmpFile = path.join(tmpDir, 'BACKLOG.md')
    writeFileSync(tmpFile, FIXTURE, 'utf-8')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true })
  })

  it('finds and updates a single row: priority → ✅, Estado rewritten, Descripción intact', () => {
    const result = updateBacklogStatus('F-0099', ['S-005'], '2026-07-27', tmpFile)
    expect(result).toEqual({ updated: ['S-005'], missing: [] })

    const content = readFileSync(tmpFile, 'utf-8')
    const line = content.split('\n').find(l => l.startsWith('| S-005 |'))!
    const cells = line.split('|').map(c => c.trim())
    expect(cells[2]).toBe('✅')
    expect(cells[3]).toBe('Fase 5: Product Analyst (backlog desde métricas de uso real)')
    expect(cells[4]).toBe('done 2026-07-27 (F-0099, orquestador, liberado a prod)')
    expect(cells[5]).toBe('cc')
  })

  it('preserves a Descripción cell with backticks/bold/em-dashes untouched', () => {
    updateBacklogStatus('F-0099', ['S-023'], '2026-07-27', tmpFile)
    const content = readFileSync(tmpFile, 'utf-8')
    const line = content.split('\n').find(l => l.startsWith('| S-023 |'))!
    expect(line).toContain('**Closed learning loop** (idea de Hermes)')
    expect(line).toContain('Evolución del ADR/specs, en NUESTRO sistema (no adoptar Hermes como motor)')
  })

  it('updates multiple IDs from a single resolves array in one call', () => {
    const result = updateBacklogStatus('F-0099', ['S-005', 'SP-005'], '2026-07-27', tmpFile)
    expect(result.updated.sort()).toEqual(['S-005', 'SP-005'])
    expect(result.missing).toEqual([])

    const content = readFileSync(tmpFile, 'utf-8')
    expect(content.split('\n').find(l => l.startsWith('| S-005 |'))).toContain('done 2026-07-27 (F-0099, orquestador, liberado a prod)')
    expect(content.split('\n').find(l => l.startsWith('| SP-005 |'))).toContain('done 2026-07-27 (F-0099, orquestador, liberado a prod)')
  })

  it('returns unknown IDs in `missing` without throwing, and does not touch the file for them', () => {
    const result = updateBacklogStatus('F-0099', ['TS-999'], '2026-07-27', tmpFile)
    expect(result).toEqual({ updated: [], missing: ['TS-999'] })
    expect(readFileSync(tmpFile, 'utf-8')).toBe(FIXTURE)
  })

  it('mixes found and missing IDs in the same call', () => {
    const result = updateBacklogStatus('F-0099', ['S-005', 'TS-999'], '2026-07-27', tmpFile)
    expect(result.updated).toEqual(['S-005'])
    expect(result.missing).toEqual(['TS-999'])
  })

  it('does not confuse substring-colliding IDs (S-014 vs a hypothetical S-01)', () => {
    // S-014 must match exactly — a naive substring/includes check on the raw line could
    // false-positive against a shorter prefix ID if one existed in the same table.
    const result = updateBacklogStatus('F-0099', ['S-014'], '2026-07-27', tmpFile)
    expect(result).toEqual({ updated: ['S-014'], missing: [] })
    const content = readFileSync(tmpFile, 'utf-8')
    // Only the S-014 row changed — S-005/S-023 remain pending
    expect(content.split('\n').find(l => l.startsWith('| S-005 |'))).toContain('pending')
    expect(content.split('\n').find(l => l.startsWith('| S-023 |'))).toContain('pending')
  })

  it('is idempotent — running twice on the same ID does not duplicate or corrupt the row', () => {
    updateBacklogStatus('F-0099', ['S-005'], '2026-07-27', tmpFile)
    const afterFirst = readFileSync(tmpFile, 'utf-8')
    const result2 = updateBacklogStatus('F-0099', ['S-005'], '2026-07-27', tmpFile)
    const afterSecond = readFileSync(tmpFile, 'utf-8')

    expect(result2).toEqual({ updated: ['S-005'], missing: [] })
    expect(afterSecond).toBe(afterFirst)
    // exactly one row starts with "| S-005 |" — no duplicated row
    expect(afterSecond.split('\n').filter(l => l.startsWith('| S-005 |'))).toHaveLength(1)
  })

  it('returns empty result and does not read/write when resolves is empty', () => {
    const result = updateBacklogStatus('F-0099', [], '2026-07-27', tmpFile)
    expect(result).toEqual({ updated: [], missing: [] })
    expect(readFileSync(tmpFile, 'utf-8')).toBe(FIXTURE)
  })

  it('returns all IDs as missing (no crash) when the backlog file does not exist', () => {
    const missingFile = path.join(tmpDir, 'DOES_NOT_EXIST.md')
    const result = updateBacklogStatus('F-0099', ['S-005'], '2026-07-27', missingFile)
    expect(result).toEqual({ updated: [], missing: ['S-005'] })
  })
})
