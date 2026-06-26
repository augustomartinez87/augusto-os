import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import {
  detectTarget,
  classify,
  needsArchitectCheck,
  findRelatedAdrs,
  findRelatedFeatures,
  findRelatedBacklog,
  runIntake,
} from './intake.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const DECISIONS_FIXTURE = `# ADR — Architecture Decision Records

## Template

\`\`\`
## ADR-XXXX · YYYY-MM-DD · <título>
\`\`\`

---

## ADR-0015 · 2026-06-20 · Spensiv usa Neon como DB dev

**Estado:** aceptada
**Target:** spensiv

**Decisión:** Se usa Neon para el sandbox dev de Spensiv.
**Contexto:** Neon permite branches de DB baratos para finanzas personales.

---

## ADR-0019 · 2026-06-25 · Auto-deploy en verde

**Estado:** aceptada
**Target:** sistema

**Decisión:** El loop deploya a prod automáticamente cuando la verificación da verde.
**Contexto:** Eliminar el gate humano de deploy para el orquestador.

---

## ADR-0012 · 2026-06-18 · Kredy usa Prisma + Supabase

**Estado:** aceptada
**Target:** kredy

**Decisión:** Kredy usa Prisma como ORM con Supabase como DB.
**Contexto:** Préstamos y créditos requieren transacciones ACID.

---
`

const BACKLOG_FIXTURE = `# Backlog — augusto-os

## Sistema

| ID | P | Descripción | Estado |
|----|---|-------------|--------|
| S-008 | 1 | Intake + Architect agent — detecta proyecto, busca ADRs/features relacionados, clasifica bug/feature/arquitectura | pending |
| S-007 | 3 | Dashboard web mobile-first (control plane Supabase). Fase C = disparar features / Architect | active |

## Kredy

| ID | P | Descripción | Estado |
|----|---|-------------|--------|
| SP-005 | 3 | Refinanciación Fase 2: UI de propuesta de refinanciación | pending |
| SP-009 | ✅ | Gate de límite por vínculo en preApprove para préstamos | done |

## Spensiv

| ID | P | Descripción | Estado |
|----|---|-------------|--------|
| SPT-001 | 3 | Seed data de prueba en el Neon dev spensiv-dev (schema vacío, sin datos) | pending |

## Argos

| ID | P | Descripción | Estado |
|----|---|-------------|--------|
| AR-003 | 4 | Polish: prompt del executor condicional por dbModel para portfolio tracker | pending |
`

// ── detectTarget ──────────────────────────────────────────────────────────────

describe('detectTarget', () => {
  it('detects kredy from "Kredy"', () => {
    expect(detectTarget('Kredy necesita un nuevo campo')).toBe('kredy')
  })

  it('detects kredy from "préstamo"', () => {
    expect(detectTarget('agregar pantalla de nuevo préstamo')).toBe('kredy')
  })

  it('detects kredy from "crédito"', () => {
    expect(detectTarget('calcular el crédito disponible')).toBe('kredy')
  })

  it('detects kredy from "mutuo"', () => {
    expect(detectTarget('generar el mutuo del préstamo')).toBe('kredy')
  })

  it('detects kredy from "CUIL"', () => {
    expect(detectTarget('búsqueda por CUIL en consola AP')).toBe('kredy')
  })

  it('detects kredy from "prestatario"', () => {
    expect(detectTarget('mostrar info del prestatario en el dashboard')).toBe('kredy')
  })

  it('detects spensiv from "spensiv"', () => {
    expect(detectTarget('agregar export csv para spensiv')).toBe('spensiv')
  })

  it('detects spensiv from "cashflow"', () => {
    expect(detectTarget('mejorar la vista de cashflow mensual')).toBe('spensiv')
  })

  it('detects spensiv from "gastos"', () => {
    expect(detectTarget('filtrar gastos por categoría')).toBe('spensiv')
  })

  it('detects argos from "argos"', () => {
    expect(detectTarget('argos comparar contra Rendi finance')).toBe('argos')
  })

  it('detects argos from "portfolio"', () => {
    expect(detectTarget('agregar gráfico al portfolio')).toBe('argos')
  })

  it('detects argos from "inversión"', () => {
    expect(detectTarget('calcular rendimiento de inversión')).toBe('argos')
  })

  it('detects argos from "fci"', () => {
    expect(detectTarget('agregar soporte para FCI en el tracker')).toBe('argos')
  })

  it('detects argos from "vesty"', () => {
    expect(detectTarget('robar ideas de vestyapp para argos')).toBe('argos')
  })

  it('detects sistema from "orquestador"', () => {
    expect(detectTarget('mejorar el orquestador para reusar prompts')).toBe('sistema')
  })

  it('detects sistema from "orchestrator"', () => {
    expect(detectTarget('refactor del orchestrator principal')).toBe('sistema')
  })

  it('detects sistema from "intake"', () => {
    expect(detectTarget('el intake debería detectar duplicados')).toBe('sistema')
  })

  it('returns unknown for unrecognized text', () => {
    expect(detectTarget('Hola')).toBe('unknown')
    expect(detectTarget('algo raro sin contexto')).toBe('unknown')
  })

  it('returns unknown for short greetings', () => {
    expect(detectTarget('hola cómo andás')).toBe('unknown')
  })
})

