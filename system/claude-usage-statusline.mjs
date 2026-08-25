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
// Este script hace dos cosas:
//   1. Imprime una línea de estado normal por stdout (lo que Claude Code muestra abajo).
//   2. Escribe un snapshot local (claude-usage-status.local.json, gitignored) con los
//      porcentajes de sesión/semana. orch-sync (orchestrator/src/sync.ts,
//      pushClaudeUsageStatus) lo lee y lo espeja a Supabase en cada tick (~5s), y el
//      dashboard (dashboard/index.html, renderClaudeUsageStatus) lo muestra — mismo
//      patrón que el saldo DeepSeek del Scout (S-034), pero acá no hay API para
//      chequear proactivamente: el dato solo existe cuando Claude Code lo manda.
//
// Nunca debe romper la statusline real de Claude Code: cualquier error cae a una línea
// básica y el script siempre sale con código 0.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_FILE = path.join(__dirname, 'claude-usage-status.local.json')

function readStdin() {
  try {
    return readFileSync(0, 'utf-8')
  } catch {
    return ''
  }
}

function toIso(unixSeconds) {
  if (unixSeconds == null || Number.isNaN(Number(unixSeconds))) return null
  return new Date(Number(unixSeconds) * 1000).toISOString()
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
  const sessionPct = typeof fiveHour?.used_percentage === 'number' ? fiveHour.used_percentage : null
  const weekPct = typeof sevenDay?.used_percentage === 'number' ? sevenDay.used_percentage : null

  // Solo escribimos si hay algo nuevo que decir — si esta versión de Claude Code todavía
  // no manda rate_limits, dejamos el último snapshot bueno intacto en vez de pisarlo con nulls.
  if (sessionPct != null || weekPct != null) {
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

  const modelName = input?.model?.display_name || input?.model?.id || 'Claude'
  const cwd = input?.workspace?.current_dir || input?.cwd || ''
  const dirLabel = cwd ? path.basename(cwd) : ''
  const parts = [modelName]
  if (dirLabel) parts.push(dirLabel)
  if (sessionPct != null) parts.push(`sesión ${Math.round(sessionPct)}%`)
  if (weekPct != null) parts.push(`semana ${Math.round(weekPct)}%`)
  process.stdout.write(parts.join(' · '))
}

try {
  main()
} catch {
  process.stdout.write('Claude')
}
