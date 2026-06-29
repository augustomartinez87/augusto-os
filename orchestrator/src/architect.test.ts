import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { getNextFeatureId, buildArchitectPrompt, runArchitect } from './architect.js'
import { MAX_TURNS } from './models.js'
import type { IntakeResult } from './intake.js'

const TEMPLATE_FIXTURE = `---
id: F-XXXX
title: <título corto>
target: kredy
ui: false
acceptance:
  - <criterio 1>
  - <criterio 2>
  - Typecheck, lint y tests pasan sin errores
---

## Contexto

<Qué problema resuelve>

## Pasos sugeridos

1. <paso atómico>

## Fuera de alcance

- <lo que NO se hace>

## Restricciones clave

- <reglas innegociables>
`

const SPEC_FIXTURE = `---
id: F-XXXX
title: Export CSV para Spensiv
target: spensiv
ui: false
acceptance:
  - El endpoint /api/export devuelve un CSV válido con los registros del período
  - Los headers del CSV coinciden con los campos del modelo
  - Typecheck, lint y tests pasan sin errores
---

## Contexto

Permite exportar los movimientos del tracker a CSV para análisis externo.
Reusar el modelo Transaction de Prisma ya existente.

## Pasos sugeridos

1. Agregar endpoint /api/export/csv con filtro de fechas
2. Serializar Transaction[] a CSV usando papaparse
3. Agregar botón de descarga en la vista de gastos

## Fuera de alcance

- Exportar a Excel o PDF
- Filtros por categoría o cuenta

## Restricciones clave

- Sin migración de schema — usar modelos existentes
- No mostrar campos sensibles como ids de usuario en el CSV público
`

const BASE_INTAKE: IntakeResult = {
  ideaText: 'agregar export csv para spensiv con filtros de fecha',
  target: 'spensiv',
  classification: 'feature',
  relatedAdrs: ['ADR-0015'],
  relatedFeatures: ['F-0003'],
  relatedBacklogIds: ['SPT-001'],
  contextSummary: 'Target: spensiv | Clasificación: feature | ADRs relacionados: ADR-0015 | Features relacionados: F-0003 | Backlog: SPT-001',
  needsArchitect: true,
}

// ── getNextFeatureId ──────────────────────────────────────────────────────────

describe('getNextFeatureId', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = mkdtempSync(path.join(tmpdir(), 'architect-id-')) })
  afterEach(() => { rmSync(tmpDir, { recursive: true }) })

  it('returns F-0001 for an empty directory', () => {
    expect(getNextFeatureId(tmpDir)).toBe('F-0001')
  })

  it('returns max + 1 when files exist', () => {
    writeFileSync(path.join(tmpDir, 'F-0003.md'), '', 'utf-8')
    writeFileSync(path.join(tmpDir, 'F-0007.md'), '', 'utf-8')
    writeFileSync(path.join(tmpDir, 'F-0001.md'), '', 'utf-8')
    expect(getNextFeatureId(tmpDir)).toBe('F-0008')
  })

  it('pads numbers to 4 digits', () => {
    writeFileSync(path.join(tmpDir, 'F-0009.md'), '', 'utf-8')
    expect(getNextFeatureId(tmpDir)).toBe('F-0010')
  })

  it('ignores non-feature files (_TEMPLATE.md, etc.)', () => {
    writeFileSync(path.join(tmpDir, '_TEMPLATE.md'), '', 'utf-8')
    writeFileSync(path.join(tmpDir, 'README.md'), '', 'utf-8')
    writeFileSync(path.join(tmpDir, 'F-0002.md'), '', 'utf-8')
    expect(getNextFeatureId(tmpDir)).toBe('F-0003')
  })

  it('returns F-0001 when directory does not exist', () => {
    expect(getNextFeatureId('/no/such/dir')).toBe('F-0001')
  })
})

// ── buildArchitectPrompt ──────────────────────────────────────────────────────

describe('buildArchitectPrompt', () => {
  it('includes the idea text', () => {
    const prompt = buildArchitectPrompt(BASE_INTAKE, TEMPLATE_FIXTURE, 'F-0008')
    expect(prompt).toContain('agregar export csv para spensiv')
  })

  it('includes the assigned feature ID', () => {
    const prompt = buildArchitectPrompt(BASE_INTAKE, TEMPLATE_FIXTURE, 'F-0008')
    expect(prompt).toContain('F-0008')
  })

  it('includes the template', () => {
    const prompt = buildArchitectPrompt(BASE_INTAKE, TEMPLATE_FIXTURE, 'F-0008')
    expect(prompt).toContain('Typecheck, lint y tests pasan sin errores')
  })

  it('includes the context summary', () => {
    const prompt = buildArchitectPrompt(BASE_INTAKE, TEMPLATE_FIXTURE, 'F-0008')
    expect(prompt).toContain('Target: spensiv')
    expect(prompt).toContain('ADR-0015')
  })

  it('includes the target', () => {
    const prompt = buildArchitectPrompt(BASE_INTAKE, TEMPLATE_FIXTURE, 'F-0008')
    expect(prompt).toContain('spensiv')
  })

  it('mentions Definition of Ready requirements', () => {
    const prompt = buildArchitectPrompt(BASE_INTAKE, TEMPLATE_FIXTURE, 'F-0008')
    expect(prompt).toContain('Definition of Ready')
    expect(prompt).toContain('Fuera de alcance')
    expect(prompt).toContain('DB/prod/legal')
  })

  it('instructs not to include SQL migration steps', () => {
    const prompt = buildArchitectPrompt(BASE_INTAKE, TEMPLATE_FIXTURE, 'F-0008')
    expect(prompt).toContain('migración SQL')
  })

  it('instructs to start the output with ---', () => {
    const prompt = buildArchitectPrompt(BASE_INTAKE, TEMPLATE_FIXTURE, 'F-0008')
    expect(prompt).toContain('Empezá con "---"')
  })

  it('includes related content when provided', () => {
    const prompt = buildArchitectPrompt(BASE_INTAKE, TEMPLATE_FIXTURE, 'F-0008', '### F-0003\nContenido del feature relacionado')
    expect(prompt).toContain('Contenido del feature relacionado')
  })
})

