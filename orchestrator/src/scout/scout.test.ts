import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { ScoutReportSchema, validateEvidence } from './report.js'
import { list_tree, read_file, grep } from './tools.js'

// ── ScoutReportSchema ─────────────────────────────────────────────────────────

describe('ScoutReportSchema', () => {
  const VALID_REPORT = {
    objetivo: 'Investigar endpoints de autenticación',
    archivos: ['src/auth.ts', 'src/routes/login.ts'],
    patrones: ['usar middleware auth en cada ruta protegida'],
    dependencias: ['jsonwebtoken', 'bcrypt'],
    riesgos: ['cambio en schema de JWT puede romper sesiones activas'],
    evidencia: [{
      path: 'src/auth.ts',
      simbolo: 'verifyToken',
      lineas: '42-58',
      explicacion: 'función principal de verificación de JWT',
      confianza: 0.9,
    }],
    resumen: 'El sistema usa JWT con expiración de 24h.',
  }

  it('validates a complete valid report', () => {
    const result = ScoutReportSchema.safeParse(VALID_REPORT)
    expect(result.success).toBe(true)
  })

  it('rejects a report missing required fields', () => {
    const { objetivo: _o, ...incomplete } = VALID_REPORT
    const result = ScoutReportSchema.safeParse(incomplete)
    expect(result.success).toBe(false)
  })

  it('rejects evidence with confianza > 1', () => {
    const report = { ...VALID_REPORT, evidencia: [{ ...VALID_REPORT.evidencia[0], confianza: 1.5 }] }
    const result = ScoutReportSchema.safeParse(report)
    expect(result.success).toBe(false)
  })

  it('accepts empty arrays for archivos, patrones, dependencias, riesgos', () => {
    const report = { ...VALID_REPORT, archivos: [], patrones: [], dependencias: [], riesgos: [] }
    const result = ScoutReportSchema.safeParse(report)
    expect(result.success).toBe(true)
  })
})

// ── validateEvidence ──────────────────────────────────────────────────────────

describe('validateEvidence', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'scout-validate-'))
    writeFileSync(path.join(tmpDir, 'real.ts'), 'export function realFunction() {}\n', 'utf-8')
  })

  afterEach(() => rmSync(tmpDir, { recursive: true }))

  it('keeps evidence for files that exist', () => {
    const report = {
      objetivo: 'test',
      archivos: [], patrones: [], dependencias: [], riesgos: [],
      resumen: 'test',
      evidencia: [{ path: 'real.ts', simbolo: 'realFunction', lineas: '1', explicacion: 'ok', confianza: 0.9 }],
    }
    const { report: sanitized, stats } = validateEvidence(report, tmpDir)
    expect(sanitized.evidencia).toHaveLength(1)
    expect(stats.pathsDiscarded).toBe(0)
  })

  it('discards evidence for non-existent files', () => {
    const report = {
      objetivo: 'test',
      archivos: [], patrones: [], dependencias: [], riesgos: [],
      resumen: 'test',
      evidencia: [{ path: 'nonexistent.ts', simbolo: 'foo', lineas: '1', explicacion: 'ok', confianza: 0.8 }],
    }
    const { report: sanitized, stats } = validateEvidence(report, tmpDir)
    expect(sanitized.evidencia).toHaveLength(0)
    expect(stats.pathsDiscarded).toBe(1)
  })

  it('marks confianza=0 and adds [NO VERIFICADO] when symbol not found in file', () => {
    const report = {
      objetivo: 'test',
      archivos: [], patrones: [], dependencias: [], riesgos: [],
      resumen: 'test',
      evidencia: [{ path: 'real.ts', simbolo: 'nonExistentSymbol', lineas: '1', explicacion: 'exists', confianza: 0.9 }],
    }
    const { report: sanitized, stats } = validateEvidence(report, tmpDir)
    expect(sanitized.evidencia).toHaveLength(1)
    expect(sanitized.evidencia[0].confianza).toBe(0)
    expect(sanitized.evidencia[0].explicacion).toContain('[NO VERIFICADO]')
    expect(stats.symbolsUnverified).toBe(1)
    expect(stats.pathsDiscarded).toBe(0)
  })

  it('keeps confianza when symbol IS found in file', () => {
    const report = {
      objetivo: 'test',
      archivos: [], patrones: [], dependencias: [], riesgos: [],
      resumen: 'test',
      evidencia: [{ path: 'real.ts', simbolo: 'realFunction', lineas: '1', explicacion: 'found', confianza: 0.95 }],
    }
    const { report: sanitized, stats } = validateEvidence(report, tmpDir)
    expect(sanitized.evidencia[0].confianza).toBe(0.95)
    expect(stats.symbolsUnverified).toBe(0)
  })

  it('returns correct stats when mix of valid and invalid evidence', () => {
    const report = {
      objetivo: 'test',
      archivos: [], patrones: [], dependencias: [], riesgos: [],
      resumen: 'test',
      evidencia: [
        { path: 'real.ts', simbolo: 'realFunction', lineas: '1', explicacion: 'ok', confianza: 0.9 },
        { path: 'ghost.ts', simbolo: 'foo', lineas: '5', explicacion: 'missing', confianza: 0.7 },
        { path: 'real.ts', simbolo: 'missingSymbol', lineas: '1', explicacion: 'bad sym', confianza: 0.6 },
      ],
    }
    const { report: sanitized, stats } = validateEvidence(report, tmpDir)
    expect(sanitized.evidencia).toHaveLength(2)
    expect(stats.total).toBe(3)
    expect(stats.pathsDiscarded).toBe(1)
    expect(stats.symbolsUnverified).toBe(1)
  })
})

