import { appendFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { saveState, type OrchestratorState } from './state.js'
import { log } from './limits.js'

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

export function requiresHumanApproval(stepDesc: string): boolean {
  return HUMAN_GATE_PATTERNS.some(({ regex }) => regex.test(stepDesc))
}

export function setHumanGate(state: OrchestratorState, detail: string): void {
  state.needsHumanApproval = detail
  saveState(state)
  log(`\n[gates] *** PAUSA: requiere aprobación humana ***`)
  log(`[gates] Detalle: ${detail}`)
  log(`[gates] Ejecutá: npm run approve`)
}

export function clearHumanGate(state: OrchestratorState): void {
  state.needsHumanApproval = null
  saveState(state)
}
