// loop-heartbeat.ts — S-027: señal de vida del proceso de build (index.ts).
// sync.ts emite su propio heartbeat cada 5s (control plane alive); este módulo
// permite que index.ts emita el suyo propio para que se pueda distinguir
// "sync vivo pero loop colgado" de "loop realmente trabajando".
// Archivo: LOOP_HEARTBEAT.json en el mismo dir que STATE.json y AUTOPILOT.lock.
import { writeFileSync, existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const LOOP_HB_PATH = path.join(__dirname, '..', 'LOOP_HEARTBEAT.json')

// Umbral de liveness para el lock: si el heartbeat es más viejo que esto,
// el proceso se considera muerto o colgado. Debe ser > CUELGUE_SEC (120s de ADR-0032)
// para que la detección de cuelgue del dashboard dispare antes de que el lock sea reclamable.
export const LOOP_HB_STALE_MS = 3 * 60 * 1000  // 3 min

export interface LoopHeartbeat {
  featureId: string
  pid: number
  phase: string    // 'planning' | 'planned' | 'building:step-N' | 'verifying:step-N' | 'merging' | 'deploying'
  lastHeartbeat: string  // ISO
}

export function writeLoopHeartbeat(featureId: string, phase: string, hbPath = LOOP_HB_PATH): void {
  try {
    writeFileSync(hbPath, JSON.stringify({
      featureId,
      pid: process.pid,
      phase,
      lastHeartbeat: new Date().toISOString(),
    }), 'utf-8')
  } catch { /* never crash the loop */ }
}

export function readLoopHeartbeat(hbPath = LOOP_HB_PATH): LoopHeartbeat | null {
  if (!existsSync(hbPath)) return null
  try {
    const raw = JSON.parse(readFileSync(hbPath, 'utf-8'))
    if (
      typeof raw.featureId === 'string' &&
      typeof raw.pid === 'number' &&
      typeof raw.phase === 'string' &&
      typeof raw.lastHeartbeat === 'string'
    ) return raw as LoopHeartbeat
    return null
  } catch { return null }
}

export function isLoopHeartbeatFresh(hb: LoopHeartbeat | null, thresholdMs = LOOP_HB_STALE_MS): boolean {
  if (!hb) return false
  return Date.now() - new Date(hb.lastHeartbeat).getTime() < thresholdMs
}
