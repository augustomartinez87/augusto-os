import { describe, it, expect, vi } from 'vitest'
import { parseGitStatus, checkWorkingTree, type RunOutput } from './check-repo-health.js'

function runOk(stdout: string, stderr = ''): RunOutput {
  return { ok: true, stdout, stderr }
}

function runFail(stderr: string): RunOutput {
  return { ok: false, stdout: '', stderr }
}

// ── parseGitStatus ─────────────────────────────────────────────────────────────

describe('parseGitStatus', () => {
  it('extracts file paths trimming the 2-char status prefix', () => {
    const out = ' M src/index.ts\n?? nuevo.txt\nA  src/otro.ts\n'
    expect(parseGitStatus(out)).toEqual(['src/index.ts', 'nuevo.txt', 'src/otro.ts'])
  })

  it('returns an empty list for a clean working tree', () => {
    expect(parseGitStatus('')).toEqual([])
    expect(parseGitStatus('\n\n')).toEqual([])
  })

  it('tolerates CRLF line endings', () => {
    expect(parseGitStatus(' M src/a.ts\r\n?? b.txt\r\n')).toEqual(['src/a.ts', 'b.txt'])
  })

  it('drops lines with no path after the prefix', () => {
    expect(parseGitStatus(' M \n M src/a.ts\n')).toEqual(['src/a.ts'])
  })
})

// ── checkWorkingTree ───────────────────────────────────────────────────────────

describe('checkWorkingTree', () => {
  it('reports ok when git status --porcelain is empty', async () => {
    const runFn = vi.fn().mockResolvedValue(runOk(''))
    const result = await checkWorkingTree('/repo', runFn)

    expect(runFn).toHaveBeenCalledWith('git', ['status', '--porcelain'], '/repo')
    expect(result.ok).toBe(true)
    expect(result.name).toBe('working-tree')
  })

  it('reports the dirty files when the working tree has changes', async () => {
    const runFn = vi.fn().mockResolvedValue(runOk(' M src/a.ts\n?? b.txt\n'))
    const result = await checkWorkingTree('/repo', runFn)

    expect(result.ok).toBe(false)
    expect(result.detail).toContain('2 archivo(s)')
    expect(result.detail).toContain('src/a.ts')
    expect(result.detail).toContain('b.txt')
  })

  it('reports an execution error (not a dirty tree) when git fails', async () => {
    const runFn = vi.fn().mockResolvedValue(runFail('fatal: not a git repository'))
    const result = await checkWorkingTree('/no-repo', runFn)

    expect(result.ok).toBe(false)
    expect(result.detail).toContain('No se pudo ejecutar')
    expect(result.detail).toContain('fatal: not a git repository')
    // el error NO debe aparecer disfrazado de archivo sucio
    expect(result.detail).not.toContain('archivo(s) con cambios sin commitear')
  })

  it('ignores git warnings on stderr when the tree is clean', async () => {
    const warning = "warning: in the working copy of 'src/a.ts', LF will be replaced by CRLF"
    const runFn = vi.fn().mockResolvedValue(runOk('', warning))
    const result = await checkWorkingTree('/repo', runFn)

    expect(result.ok).toBe(true)
    expect(result.detail).not.toContain('warning')
  })
})
