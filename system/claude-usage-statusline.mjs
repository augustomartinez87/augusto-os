#!/usr/bin/env node
// system/claude-usage-statusline.mjs — S-048
//
// Hook statusLine de Claude Code (~/.claude/settings.json → statusLine.command). Corre en
// CUALQUIER sesión de Claude Code de esta máquina (no solo augusto-os) en cada turno de la
// conversación. Claude Code le manda por stdin un JSON con, entre otras cosas,
// rate_limits.five_hour / rate_limits.seven_day (Claude Code >=1.2.80) — no hay API pública
// equivalente para cuentas Free/Pro/Max (ver system/CLAUDE-USAGE-HANDOFF.md, ahí está
// documentada la investigación completa de por qué se eligió este approach).
//
// Augusto ya tenía un statusLine propio configurado (spacecake, ver ORIGINAL_STATUSLINE_CMD
// abajo) que dibuja la línea de estado que se ve en la terminal. Para no pisarlo, este script
// hace de wrapper: lee el JSON UNA vez, guarda el snapshot de uso que necesita el dashboard, y
// después re-ejecuta el comando original pasándole el mismo stdin — lo que se ve en la
// terminal queda exactamente igual que antes. Si el comando original no existe o falla, cae a
// una línea básica propia en vez de dejar la statusline en blanco.
//
// Qué hace con el snapshot:
//   Escribe claude-usage-status.local.json (gitignored) con los % de sesión/semana.
//   orch-sync (orchestrator/src/sync.ts, pushClaudeUsageStatus) lo lee y lo espeja a Supabase
//   en cada tick (~5s), y el dashboard (dashboard/index.html, renderClaudeUsageStatus) lo
//   muestra — mismo patrón que el saldo DeepSeek del Scout (S-034), pero acá no hay API para
//   chequear proactivamente: el dato solo existe cuando Claude Code lo manda.
//
// Nunca debe romper la statusline real de Claude Code: cualquier error cae a una línea básica
// y el script siempre sale con código 0.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_FILE = path.join(__dirname, 'claude-usage-status.local.json')

// El statusLine que ya tenías configurado antes de esto (spacecake). Se sigue llamando
// siempre que exista, así la línea que ves en la terminal no cambia. Si el día de mañana
// cambiás/desinstalás spacecake, esta constante es lo único que hay que tocar acá.
const ORIGINAL_STATUSLINE_CMD = 'C:\\Users\\Augusto\\.spacecake\\.app\\hooks\\statusline.cmd'

function readStdin() {
  try {
    const text = readFileSync(0, 'utf-8')
    // Algunos invocadores (p.ej. pipes de PowerShell) anteponen un BOM UTF-8 al string —
    // rompe JSON.parse si no se lo saca antes.
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  } catch {
    return ''
  }
}

function toIso(unixSeconds) {
  if (unixSeconds == null || Number.isNaN(Number(unixSeconds))) return null
  return new Date(Number(unixSeconds) * 1000).toISOString()
}

function saveSnapshot(fiveHour, sevenDay) {
  const sessionPct = typeof fiveHour?.used_percentage === 'number' ? fiveHour.used_percentage : null
  const weekPct = typeof sevenDay?.used_percentage === 'number' ? sevenDay.used_percentage : null
  // Solo escribimos si hay algo nuevo que decir — si esta versión de Claude Code todavía no
  // manda rate_limits, dejamos el último snapshot bueno intacto en vez de pisarlo con nulls.
  if (sessionPct == null && weekPct == null) return
  try {
    mkdirSync(__dirname, { recursive: true })
    writeFileSync(
      OUT_FILE,
      JSON.stringify(
        {
          sessionPct,
          sessionResetsAt: toIso(fiveHour?.resets_at),
          weekPct,
          weekResetsAt: toIso(sevenDay?.resets_at),
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      'utf-8'
    )
  } catch {
    /* nunca tumbar la statusline por un fallo de escritura en disco */
  }
}

// Delega la línea visible al comando original (spacecake), pasándole el mismo stdin que
// recibimos nosotros. Devuelve su stdout si salió bien, o null si no se pudo (comando
// ausente, timeout, exit code != 0) — timeout corto a propósito: la statusline de Claude
// Code se recalcula todo el tiempo, no puede quedar colgada esperando un proceso hijo.
function runOriginalStatusline(raw) {
  try {
    const result = spawnSync(ORIGINAL_STATUSLINE_CMD, [], {
      input: raw,
      encoding: 'utf-8',
      shell: true,
      timeout: 5000,
    })
    if (result.status === 0 && result.stdout) return result.stdout
    return null
  } catch {
    return null
  }
}

function fallbackLine(input, sessionPct, weekPct) {
  const modelName = input?.model?.display_name || input?.model?.id || 'Claude'
  const cwd = input?.workspace?.current_dir || input?.cwd || ''
  const dirLabel = cwd ? path.basename(cwd) : ''
  const parts = [modelName]
  if (dirLabel) parts.push(dirLabel)
  if (sessionPct != null) parts.push(`sesión ${Math.round(sessionPct)}%`)
  if (weekPct != null) parts.push(`semana ${Math.round(weekPct)}%`)
  return parts.join(' · ')
}

function main() {
  const raw = readStdin()
  let input = {}
  try {
    input = raw ? JSON.parse(raw) : {}
  } catch {
    input = {}
  }

  const fiveHour = input?.rate_limits?.five_hour
  const sevenDay = input?.rate_limits?.seven_day
  saveSnapshot(fiveHour, sevenDay)

  const original = runOriginalStatusline(raw)
  if (original != null) {
    process.stdout.write(original)
    return
  }

  const sessionPct = typeof fiveHour?.used_percentage === 'number' ? fiveHour.used_percentage : null
  const weekPct = typeof sevenDay?.used_percentage === 'number' ? sevenDay.used_percentage : null
  process.stdout.write(fallbackLine(input, sessionPct, weekPct))
}

try {
  main()
} catch {
  process.stdout.write('Claude')
}
