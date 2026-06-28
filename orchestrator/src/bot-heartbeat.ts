// bot-heartbeat.ts — S-029: señal de vida del proceso bot (bot.ts).
// El loop (index.ts) lee este heartbeat para saber si el bot está corriendo.
// Si está vivo, el loop no pollea getUpdates directamente (evita 409 Conflict).
// Si está caído o nunca arrancó, el loop pollea como fallback.
import { writeFileSync, existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const BOT_HB_PATH = path.join(__dirname, '..', 'BOT_HEARTBEAT.json')

// Bot escribe en cada ciclo de long-poll (~10s por ciclo).
// 30s = 3 ciclos perdidos antes de considerarlo caído.
export const BOT_HB_STALE_MS = 30_000

export interface BotHeartbeat {
  pid: number
  lastHeartbeat: string  // ISO
}

export function writeBotHeartbeat(hbPath = BOT_HB_PATH): void {
  try {
    writeFileSync(hbPath, JSON.stringify({
      pid: process.pid,
      lastHeartbeat: new Date().toISOString(),
    }), 'utf-8')
  } catch { /* never crash the bot */ }
}

export function isBotAlive(hbPath = BOT_HB_PATH, thresholdMs = BOT_HB_STALE_MS): boolean {
  if (!existsSync(hbPath)) return false
  try {
    const raw = JSON.parse(readFileSync(hbPath, 'utf-8'))
    if (typeof raw.lastHeartbeat !== 'string') return false
    return Date.now() - new Date(raw.lastHeartbeat).getTime() < thresholdMs
  } catch { return false }
}