// ── tools: list_tree ──────────────────────────────────────────────────────────

describe('list_tree', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'scout-tree-'))
    writeFileSync(path.join(tmpDir, 'index.ts'), '', 'utf-8')
    mkdirSync(path.join(tmpDir, 'src'))
    writeFileSync(path.join(tmpDir, 'src', 'foo.ts'), '', 'utf-8')
    mkdirSync(path.join(tmpDir, 'node_modules', 'pkg'), { recursive: true })
    writeFileSync(path.join(tmpDir, 'node_modules', 'pkg', 'index.js'), '', 'utf-8')
  })

  afterEach(() => rmSync(tmpDir, { recursive: true }))

  it('returns files and dirs', () => {
    const entries = list_tree(tmpDir, tmpDir)
    const names = entries.map(e => e.path)
    expect(names).toContain('index.ts')
    expect(names.some(n => n.includes('foo.ts'))).toBe(true)
  })

  it('ignores node_modules', () => {
    const entries = list_tree(tmpDir, tmpDir)
    const names = entries.map(e => e.path)
    expect(names.every(n => !n.includes('node_modules'))).toBe(true)
  })

  it('respects maxDepth=1', () => {
    const entries = list_tree(tmpDir, tmpDir, 1)
    const names = entries.map(e => e.path)
    expect(names).toContain('index.ts')
    expect(names.every(n => !n.includes('foo.ts'))).toBe(true)
  })

  it('throws on path traversal', () => {
    expect(() => list_tree(path.join(tmpDir, '..', '..'), tmpDir)).toThrow('Path traversal')
  })
})

// ── tools: read_file ──────────────────────────────────────────────────────────

describe('read_file', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'scout-read-'))
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join('\n')
    writeFileSync(path.join(tmpDir, 'big.ts'), lines, 'utf-8')
  })

  afterEach(() => rmSync(tmpDir, { recursive: true }))

  it('reads up to 150 lines by default', () => {
    const content = read_file('big.ts', tmpDir)
    const lineCount = content.split('\n').length
    expect(lineCount).toBeLessThanOrEqual(150)
  })

  it('reads a specific range', () => {
    const content = read_file('big.ts', tmpDir, 5, 10)
    expect(content).toContain('line 5')
    expect(content).toContain('line 10')
    expect(content).not.toContain('line 11')
  })

  it('throws for non-existent file', () => {
    expect(() => read_file('nope.ts', tmpDir)).toThrow('no encontrado')
  })

  it('throws on path traversal', () => {
    expect(() => read_file('../../etc/passwd', tmpDir)).toThrow('Path traversal')
  })
})

