import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { execa } from 'execa'
import { updateBacklogStatus, commitAndPushBacklog, pushBacklogFile } from './backlog.js'

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

// commitAndPushBacklog toca git de verdad — se prueba contra un repo real (bare origin +
// working clone) en tmpdir, nunca contra el repo real de augusto-os. Sin esto la reconciliación
// automática de arriba (updateBacklogStatus) queda escrita solo en disco: el repo remoto de
// augusto-os nunca se entera, que es exactamente el bug que motivó esta función (ver comentario
// en backlog.ts).
describe('commitAndPushBacklog', () => {
  let workDir: string
  let originPath: string
  let repoPath: string

  beforeEach(async () => {
    workDir = mkdtempSync(path.join(tmpdir(), 'backlog-push-test-'))
    originPath = path.join(workDir, 'origin.git')
    repoPath = path.join(workDir, 'repo')

    await execa('git', ['init', '--bare', originPath])
    await execa('git', ['clone', originPath, repoPath])
    await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: repoPath })
    await execa('git', ['config', 'user.name', 'Test'], { cwd: repoPath })
  })

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true })
  })

  async function seedRepo() {
    const sysDir = path.join(repoPath, 'system')
    await execa('mkdir', ['-p', sysDir])
    writeFileSync(path.join(sysDir, 'BACKLOG.md'), FIXTURE, 'utf-8')
    await execa('git', ['add', 'system/BACKLOG.md'], { cwd: repoPath })
    await execa('git', ['commit', '-m', 'initial backlog'], { cwd: repoPath })
    await execa('git', ['branch', '-m', 'master'], { cwd: repoPath })
    await execa('git', ['push', 'origin', 'master'], { cwd: repoPath })
    await execa('git', ['remote', 'set-head', 'origin', 'master'], { cwd: repoPath })
  }

  it('commits and pushes only system/BACKLOG.md, and origin reflects it afterward', async () => {
    await seedRepo()
    const backlogFile = path.join(repoPath, 'system', 'BACKLOG.md')
    const updatedContent = readFileSync(backlogFile, 'utf-8')
      .replace('| S-005 | 5 | Fase 5: Product Analyst (backlog desde métricas de uso real) | pending | cc |',
        '| S-005 | ✅ | Fase 5: Product Analyst (backlog desde métricas de uso real) | done 2026-09-14 (F-0099, orquestador, liberado a prod) | cc |')
    writeFileSync(backlogFile, updatedContent, 'utf-8')

    const result = await commitAndPushBacklog('F-0099', ['S-005'], repoPath)
    expect(result.committed).toBe(true)
    expect(result.pushed).toBe(true)
    expect(result.branch).toBe('master')

    const checkPath = path.join(workDir, 'fresh-check')
    await execa('git', ['clone', originPath, checkPath])
    const remoteContent = readFileSync(path.join(checkPath, 'system', 'BACKLOG.md'), 'utf-8')
    expect(remoteContent).toContain('done 2026-09-14 (F-0099, orquestador, liberado a prod)')
  })

  it('is a no-op when BACKLOG.md has no uncommitted changes', async () => {
    await seedRepo()
    const result = await commitAndPushBacklog('F-0099', ['S-005'], repoPath)
    expect(result).toEqual({ committed: false, pushed: false })
  })

  it('returns empty result without touching git when updatedIds is empty', async () => {
    await seedRepo()
    const result = await commitAndPushBacklog('F-0099', [], repoPath)
    expect(result).toEqual({ committed: false, pushed: false })
  })

  it('refuses to commit/push when HEAD is not on the default branch, leaving the change uncommitted', async () => {
    await seedRepo()
    await execa('git', ['checkout', '-b', 'feature/other-work'], { cwd: repoPath })
    const backlogFile = path.join(repoPath, 'system', 'BACKLOG.md')
    writeFileSync(backlogFile, readFileSync(backlogFile, 'utf-8') + '\n| AR-999 | 1 | test | done | cc |\n')

    const result = await commitAndPushBacklog('F-0099', ['AR-999'], repoPath)
    expect(result.committed).toBe(false)
    expect(result.pushed).toBe(false)
    expect(result.error).toContain("no en 'master'")

    const status = await execa('git', ['status', '--porcelain', 'system/BACKLOG.md'], { cwd: repoPath })
    expect(status.stdout.trim().length).toBeGreaterThan(0)
  })
})

// pushBacklogFile comparte el núcleo de commitAndPushBacklog (mismo repo/garantías) pero con
// un mensaje libre — para reconciliaciones manuales que editan el archivo con prosa, no con el
// formato mecánico de updateBacklogStatus. Alcanza con cubrir que el mensaje se use tal cual y
// que las mismas garantías (no-op sin cambios, respeta default branch) sigan aplicando.
describe('pushBacklogFile', () => {
  let workDir: string
  let originPath: string
  let repoPath: string

  beforeEach(async () => {
    workDir = mkdtempSync(path.join(tmpdir(), 'backlog-push-manual-test-'))
    originPath = path.join(workDir, 'origin.git')
    repoPath = path.join(workDir, 'repo')

    await execa('git', ['init', '--bare', originPath])
    await execa('git', ['clone', originPath, repoPath])
    await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: repoPath })
    await execa('git', ['config', 'user.name', 'Test'], { cwd: repoPath })

    const sysDir = path.join(repoPath, 'system')
    await execa('mkdir', ['-p', sysDir])
    writeFileSync(path.join(sysDir, 'BACKLOG.md'), FIXTURE, 'utf-8')
    await execa('git', ['add', 'system/BACKLOG.md'], { cwd: repoPath })
    await execa('git', ['commit', '-m', 'initial backlog'], { cwd: repoPath })
    await execa('git', ['branch', '-m', 'master'], { cwd: repoPath })
    await execa('git', ['push', 'origin', 'master'], { cwd: repoPath })
    await execa('git', ['remote', 'set-head', 'origin', 'master'], { cwd: repoPath })
  })

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true })
  })

  it('commits a manual edit with the given message and pushes it', async () => {
    const backlogFile = path.join(repoPath, 'system', 'BACKLOG.md')
    writeFileSync(backlogFile, readFileSync(backlogFile, 'utf-8').replace('pending', 'ya estaba resuelto, reconciliado a mano'))

    const result = await pushBacklogFile('chore(backlog): reconciliar AR-999 (verificado contra prod)', repoPath)
    expect(result.committed).toBe(true)
    expect(result.pushed).toBe(true)

    const log = await execa('git', ['log', '-1', '--pretty=%B'], { cwd: repoPath })
    expect(log.stdout).toContain('reconciliar AR-999')
    expect(log.stdout).toContain('reconciliación manual')
  })

  it('is a no-op when there is nothing to commit', async () => {
    const result = await pushBacklogFile('nada que decir', repoPath)
    expect(result).toEqual({ committed: false, pushed: false })
  })
})
