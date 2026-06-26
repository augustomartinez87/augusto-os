import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { appendProgress } from './progress.js'

// ── appendProgress (S-019c dedup) ─────────────────────────────────────────────

describe('appendProgress', () => {
  let tmpDir: string
  let progressPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'progress-test-'))
    progressPath = path.join(tmpDir, 'PROGRESS.md')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true })
  })

  it('creates the file and writes the entry on first call', () => {
    appendProgress(progressPath, 'F-0001', 'some summary')
    expect(existsSync(progressPath)).toBe(true)
    const content = readFileSync(progressPath, 'utf-8')
    expect(content).toContain('F-0001 completado')
    expect(content).toContain('some summary')
  })

  it('does not duplicate the entry when called a second time with the same featureId', () => {
    appendProgress(progressPath, 'F-0001', 'first summary')
    appendProgress(progressPath, 'F-0001', 'second summary — should not appear')
    const content = readFileSync(progressPath, 'utf-8')
    const count = (content.match(/F-0001 completado/g) ?? []).length
    expect(count).toBe(1)
    expect(content).not.toContain('should not appear')
  })

  it('allows distinct entries for different featureIds', () => {
    appendProgress(progressPath, 'F-0001', 'first')
    appendProgress(progressPath, 'F-0002', 'second')
    const content = readFileSync(progressPath, 'utf-8')
    expect(content).toContain('F-0001 completado')
    expect(content).toContain('F-0002 completado')
  })

  it('does not duplicate when PROGRESS.md already contains the featureId from a prior run', () => {
    writeFileSync(progressPath, '\n## 2026-06-01 — F-0003 completado\n\nold summary\n', 'utf-8')
    appendProgress(progressPath, 'F-0003', 'resumed session summary')
    const content = readFileSync(progressPath, 'utf-8')
    const count = (content.match(/F-0003 completado/g) ?? []).length
    expect(count).toBe(1)
  })
})
