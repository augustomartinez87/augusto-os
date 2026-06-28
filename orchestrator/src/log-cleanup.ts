// log-cleanup.ts — S-025: rotación de logs en disco + Supabase.
// Umbrales exportados como constantes — ajustar aquí sin tocar la lógica de build.
import { readdirSync, statSync, unlinkSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadState } from './state.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ORCH_DIR = path.join(__dirname, '..')
export const LOGS_DIR = path.join(ORCH_DIR, 'logs')

// Retención Supabase: el dashboard lee siempre .order("ts", desc).limit(60).
// 7 días es generoso y nunca afecta la vista del dashboard bajo ninguna condición.
// (Un run de prueba dejó 18 filas — a escala real escala feo sin límite.)
export const SUPABASE_LOG_RETENTION_DAYS = 7

// Retención disco: 30 días cubre un mes completo de builds.
// Los logs del run activo siempre tienen mtime reciente (nunca alcanzan el umbral);
// además se protegen por featureId como segunda guarda para features muy largas.
export const DISK_LOG_RETENTION_DAYS = 30

// Throttle: el cleanup corre una vez al arrancar sync.ts (lastCleanupAt=0 → diff=Inf)
// y luego cada hora. Sin throttle: 720 ticks/hora × DELETE a Supabase = requests innecesarios.
export const CLEANUP_INTERVAL_MS = 60 * 60 * 1000  // 1 hora

/** Retorna true si debería correr cleanup ahora. Pure — fácil de testear sin side-effects. */
export function shouldRunCleanup(lastCleanupAtMs: number, nowMs = Date.now()): boolean {
  return nowMs - lastCleanupAtMs >= CLEANUP_INTERVAL_MS
}

// ── Disk cleanup ───────────────────────────────────────────────────────────────

export interface DiskCleanupResult {
  deleted: string[]
  skipped: string[]
}

/**
 * Borra .log en disco más viejos que maxAgeMs.
 * Excepciones fijas:
 *   - orchestrator.log: sync.ts mantiene un `logOffset` en memoria que apunta a ese archivo;
 *     borrarlo en medio de un run haría que el offset apunte más allá del nuevo archivo.
 *   - Cualquier archivo que contenga el featureId activo: protege runs muy largos (> retención).
 */
export function cleanDiskLogs(opts: {
  logsDir?: string
  orchDir?: string
  maxAgeMs?: number
  now?: number
  activeFeatureId?: string | null
} = {}): DiskCleanupResult {
  const logsDir = opts.logsDir ?? LOGS_DIR
  const orchDir = opts.orchDir ?? ORCH_DIR
  const maxAgeMs = opts.maxAgeMs ?? DISK_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
  const nowMs = opts.now ?? Date.now()
  const activeFeatureId = opts.activeFeatureId !== undefined
    ? opts.activeFeatureId
    : (loadState()?.featureId ?? null)

  const deleted: string[] = []
  const skipped: string[] = []
  const cutoffMs = nowMs - maxAgeMs

  function tryDelete(filePath: string, name: string): void {
    try {
      const mtime = statSync(filePath).mtimeMs
      if (mtime >= cutoffMs) { skipped.push(name); return }
      if (activeFeatureId && name.includes(activeFeatureId)) { skipped.push(name); return }
      unlinkSync(filePath)
      deleted.push(name)
    } catch { /* archivo ya borrado o bloqueado — no-op */ }
  }

  // logs/F-XXXX-stepN.log
  if (existsSync(logsDir)) {
    for (const f of readdirSync(logsDir)) {
      if (f.endsWith('.log')) tryDelete(path.join(logsDir, f), f)
    }
  }

  // raíz orchestrator/: loop-F-XXXX.log, blocked.log, etc.
  // orchestrator.log siempre se preserva (ver docstring).
  if (existsSync(orchDir)) {
    for (const f of readdirSync(orchDir)) {
      if (!f.endsWith('.log')) continue
      if (f === 'orchestrator.log') { skipped.push(f); continue }
      tryDelete(path.join(orchDir, f), f)
    }
  }

  return { deleted, skipped }
}

// ── Supabase cleanup ───────────────────────────────────────────────────────────

export interface SupabaseCleanupResult {
  deletedRows: number
}

type RestFn = (method: string, q: string, body?: unknown, extra?: Record<string, string>) => Promise<any>

/**
 * Borra filas de orch_logs más viejas que retentionDays.
 * El dashboard usa siempre .order("ts",{ascending:false}).limit(60) → esta limpieza
 * no afecta la vista del dashboard bajo ninguna circunstancia.
 * restFn=null → no-op (degradación cuando Supabase no está configurado).
 */
export async function cleanSupabaseLogs(
  restFn: RestFn | null,
  opts: { retentionDays?: number; now?: number } = {},
): Promise<SupabaseCleanupResult> {
  if (!restFn) return { deletedRows: 0 }
  const days = opts.retentionDays ?? SUPABASE_LOG_RETENTION_DAYS
  const nowMs = opts.now ?? Date.now()
  const cutoff = new Date(nowMs - days * 24 * 60 * 60 * 1000).toISOString()
  try {
    const result = await restFn('DELETE', `orch_logs?ts=lt.${cutoff}`, undefined, {
      Prefer: 'return=representation',
    })
    return { deletedRows: Array.isArray(result) ? result.length : 0 }
  } catch {
    return { deletedRows: 0 }
  }
}
