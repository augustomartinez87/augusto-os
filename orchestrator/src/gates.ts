import { appendFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { saveState, type OrchestratorState } from './state.js'
import { log } from './limits.js'
import { notifyGate } from './telegram.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const BLOCKED_LOG = path.join(__dirname, '..', 'blocked.log')

const HUMAN_GATE_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'prisma-migrate', regex: /prisma\s+migrate(?!\s+status)/i },
  { label: 'prisma-db-push', regex: /prisma\s+db\s+push/i },
  { label: 'vercel-deploy', regex: /vercel\s+deploy/i },
  { label: 'vercel-cli', regex: /^vercel\b/i },
  { label: 'drop-table', regex: /DROP\s+TABLE/i },
  { label: 'truncate', regex: /TRUNCATE/i },
  { label: 'delete-without-where', regex: /DELETE\s+FROM\s+\w+\s*(?:;|$)/i },
  { label: 'push-main', regex: /git\s+push[^"]*\s+(?:origin\s+)?main\b/i },
  { label: 'mutuo-pagare', regex: /mutuo|pagar[eé]/i },
]

export function checkHumanGate(command: string): { blocked: boolean; label?: string } {
  for (const { label, regex } of HUMAN_GATE_PATTERNS) {
    if (regex.test(command)) {
      return { blocked: true, label }
    }
  }
  return { blocked: false }
}

export function logBlocked(command: string, label: string): void {
  const line = `[${new Date().toISOString()}] BLOCKED(${label}): ${command.slice(0, 200)}`
  appendFileSync(BLOCKED_LOG, line + '\n', 'utf-8')
  log(`[gates] BLOQUEADO (${label}): requiere aprobación humana`)
}

export function requiresHumanApproval(_stepDesc: string): boolean {
  // Política (jun 2026): los gates por-step se AUTO-APRUEBAN — Augusto no revisa
  // steps a nivel técnico. La protección real está en el db-guard (anti-prod), el
  // hook de comandos (checkHumanGate bloquea prisma/deploy/drop/truncate REALES en
  // ejecución) y el verifier. El deploy a prod se maneja aparte: auto-deploy en
  // verde + aviso por Telegram; si falla, no deploya y avisa el error.
  return false
}

export function setHumanGate(state: OrchestratorState, detail: string): void {
  state.needsHumanApproval = detail
  saveState(state)
  log(`\n[gates] *** PAUSA: requiere aprobación humana ***`)
  log(`[gates] Detalle: ${detail}`)
  log(`[gates] Ejecutá: npm run approve  (o aprobá desde Telegram)`)
  // Aviso por Telegram (no-op si no hay credenciales). Fire-and-forget, nunca rompe el loop.
  void notifyGate(detail, state.featureId)
}

export function clearHumanGate(state: OrchestratorState): void {
  state.needsHumanApproval = null
  saveState(state)
}