// ── tools: secret files (read_file/list_tree/grep deny access) ────────────────

describe('secret file exclusion', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'scout-secrets-'))
    writeFileSync(path.join(tmpDir, '.env'), 'DEEPSEEK_API_KEY=sk-fake-secret\n', 'utf-8')
    writeFileSync(path.join(tmpDir, '.env.local'), 'SECRET=fake\n', 'utf-8')
    writeFileSync(path.join(tmpDir, 'server.pem'), 'FAKE PEM CONTENT\n', 'utf-8')
    writeFileSync(path.join(tmpDir, 'credentials.json'), '{"token":"fake"}\n', 'utf-8')
    writeFileSync(path.join(tmpDir, 'id_rsa'), 'FAKE PRIVATE KEY\n', 'utf-8')
    writeFileSync(path.join(tmpDir, 'safe.ts'), 'export const ok = true\n', 'utf-8')
  })

  afterEach(() => rmSync(tmpDir, { recursive: true }))

  it('read_file denies access to .env', () => {
    expect(() => read_file('.env', tmpDir)).toThrow('Acceso denegado')
  })

  it('read_file denies access to .env.local', () => {
    expect(() => read_file('.env.local', tmpDir)).toThrow('Acceso denegado')
  })

  it('read_file denies access to .pem files', () => {
    expect(() => read_file('server.pem', tmpDir)).toThrow('Acceso denegado')
  })

  it('read_file denies access to credentials.json', () => {
    expect(() => read_file('credentials.json', tmpDir)).toThrow('Acceso denegado')
  })

  it('read_file denies access to SSH private keys', () => {
    expect(() => read_file('id_rsa', tmpDir)).toThrow('Acceso denegado')
  })

  it('read_file still allows non-secret files', () => {
    expect(() => read_file('safe.ts', tmpDir)).not.toThrow()
  })

  it('list_tree excludes secret files entirely (not even the name is exposed)', () => {
    const entries = list_tree(tmpDir, tmpDir)
    const names = entries.map(e => e.path)
    expect(names).not.toContain('.env')
    expect(names).not.toContain('.env.local')
    expect(names).not.toContain('server.pem')
    expect(names).not.toContain('credentials.json')
    expect(names).not.toContain('id_rsa')
    expect(names).toContain('safe.ts')
  })

  it('grep never reads or matches inside secret files', () => {
    const matches = grep('fake', '*', tmpDir)
    expect(matches.every(m => !m.path.includes('.env') && !m.path.includes('.pem') && !m.path.includes('credentials') && !m.path.includes('id_rsa'))).toBe(true)
  })
})

// ── tools: grep ──────────────────────────────────────────────────────────────