// ── runArchitect ──────────────────────────────────────────────────────────────

describe('runArchitect', () => {
  let tmpDir: string
  let featuresDir: string
  let templatePath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'architect-run-'))
    featuresDir = path.join(tmpDir, 'features')
    mkdirSync(featuresDir)
    templatePath = path.join(tmpDir, '_TEMPLATE.md')
    writeFileSync(templatePath, TEMPLATE_FIXTURE, 'utf-8')
    // Pre-existing features so next ID is F-0008
    writeFileSync(path.join(featuresDir, 'F-0007.md'), '', 'utf-8')
  })

  afterEach(() => { rmSync(tmpDir, { recursive: true }) })

  it('writes the spec file to the features dir', async () => {
    const callClaude = async (_prompt: string): Promise<string> => SPEC_FIXTURE

    const filePath = await runArchitect(BASE_INTAKE, { featuresDir, templatePath, callClaude })

    expect(existsSync(filePath)).toBe(true)
    expect(filePath).toContain('F-0008.md')
  })

  it('replaces F-XXXX placeholder with the assigned ID', async () => {
    const callClaude = async (_prompt: string): Promise<string> => SPEC_FIXTURE

    const filePath = await runArchitect(BASE_INTAKE, { featuresDir, templatePath, callClaude })
    const content = readFileSync(filePath, 'utf-8')

    expect(content).toContain('id: F-0008')
    expect(content).not.toContain('id: F-XXXX')
  })

  it('preserves the rest of the spec content', async () => {
    const callClaude = async (_prompt: string): Promise<string> => SPEC_FIXTURE

    const filePath = await runArchitect(BASE_INTAKE, { featuresDir, templatePath, callClaude })
    const content = readFileSync(filePath, 'utf-8')

    expect(content).toContain('Export CSV para Spensiv')
    expect(content).toContain('## Contexto')
    expect(content).toContain('## Pasos sugeridos')
    expect(content).toContain('## Fuera de alcance')
    expect(content).toContain('## Restricciones clave')
  })

  it('handles output with preamble text before the frontmatter', async () => {
    const withPreamble = 'Aquí está el spec:\n\n' + SPEC_FIXTURE
    const callClaude = async (_prompt: string): Promise<string> => withPreamble

    const filePath = await runArchitect(BASE_INTAKE, { featuresDir, templatePath, callClaude })
    const content = readFileSync(filePath, 'utf-8')

    expect(content.startsWith('---')).toBe(true)
  })

  it('handles output wrapped in ``` fences', async () => {
    const fenced = '```markdown\n' + SPEC_FIXTURE.trim() + '\n```'
    const callClaude = async (_prompt: string): Promise<string> => fenced

    const filePath = await runArchitect(BASE_INTAKE, { featuresDir, templatePath, callClaude })
    const content = readFileSync(filePath, 'utf-8')

    expect(content.startsWith('---')).toBe(true)
  })

  it('throws when callClaude returns no frontmatter', async () => {
    const callClaude = async (_prompt: string): Promise<string> => 'solo texto, sin frontmatter'

    await expect(
      runArchitect(BASE_INTAKE, { featuresDir, templatePath, callClaude })
    ).rejects.toThrow('frontmatter válido')
  })

  it('the prompt passed to callClaude contains the idea text', async () => {
    let capturedPrompt = ''
    const callClaude = async (prompt: string): Promise<string> => {
      capturedPrompt = prompt
      return SPEC_FIXTURE
    }

    await runArchitect(BASE_INTAKE, { featuresDir, templatePath, callClaude })

    expect(capturedPrompt).toContain('agregar export csv para spensiv')
    expect(capturedPrompt).toContain('F-0008')
  })

  it('propagates error when callClaude throws (Reached max turns scenario)', async () => {
    const callClaude = vi.fn().mockRejectedValue(
      new Error('Architect (Claude) falló con código 1:\n[stderr]\nReached max turns (1)\n[stdout]\n(vacío)')
    )

    await expect(
      runArchitect(BASE_INTAKE, { featuresDir, templatePath, callClaude })
    ).rejects.toThrow('Reached max turns')
  })
})

// ── MAX_TURNS sanity check ─────────────────────────────────────────────────────

describe('MAX_TURNS', () => {
  it('is at least 10 so a tool_use on turn 1 does not cut the loop', () => {
    expect(MAX_TURNS).toBeGreaterThanOrEqual(10)
  })
})
