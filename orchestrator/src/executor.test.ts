import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildRestriccionesAbsolutas, executeStep, executeStepWithRetry, MAX_RETRIES } from './executor.js'
import { execa } from 'execa'
import { handleUsageLimit } from './limits.js'
import type { Step, OrchestratorState } from './state.js'

// ── mocks (hoisted by vitest) ──────────────────────────────────────────────────
vi.mock('./state.js', () => ({ saveState: vi.fn() }))
vi.mock('./targets.js', () => ({
  getRepoRoot: vi.fn(() => '/tmp/test-repo'),
  getActiveTargetName: vi.fn(() => 'sistema'),
  getTargetConfig: vi.fn(() => ({ stack: 'node+tsx+vitest', dbModel: 'none' })),
}))
vi.mock('./db-guard.js', () => ({ getDbEnvOverride: vi.fn(() => ({})) }))
vi.mock('./metrics.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./metrics.js')>()
  return { ...mod, recordInvocation: vi.fn() }
})
vi.mock('execa', () => ({ execa: vi.fn() }))
vi.mock('fs', () => ({
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  existsSync: vi.fn(() => false),
}))
// Keep isUsageLimitError / isContextWindowError real; mock side-effectful functions.
vi.mock('./limits.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./limits.js')>()
  return {
    ...mod,
    log: vi.fn(),
    handleUsageLimit: vi.fn(),
    exponentialBackoff: vi.fn(),
  }
})

// ── helpers ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeExecaResult(output: string, exitCode = 0): any {
  return { all: output, stdout: output, stderr: '', exitCode }
}

const STEP: Step = {
  id: 9,
  desc: 'Implementar detector de usage limit',
  status: 'running',
  commit: null,
  sessionId: null,
  retries: 0,
  ui: false,
  adrIds: [],
  humanApproved: false,
  failureHistory: [],
}

const STATE: OrchestratorState = {
  featureId: 'F-0065',
  branch: 'feat/F-0065',
  steps: [STEP],
  pausedUntil: null,
  needsHumanApproval: null,
  createdAt: '2026-09-29T00:00:00.000Z',
  updatedAt: '2026-09-29T00:00:00.000Z',
  merged: false,
  pushed: false,
}

afterEach(() => {
  vi.clearAllMocks()
})

// ── buildRestriccionesAbsolutas ────────────────────────────────────────────────

const LINEAS_COMUNES = [
  'NO corras "prisma migrate", "prisma db push", ni SQL destructivo.',
  'NO deployés a Vercel.',
  'NO toques main branch ni archivos de mutuo/pagaré.',
  'La TNA/tasa NUNCA debe mostrarse en vistas de prestatario.',
]

const FIXTURE_PRISMA = `RESTRICCIONES ABSOLUTAS:
- NO corras "prisma migrate", "prisma db push", ni SQL destructivo.
- NO deployés a Vercel.
- NO toques main branch ni archivos de mutuo/pagaré.
- La TNA/tasa NUNCA debe mostrarse en vistas de prestatario.
- Columnas en camelCase sin @map en Prisma.
- Para conocer modelos y campos del schema, leé prisma/schema.prisma del repo. NUNCA consultes la DB en vivo (DATABASE_URL apunta a producción directamente).`

describe('buildRestriccionesAbsolutas', () => {
  it("caso 'prisma' — texto idéntico al fixture histórico (byte a byte)", () => {
    expect(buildRestriccionesAbsolutas('prisma')).toBe(FIXTURE_PRISMA)
  })

  it("caso undefined — equivalente a 'prisma' (default histórico)", () => {
    expect(buildRestriccionesAbsolutas(undefined)).toBe(FIXTURE_PRISMA)
  })

  it("caso 'none' — sin menciones a Prisma", () => {
    const result = buildRestriccionesAbsolutas('none')
    expect(result).not.toContain('Prisma')
    expect(result).not.toContain('prisma/schema.prisma')
  })

  it("caso 'none' — contiene restricciones de Supabase", () => {
    const result = buildRestriccionesAbsolutas('none')
    expect(result).toContain('supabase/migrations/')
    expect(result).toContain('NUNCA consultes la DB en vivo')
  })

  it('las cuatro líneas comunes están presentes en todos los casos', () => {
    for (const dbModel of ['prisma', 'none', undefined] as const) {
      const result = buildRestriccionesAbsolutas(dbModel)
      for (const linea of LINEAS_COMUNES) {
        expect(result, `dbModel=${String(dbModel)} debe contener: ${linea}`).toContain(linea)
      }
    }
  })
})