describe('grep', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'scout-grep-'))
    writeFileSync(path.join(tmpDir, 'a.ts'), 'export function foo() {}\nexport const bar = 1\n', 'utf-8')
    writeFileSync(path.join(tmpDir, 'b.ts'), 'import { foo } from "./a"\nfoo()\n', 'utf-8')
    writeFileSync(path.join(tmpDir, 'c.json'), '{"key": "foo"}\n', 'utf-8')
  })

  afterEach(() => rmSync(tmpDir, { recursive: true }))

  it('finds matches across files', () => {
    const matches = grep('foo', '*.ts', tmpDir)
    expect(matches.length).toBeGreaterThan(0)
    expect(matches.every(m => m.path.endsWith('.ts'))).toBe(true)
  })

  it('respects glob filter', () => {
    const matches = grep('foo', '*.json', tmpDir)
    expect(matches.every(m => m.path.endsWith('.json'))).toBe(true)
  })

  it('returns path, line, text', () => {
    const matches = grep('export function', '*.ts', tmpDir)
    expect(matches[0]).toMatchObject({ path: expect.stringContaining('.ts'), line: expect.any(Number), text: expect.stringContaining('function') })
  })

  it('caps at 50 matches', () => {
    // Create a file with 100 matching lines
    const content = Array.from({ length: 100 }, (_, i) => `const x${i} = 'match'`).join('\n')
    writeFileSync(path.join(tmpDir, 'many.ts'), content, 'utf-8')
    const matches = grep("'match'", '*.ts', tmpDir)
    expect(matches.length).toBeLessThanOrEqual(50)
  })

  it('throws on invalid regex', () => {
    expect(() => grep('[invalid(', '*.ts', tmpDir)).toThrow('inválido')
  })
})

// ── runScout: fallback null ───────────────────────────────────────────────────

describe('runScout fallback', () => {
  it('returns null when SCOUT_ENABLED is not "true"', async () => {
    const { runScout } = await import('./index.js')
    const origEnv = process.env.SCOUT_ENABLED
    process.env.SCOUT_ENABLED = 'false'
    try {
      const intake = {
        ideaText: 'test', target: 'spensiv' as const, classification: 'feature' as const,
        relatedAdrs: [], relatedFeatures: [], relatedBacklogIds: [],
        contextSummary: '', needsArchitect: true,
      }
      const result = await runScout(intake, '/fake', 'F-0001')
      expect(result).toBeNull()
    } finally {
      if (origEnv === undefined) delete process.env.SCOUT_ENABLED
      else process.env.SCOUT_ENABLED = origEnv
    }
  })

  it('returns null when DEEPSEEK_API_KEY is not set', async () => {
    const { runScout } = await import('./index.js')
    const origEnabled = process.env.SCOUT_ENABLED
    const origKey = process.env.DEEPSEEK_API_KEY
    process.env.SCOUT_ENABLED = 'true'
    delete process.env.DEEPSEEK_API_KEY
    try {
      const intake = {
        ideaText: 'test', target: 'spensiv' as const, classification: 'feature' as const,
        relatedAdrs: [], relatedFeatures: [], relatedBacklogIds: [],
        contextSummary: '', needsArchitect: true,
      }
      const result = await runScout(intake, '/fake', 'F-0001')
      expect(result).toBeNull()
    } finally {
      if (origEnabled === undefined) delete process.env.SCOUT_ENABLED
      else process.env.SCOUT_ENABLED = origEnabled
      if (origKey === undefined) delete process.env.DEEPSEEK_API_KEY
      else process.env.DEEPSEEK_API_KEY = origKey
    }
  })
})

// ── runDeepSeekAgent: mocked fetch ────────────────────────────────────────────