// ── classify ──────────────────────────────────────────────────────────────────

describe('classify', () => {
  it('classifies as bug when text contains "bug"', () => {
    expect(classify('hay un bug en la pantalla de préstamos')).toBe('bug')
  })

  it('classifies as bug when text contains "error"', () => {
    expect(classify('error al calcular la cuota')).toBe('bug')
  })

  it('classifies as bug when text contains "falla"', () => {
    expect(classify('la exportación falla con registros grandes')).toBe('bug')
  })

  it('classifies as bug when text contains "no funciona"', () => {
    expect(classify('el filtro de gastos no funciona')).toBe('bug')
  })

  it('classifies as arquitectura when text mentions "orquestador"', () => {
    expect(classify('refactor del orquestador para soportar multi-modelo')).toBe('arquitectura')
  })

  it('classifies as arquitectura when text mentions "orchestrator"', () => {
    expect(classify('el orchestrator debería emitir ADR automáticamente')).toBe('arquitectura')
  })

  it('classifies as arquitectura for intake/architect keywords', () => {
    expect(classify('el intake agent debería cachear resultados')).toBe('arquitectura')
  })

  it('defaults to feature for product-level ideas', () => {
    expect(classify('agregar export csv para spensiv')).toBe('feature')
    expect(classify('comparar argos contra Rendi finance')).toBe('feature')
    expect(classify('mejorar visualmente el dashboard de préstamos')).toBe('feature')
  })

  it('defaults to feature when no bug/arch keyword present', () => {
    expect(classify('nueva pantalla de amortización para Kredy')).toBe('feature')
  })
})

// ── needsArchitectCheck ───────────────────────────────────────────────────────

describe('needsArchitectCheck', () => {
  it('returns true for arquitectura classification regardless of text length', () => {
    expect(needsArchitectCheck('refactor', 'arquitectura')).toBe(true)
  })

  it('returns false for very short idea (< 4 words)', () => {
    expect(needsArchitectCheck('Hola', 'feature')).toBe(false)
    expect(needsArchitectCheck('hola cómo', 'feature')).toBe(false)
    expect(needsArchitectCheck('agregar campo form', 'feature')).toBe(false)
  })

  it('returns false for ideas containing trivial keywords', () => {
    expect(needsArchitectCheck('arreglar typo en el botón de confirmación', 'feature')).toBe(false)
    expect(needsArchitectCheck('renombrar el label del campo de cuota', 'feature')).toBe(false)
    expect(needsArchitectCheck('cambiar el color del header del dashboard', 'feature')).toBe(false)
  })

  it('returns true for a real feature (≥ 4 words, non-trivial)', () => {
    expect(needsArchitectCheck('agregar export csv para spensiv con filtros de fecha', 'feature')).toBe(true)
    expect(needsArchitectCheck('comparar argos contra Rendi finance a ver que ideas podemos robar', 'feature')).toBe(true)
    expect(needsArchitectCheck('mejorar visualmente el dashboard de argos', 'feature')).toBe(true)
  })

  it('returns true for a bug with sufficient context', () => {
    expect(needsArchitectCheck('hay un bug en el cálculo de intereses para créditos en cuotas', 'bug')).toBe(true)
  })

  it('returns false for short bug report (< 4 words)', () => {
    expect(needsArchitectCheck('falla el login', 'bug')).toBe(false)
  })
})