// ── executeStep — verificación cruzada del builder con el detector nuevo ───────
// Estos tests confirman que el pipeline del builder delega correctamente en
// isUsageLimitError: los falsos positivos (is_error:false) no pausan, y el
// texto puro de session-limit sí activa el flag usageLimit.

describe('executeStep — falsos positivos del detector NO pausan al builder', () => {
  it('NO pausa cuando is_error:false con "rate limit" en el campo result', async () => {
    const output = JSON.stringify({
      type: 'result',
      is_error: false,
      result: 'Implemented rate limit checker for the API',
    })
    vi.mocked(execa).mockResolvedValue(fakeExecaResult(output, 0))

    const result = await executeStep(STEP, STATE)

    expect(result.usageLimit).toBe(false)
    expect(result.ok).toBe(true)
  })

  it('NO pausa cuando is_error:false con 0.429 en total_cost_usd', async () => {
    const output = JSON.stringify({
      type: 'result',
      is_error: false,
      total_cost_usd: 0.429,
      result: 'ok',
    })
    vi.mocked(execa).mockResolvedValue(fakeExecaResult(output, 0))

    const result = await executeStep(STEP, STATE)

    expect(result.usageLimit).toBe(false)
    expect(result.ok).toBe(true)
  })
})

describe('executeStep — session-limit en texto puro SÍ detecta límite', () => {
  it('pausa cuando el output es texto con "session limit" sin JSON de resultado', async () => {
    const output = "You've hit your session limit · resets 4:40pm"
    vi.mocked(execa).mockResolvedValue(fakeExecaResult(output, 1))

    const result = await executeStep(STEP, STATE)

    expect(result.usageLimit).toBe(true)
    expect(result.ok).toBe(false)
  })
})

// ── executeStepWithRetry — session-limit no consume el intento ─────────────────

describe('executeStepWithRetry — session-limit pausa sin consumir attempt', () => {
  // Discriminador real del invariante `attempt--` (executor.ts:233): MAX_RETRIES
  // límites CONSECUTIVOS seguidos de un éxito. Un solo `limit → ok` NO sirve — con o
  // sin el decremento retorna ok:true (2 ≤ MAX_RETRIES), así que no atrapa la
  // regresión. Con ≥ MAX_RETRIES límites:
  //   • con `attempt--`: ningún límite consume intento → corre el éxito final → ok:true,
  //     execa llamado MAX_RETRIES+1 veces.
  //   • sin `attempt--`: los MAX_RETRIES límites agotan el for → se sale antes del
  //     éxito → ok:false, execa llamado solo MAX_RETRIES veces. El test falla.
  it('MAX_RETRIES límites consecutivos + éxito → ok:true (el límite no descuenta intentos)', async () => {
    const limitOutput = "You've hit your session limit"
    const successOutput = JSON.stringify({ type: 'result', is_error: false, result: 'done' })

    let mock = vi.mocked(execa)
    for (let i = 0; i < MAX_RETRIES; i++) {
      mock = mock.mockResolvedValueOnce(fakeExecaResult(limitOutput, 1))
    }
    mock.mockResolvedValueOnce(fakeExecaResult(successOutput, 0))

    const result = await executeStepWithRetry(STEP, STATE, (e) => e)

    expect(result.ok).toBe(true)
    expect(vi.mocked(execa)).toHaveBeenCalledTimes(MAX_RETRIES + 1)
    expect(vi.mocked(handleUsageLimit)).toHaveBeenCalledTimes(MAX_RETRIES)
  })

  it('un fallo real sí consume el intento — no es un limit (no regresión)', async () => {
    // Exit 1 sin texto de session-limit: fallo real, no limit.
    const failOutput = 'TypeScript error: cannot find name "foo"'
    vi.mocked(execa).mockResolvedValue(fakeExecaResult(failOutput, 1))

    const result = await executeStepWithRetry(STEP, STATE, (e) => e)

    expect(result.ok).toBe(false)
    // MAX_RETRIES intentos reales consumidos, handleUsageLimit nunca llamado
    expect(vi.mocked(handleUsageLimit)).not.toHaveBeenCalled()
    expect(vi.mocked(execa)).toHaveBeenCalledTimes(3) // MAX_RETRIES = 3
  })
})