describe('runDeepSeekAgent with mocked fetch', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'scout-ds-'))
    writeFileSync(path.join(tmpDir, 'index.ts'), 'export const x = 1\n', 'utf-8')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true })
    vi.restoreAllMocks()
  })

  const VALID_REPORT = {
    objetivo: 'Investigar el repo',
    archivos: ['index.ts'],
    patrones: ['usar exports nombrados'],
    dependencias: ['zod'],
    riesgos: ['ninguno'],
    evidencia: [{ path: 'index.ts', simbolo: 'x', lineas: '1', explicacion: 'constante exportada', confianza: 0.9 }],
    resumen: 'El repo tiene un solo archivo con una constante.',
  }

  it('returns a validated ScoutReport when model responds with final JSON (no tool calls)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: JSON.stringify(VALID_REPORT) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
    }))

    const { runDeepSeekAgent } = await import('./deepseek.js')
    const report = await runDeepSeekAgent({ objetivo: 'Investigar', repoRoot: tmpDir, focus: 'mapa' }, 'test-key', 'F-TEST')

    expect(report.objetivo).toBe('Investigar el repo')
    expect(report.archivos).toContain('index.ts')
  })

  it('handles one round of tool calls before final JSON response', async () => {
    let callCount = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'list_tree', arguments: JSON.stringify({ dir: '.' }) } }],
              },
              finish_reason: 'tool_calls',
            }],
            usage: { prompt_tokens: 80, completion_tokens: 20 },
          }),
        }
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: JSON.stringify(VALID_REPORT) }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 200, completion_tokens: 100 },
        }),
      }
    }))

    const { runDeepSeekAgent } = await import('./deepseek.js')
    const report = await runDeepSeekAgent({ objetivo: 'Investigar', repoRoot: tmpDir, focus: 'detective' }, 'test-key', 'F-TEST')

    expect(callCount).toBe(2)
    expect(report.objetivo).toBe('Investigar el repo')
  })

  it('throws when API returns non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    }))

    const { runDeepSeekAgent } = await import('./deepseek.js')
    await expect(
      runDeepSeekAgent({ objetivo: 'Investigar', repoRoot: tmpDir, focus: 'riesgos' }, 'bad-key', 'F-TEST')
    ).rejects.toThrow('401')
  })

  it('throws when model never produces final JSON within MAX_LOOP_TURNS', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'list_tree', arguments: '{"dir":"."}' } }],
          },
          finish_reason: 'tool_calls',
        }],
        usage: { prompt_tokens: 100, completion_tokens: 10 },
      }),
    }))

    const { runDeepSeekAgent } = await import('./deepseek.js')
    await expect(
      runDeepSeekAgent({ objetivo: 'Investigar', repoRoot: tmpDir, focus: 'mapa' }, 'test-key', 'F-TEST')
    ).rejects.toThrow(/máximo de \d+ turns/)
  })

  it('classifies HTTP 402 explicitly as DeepSeekInsufficientBalanceError, not a generic error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => 'Insufficient Balance',
    }))

    const { runDeepSeekAgent, DeepSeekInsufficientBalanceError } = await import('./deepseek.js')
    await expect(
      runDeepSeekAgent({ objetivo: 'Investigar', repoRoot: tmpDir, focus: 'mapa' }, 'test-key', 'F-TEST')
    ).rejects.toBeInstanceOf(DeepSeekInsufficientBalanceError)
  })

  it('does NOT classify a 402 by substring-matching response text (regression: same class of bug as the 429 false positive)', async () => {
    // A response that happens to mention "402" in its body but has a DIFFERENT real
    // status code must NOT be misclassified — only the actual HTTP status counts.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal error while charging account 402-9911',
    }))

    const { runDeepSeekAgent, DeepSeekInsufficientBalanceError } = await import('./deepseek.js')
    await expect(
      runDeepSeekAgent({ objetivo: 'Investigar', repoRoot: tmpDir, focus: 'mapa' }, 'test-key', 'F-TEST')
    ).rejects.not.toBeInstanceOf(DeepSeekInsufficientBalanceError)
  })
})

// ── fetchDeepSeekBalance ────────────────────────────────────────────────────────

describe('fetchDeepSeekBalance', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('parses is_available and total_balance from balance_infos[0]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        is_available: true,
        balance_infos: [{ currency: 'USD', total_balance: '8.42' }],
      }),
    }))
    const { fetchDeepSeekBalance } = await import('./deepseek.js')
    const balance = await fetchDeepSeekBalance('test-key')
    expect(balance).toEqual({ isAvailable: true, totalBalance: '8.42', currency: 'USD' })
  })

  it('reflects is_available=false when out of balance', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        is_available: false,
        balance_infos: [{ currency: 'USD', total_balance: '0.00' }],
      }),
    }))
    const { fetchDeepSeekBalance } = await import('./deepseek.js')
    const balance = await fetchDeepSeekBalance('test-key')
    expect(balance?.isAvailable).toBe(false)
  })

  it('returns null on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    const { fetchDeepSeekBalance } = await import('./deepseek.js')
    expect(await fetchDeepSeekBalance('bad-key')).toBeNull()
  })

  it('returns null on network error (never throws)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const { fetchDeepSeekBalance } = await import('./deepseek.js')
    await expect(fetchDeepSeekBalance('test-key')).resolves.toBeNull()
  })

  it('returns null when balance_infos is missing or empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ is_available: true, balance_infos: [] }),
    }))
    const { fetchDeepSeekBalance } = await import('./deepseek.js')
    expect(await fetchDeepSeekBalance('test-key')).toBeNull()
  })
})