// ── findRelatedAdrs ───────────────────────────────────────────────────────────

describe('findRelatedAdrs', () => {
  let tmpDir: string
  let decisionsPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'intake-adrs-'))
    decisionsPath = path.join(tmpDir, 'DECISIONS.md')
    writeFileSync(decisionsPath, DECISIONS_FIXTURE, 'utf-8')
  })

  afterEach(() => { rmSync(tmpDir, { recursive: true }) })

  it('returns [] when the file does not exist', () => {
    expect(findRelatedAdrs('spensiv neon', '/no/such/file.md')).toEqual([])
  })

  it('finds ADR related to "spensiv" and "neon"', () => {
    const result = findRelatedAdrs('agregar export csv para spensiv', decisionsPath)
    expect(result).toContain('ADR-0015')
  })

  it('finds ADR related to "deploy" / "orquestador"', () => {
    const result = findRelatedAdrs('el orquestador debería avisar antes del deploy', decisionsPath)
    expect(result).toContain('ADR-0019')
  })

  it('finds ADR related to "préstamo" / "kredy" / "prisma"', () => {
    const result = findRelatedAdrs('kredy usa prisma correctamente', decisionsPath)
    expect(result).toContain('ADR-0012')
  })

  it('returns [] for text with no keyword overlap', () => {
    const result = findRelatedAdrs('xyz qwerty zzzz', decisionsPath)
    expect(result).toEqual([])
  })

  it('does not return ADR-XXXX from the template block', () => {
    const result = findRelatedAdrs('título placeholder', decisionsPath)
    expect(result).not.toContain('ADR-XXXX')
  })
})

// ── findRelatedFeatures ───────────────────────────────────────────────────────

describe('findRelatedFeatures', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'intake-features-'))

    writeFileSync(path.join(tmpDir, 'F-0001.md'), `---
id: F-0001
title: AP Score como gate en pre-aprobación
target: kredy
---
## Contexto
Gate que evalúa el score del agente productor antes de aprobar un préstamo.
`, 'utf-8')

    writeFileSync(path.join(tmpDir, 'F-0002.md'), `---
id: F-0002
title: Exportar datos de spensiv a CSV
target: spensiv
---
## Contexto
Permitir exportar gastos y movimientos del tracker de finanzas personales a CSV.
`, 'utf-8')

    writeFileSync(path.join(tmpDir, 'F-0003.md'), `---
id: F-0003
title: Dashboard de inversiones en argos
target: argos
---
## Contexto
Vista de portfolio con carry trade y FCI integrados.
`, 'utf-8')
  })

  afterEach(() => { rmSync(tmpDir, { recursive: true }) })

  it('returns [] when the features dir does not exist', () => {
    expect(findRelatedFeatures('kredy score', '/no/such/dir')).toEqual([])
  })

  it('finds F-0001 for "score" / "préstamo" / "kredy"', () => {
    const result = findRelatedFeatures('agregar score de riesgo al préstamo de kredy', tmpDir)
    expect(result).toContain('F-0001')
  })

  it('finds F-0002 for "spensiv" / "csv" / "gastos"', () => {
    const result = findRelatedFeatures('export csv para spensiv', tmpDir)
    expect(result).toContain('F-0002')
  })

  it('finds F-0003 for "argos" / "portfolio" / "carry"', () => {
    const result = findRelatedFeatures('carry trade argos dashboard', tmpDir)
    expect(result).toContain('F-0003')
  })

  it('returns [] for text with no keyword overlap', () => {
    expect(findRelatedFeatures('xyz qwerty zzzz', tmpDir)).toEqual([])
  })

  it('ignores non-F-XXXX files in the dir', () => {
    writeFileSync(path.join(tmpDir, '_TEMPLATE.md'), '# template kredy spensiv argos', 'utf-8')
    const result = findRelatedFeatures('kredy spensiv argos', tmpDir)
    expect(result).not.toContain('_TEMPLATE')
  })
})

