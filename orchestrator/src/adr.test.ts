import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { parseAdrBlocks, appendAdr, type AdrDraft } from './adr.js'

const FIXTURE = `# ADR — Architecture Decision Records · augusto-os

Registro de decisiones.

## Template (copiar para cada ADR nuevo)

\`\`\`
## ADR-XXXX · YYYY-MM-DD · <título corto>
\`\`\`

---

## ADR-0010 · 2026-06-20 · Argos en el loop

**Estado:** aceptada
**Origen:** Supuesto del agente
**Target:** argos

**Decisión:** Argos entra al loop con dbModel none.
**Contexto:** Su verificación no toca la DB.
**Alternativas descartadas:** Supabase branch descartada.
**Consecuencias / riesgo residual:** Pendiente QA visual.

> Generado por el loop · feature F-0004 · step 1

---

## ADR-0009 · 2026-06-20 · Fase de release autónoma

**Estado:** aceptada
**Origen:** Instrucción de Augusto
**Target:** sistema

**Decisión:** El orquestador lleva un feature hasta prod.
**Contexto:** Augusto pidió delegar push+deploy.
**Alternativas descartadas:** ninguna
**Consecuencias / riesgo residual:** ninguna

---
`

// ── parseAdrBlocks ─────────────────────────────────────────────────────────────

describe('parseAdrBlocks', () => {
  it('returns [] when there are no ADR blocks', () => {
    expect(parseAdrBlocks('just some text, no blocks here')).toEqual([])
    expect(parseAdrBlocks('')).toEqual([])
  })

  it('extracts a single ADR block with all fields', () => {
    const output = `
Some preamble text.
===ADR===
target: kredy
origen: Supuesto del agente
titulo: Elegir patrón X
decision: Se eligió X sobre Y por rendimiento.
contexto: Surgió al implementar el endpoint de pagos.
alternativas: Y fue descartado por acoplamiento.
consecuencias: X queda pendiente de benchmarking.
===END ADR===
Trailing text.
`
    const blocks = parseAdrBlocks(output)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toEqual({
      target:        'kredy',
      origen:        'Supuesto del agente',
      titulo:        'Elegir patrón X',
      decision:      'Se eligió X sobre Y por rendimiento.',
      contexto:      'Surgió al implementar el endpoint de pagos.',
      alternativas:  'Y fue descartado por acoplamiento.',
      consecuencias: 'X queda pendiente de benchmarking.',
    })
  })

  it('extracts N ADR blocks correctly', () => {
    const output = `
===ADR===
target: kredy
origen: Instrucción de Augusto
titulo: Decisión uno
decision: D1
contexto: C1
alternativas: A1
consecuencias: Co1
===END ADR===

Some text in between.

===ADR===
target: spensiv
origen: Derivada
titulo: Decisión dos
decision: D2
contexto: C2
alternativas: A2
consecuencias: Co2
===END ADR===

===ADR===
target: sistema
origen: Supuesto del agente
titulo: Decisión tres
decision: D3
contexto: C3
alternativas: ninguna
consecuencias: ninguna
===END ADR===
`
    const blocks = parseAdrBlocks(output)
    expect(blocks).toHaveLength(3)
    expect(blocks[0].titulo).toBe('Decisión uno')
    expect(blocks[0].origen).toBe('Instrucción de Augusto')
    expect(blocks[1].titulo).toBe('Decisión dos')
    expect(blocks[2].titulo).toBe('Decisión tres')
  })

  it('tolerates missing fields (defaults to empty string)', () => {
    const output = `
===ADR===
titulo: Solo hay título
decision: Solo hay decisión
===END ADR===
`
    const [block] = parseAdrBlocks(output)
    expect(block.titulo).toBe('Solo hay título')
    expect(block.decision).toBe('Solo hay decisión')
    expect(block.target).toBe('')
    expect(block.origen).toBe('')
    expect(block.contexto).toBe('')
    expect(block.alternativas).toBe('')
    expect(block.consecuencias).toBe('')
  })

  it('tolerates extra leading/trailing spaces in field values', () => {
    const output = `
===ADR===
titulo:   Título con espacios
decision:   Decisión con espacios
===END ADR===
`
    const [block] = parseAdrBlocks(output)
    expect(block.titulo).toBe('Título con espacios')
    expect(block.decision).toBe('Decisión con espacios')
  })
})

// ── appendAdr ─────────────────────────────────────────────────────────────────