// ── shouldRunBalanceCheck ────────────────────────────────────────────────────────

describe('shouldRunBalanceCheck', () => {
  it('runs on the first check (lastCheckAtMs=0)', async () => {
    const { shouldRunBalanceCheck } = await import('./deepseek.js')
    expect(shouldRunBalanceCheck(0, Date.now())).toBe(true)
  })

  it('does not run again immediately after a check', async () => {
    const { shouldRunBalanceCheck } = await import('./deepseek.js')
    const now = Date.now()
    expect(shouldRunBalanceCheck(now - 1000, now)).toBe(false)
  })

  it('runs again once the interval has elapsed', async () => {
    const { shouldRunBalanceCheck, BALANCE_CHECK_INTERVAL_MS } = await import('./deepseek.js')
    const now = Date.now()
    expect(shouldRunBalanceCheck(now - BALANCE_CHECK_INTERVAL_MS - 1, now)).toBe(true)
  })

  it('does not run just before the interval elapses', async () => {
    const { shouldRunBalanceCheck, BALANCE_CHECK_INTERVAL_MS } = await import('./deepseek.js')
    const now = Date.now()
    expect(shouldRunBalanceCheck(now - BALANCE_CHECK_INTERVAL_MS + 100, now)).toBe(false)
  })
})

// ── runScout: 402 aborts the other in-flight investigations ────────────────────

describe('runScout with insufficient DeepSeek balance', () => {
  let tmpDir: string
  const origEnabled = process.env.SCOUT_ENABLED
  const origKey = process.env.DEEPSEEK_API_KEY

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'scout-402-'))
    process.env.SCOUT_ENABLED = 'true'
    process.env.DEEPSEEK_API_KEY = 'test-key'
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true })
    vi.restoreAllMocks()
    if (origEnabled === undefined) delete process.env.SCOUT_ENABLED
    else process.env.SCOUT_ENABLED = origEnabled
    if (origKey === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = origKey
    // Defensive: runScout's FEATURES_DIR is the real orchestrator/features/, not
    // relative to tmpDir. Clean up in case a bug ever causes it to write anyway.
    rmSync(path.join('features', 'F-402-TEST.research.md'), { force: true })
    rmSync(path.join('features', 'F-402-TEST.research.json'), { force: true })
  })

  it('returns null and writes no research files when one investigation hits 402 — does not wait for the others to fail independently', async () => {
    let callCount = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, opts) => {
      callCount++
      if (callCount === 1) {
        // First in-flight request: out of balance immediately.
        return Promise.resolve({ ok: false, status: 402, text: async () => 'Insufficient Balance' })
      }
      // The other two: only resolve once aborted (simulates them being cut short
      // instead of independently running their own turns to eventual failure).
      return new Promise((resolve, reject) => {
        const signal = opts?.signal
        if (signal?.aborted) { reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); return }
        signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })
    }))

    const { runScout } = await import('./index.js')
    const intake = {
      ideaText: 'test idea', target: 'sistema' as const, classification: 'feature' as const,
      relatedAdrs: [], relatedFeatures: [], relatedBacklogIds: [],
      contextSummary: '', needsArchitect: true,
    }
    const result = await runScout(intake, tmpDir, 'F-402-TEST')

    expect(result).toBeNull()
    expect(existsSync(path.join('features', 'F-402-TEST.research.md'))).toBe(false)
  })
})