// ── findRelatedBacklog ────────────────────────────────────────────────────────

describe('findRelatedBacklog', () => {
  let tmpDir: string
  let backlogPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'intake-backlog-'))
    backlogPath = path.join(tmpDir, 'BACKLOG.md')
    writeFileSync(backlogPath, BACKLOG_FIXTURE, 'utf-8')
  })

  afterEach(() => { rmSync(tmpDir, { recursive: true }) })

  it('returns [] when the file does not exist', () => {
    expect(findRelatedBacklog('intake', '/no/such/file.md')).toEqual([])
  })

  it('finds S-008 for "intake" / "architect"', () => {
    const result = findRelatedBacklog('el intake architect debería detectar bugs', backlogPath)
    expect(result).toContain('S-008')
  })

  it('finds S-007 for "dashboard" / "control"', () => {
    const result = findRelatedBacklog('mejorar el control del dashboard web', backlogPath)
    expect(result).toContain('S-007')
  })

  it('finds SP-005 for "refinanciación"', () => {
    const result = findRelatedBacklog('nueva UI de refinanciación de préstamos', backlogPath)
    expect(result).toContain('SP-005')
  })

  it('finds SPT-001 for "spensiv" / "seed" / "datos"', () => {
    const result = findRelatedBacklog('seed de datos para spensiv dev', backlogPath)
    expect(result).toContain('SPT-001')
  })

  it('finds AR-003 for "argos" / "portfolio"', () => {
    const result = findRelatedBacklog('polish del executor para portfolio tracker argos', backlogPath)
    expect(result).toContain('AR-003')
  })

  it('returns [] for text with no keyword overlap', () => {
    expect(findRelatedBacklog('xyz qwerty zzzz', backlogPath)).toEqual([])
  })
})

// ── runIntake integration ─────────────────────────────────────────────────────

describe('runIntake', () => {
  let tmpDir: string
  let decisionsPath: string
  let featuresDir: string
  let backlogPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'intake-run-'))
    decisionsPath = path.join(tmpDir, 'DECISIONS.md')
    featuresDir = path.join(tmpDir, 'features')
    backlogPath = path.join(tmpDir, 'BACKLOG.md')

    writeFileSync(decisionsPath, DECISIONS_FIXTURE, 'utf-8')
    mkdirSync(featuresDir)
    writeFileSync(path.join(featuresDir, 'F-0002.md'), '---\nid: F-0002\ntitle: Export CSV spensiv\ntarget: spensiv\n---\nExportar gastos del tracker de finanzas.\n', 'utf-8')
    writeFileSync(backlogPath, BACKLOG_FIXTURE, 'utf-8')
  })

  afterEach(() => { rmSync(tmpDir, { recursive: true }) })

  it('returns a complete IntakeResult for a typical spensiv feature', () => {
    const result = runIntake('agregar export csv para spensiv con filtros de fecha', {
      decisionsPath, featuresDir, backlogPath,
    })

    expect(result.ideaText).toBe('agregar export csv para spensiv con filtros de fecha')
    expect(result.target).toBe('spensiv')
    expect(result.classification).toBe('feature')
    expect(result.needsArchitect).toBe(true)
    expect(result.contextSummary).toContain('spensiv')
    expect(result.contextSummary).toContain('feature')
  })

  it('sets needsArchitect=false for a trivial idea', () => {
    const result = runIntake('Hola', { decisionsPath, featuresDir, backlogPath })
    expect(result.needsArchitect).toBe(false)
  })

  it('sets needsArchitect=true for arquitectura classification', () => {
    const result = runIntake('mejorar el intake agent del orquestador', {
      decisionsPath, featuresDir, backlogPath,
    })
    expect(result.classification).toBe('arquitectura')
    expect(result.needsArchitect).toBe(true)
  })

  it('populates contextSummary with all fields', () => {
    const result = runIntake('agregar export csv para spensiv', {
      decisionsPath, featuresDir, backlogPath,
    })
    expect(result.contextSummary).toContain('Target:')
    expect(result.contextSummary).toContain('Clasificación:')
  })
})