describe('appendAdr', () => {
  let tmpDir: string
  let tmpFile: string

  const baseDraft: AdrDraft = {
    target:        'kredy',
    origen:        'Supuesto del agente',
    titulo:        'Test decision',
    decision:      'Se tomó la decisión de test.',
    contexto:      'Surgió durante el test.',
    alternativas:  'ninguna',
    consecuencias: 'ninguna',
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'adr-test-'))
    tmpFile = path.join(tmpDir, 'DECISIONS.md')
    writeFileSync(tmpFile, FIXTURE, 'utf-8')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true })
  })

  it('assigns the correct next ID (max existing + 1)', () => {
    const id = appendAdr(baseDraft, 'F-0011', 1, tmpFile)
    expect(id).toBe(11)
  })

  it('inserts the new entry BEFORE the first existing ADR (newest-first)', () => {
    appendAdr(baseDraft, 'F-0011', 1, tmpFile)
    const content = readFileSync(tmpFile, 'utf-8')
    const pos11 = content.indexOf('## ADR-0011')
    const pos10 = content.indexOf('## ADR-0010')
    expect(pos11).toBeGreaterThan(0)
    expect(pos11).toBeLessThan(pos10)
  })

  it('does not corrupt or remove prior ADR entries', () => {
    appendAdr(baseDraft, 'F-0011', 1, tmpFile)
    const content = readFileSync(tmpFile, 'utf-8')
    expect(content).toContain('## ADR-0010')
    expect(content).toContain('## ADR-0009')
    // 0011 (new) comes before 0010 (prior)
    expect(content.indexOf('## ADR-0011')).toBeLessThan(content.indexOf('## ADR-0010'))
    expect(content.indexOf('## ADR-0010')).toBeLessThan(content.indexOf('## ADR-0009'))
  })

  it('normalizes an invalid origen to "Supuesto del agente (<raw>)"', () => {
    const draft: AdrDraft = { ...baseDraft, origen: 'Criterio_propio_invalido' }
    appendAdr(draft, 'F-0011', 1, tmpFile)
    const content = readFileSync(tmpFile, 'utf-8')
    expect(content).toContain('**Origen:** Supuesto del agente (Criterio_propio_invalido)')
  })

  it('accepts valid orígenes without modification', () => {
    const draft: AdrDraft = { ...baseDraft, origen: 'Instrucción de Augusto' }
    appendAdr(draft, 'F-0011', 2, tmpFile)
    const content = readFileSync(tmpFile, 'utf-8')
    expect(content).toContain('**Origen:** Instrucción de Augusto')
    expect(content).not.toContain('Instrucción de Augusto (')
  })

  it('includes the traceability line with featureId and stepId', () => {
    appendAdr(baseDraft, 'F-0011', 3, tmpFile)
    const content = readFileSync(tmpFile, 'utf-8')
    expect(content).toContain('> Generado por el loop · feature F-0011 · step 3')
  })

  it('second call assigns the next consecutive ID', () => {
    const id1 = appendAdr(baseDraft, 'F-0011', 1, tmpFile)
    const id2 = appendAdr({ ...baseDraft, titulo: 'Segunda decisión' }, 'F-0011', 2, tmpFile)
    expect(id1).toBe(11)
    expect(id2).toBe(12)
  })

  it('creates the file if it does not exist (empty start)', () => {
    const emptyFile = path.join(tmpDir, 'EMPTY.md')
    const id = appendAdr(baseDraft, 'F-0001', 1, emptyFile)
    expect(id).toBe(1)
    const content = readFileSync(emptyFile, 'utf-8')
    expect(content).toContain('## ADR-0001')
  })

  // ── S-017: insertion must not fall inside the template fence ─────────────

  it('inserts the new ADR after the template fence, not inside it (S-017)', () => {
    // FIXTURE has a ``` fence containing "## ADR-XXXX". Without the fix, the insertion
    // lands BEFORE "## ADR-XXXX" (inside the fence block). With the fix (\d{4} regex),
    // it skips the template placeholder and inserts before ## ADR-0010 (after the fence).
    appendAdr(baseDraft, 'F-0011', 1, tmpFile)
    const content = readFileSync(tmpFile, 'utf-8')

    // The closing ``` of the template fence is followed by a blank line and ---
    const fenceCloseIdx = content.indexOf('```\n\n---')
    expect(fenceCloseIdx).toBeGreaterThan(-1)  // sanity: fixture has the fence

    const pos11 = content.indexOf('## ADR-0011')
    expect(pos11).toBeGreaterThan(-1)
    // The new ADR must appear AFTER the closing fence delimiter
    expect(pos11).toBeGreaterThan(fenceCloseIdx + 3)
  })

  it('the template fence content remains unchanged after insertion', () => {
    appendAdr(baseDraft, 'F-0011', 1, tmpFile)
    const content = readFileSync(tmpFile, 'utf-8')
    // The fence block with ADR-XXXX must still be intact
    expect(content).toContain('```\n## ADR-XXXX')
  })
})
