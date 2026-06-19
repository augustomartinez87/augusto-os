#!/usr/bin/env node
import { existsSync, readFileSync, appendFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse as parseYaml } from 'yaml'
import {
  loadState, saveState, initState, markStepStatus,
  getNextPendingStep, type OrchestratorState,
} from './state.js'
import { planFeature, loadFeatureSpec } from './planner.js'
import { executeStepWithRetry } from './executor.js'
import { runVerifier } from './verifier.js'
import { runQA } from './qa.js'
import { commitStep, createFeatureBranch, createPR } from './git.js'
import { setHumanGate, clearHumanGate, requiresHumanApproval } from './gates.js'
import { log, sleepUntil } from './limits.js'
import { setActiveTarget } from './targets.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FEATURES_DIR = path.join(__dirname, '..', 'features')
const SYSTEM_DIR = path.join(__dirname, '..', '..', 'system')

// ── System memory ─────────────────────────────────────────────────────────────

function readSystemContext(): { mode: string } {
  const statePath = path.join(SYSTEM_DIR, 'OPERATOR_STATE.yaml')
  if (!existsSync(statePath)) return { mode: 'PRODUCT' }
  const raw = readFileSync(statePath, 'utf-8')
  const parsed = parseYaml(raw) ?? {}
  const mode = (parsed.mode ?? 'PRODUCT') as string
  log(`[system] Modo operativo: ${mode}`)
  if (mode === 'SLEEP') {
    log('[system] Modo SLEEP — el loop no interrumpe al operador. Pendientes se registran y continúan.')
  }
  return { mode }
}

function appendProgress(featureId: string, summary: string): void {
  const progressPath = path.join(SYSTEM_DIR, 'PROGRESS.md')
  const timestamp = new Date().toISOString().split('T')[0]
  const entry = `\n## ${timestamp} — ${featureId} completado\n\n${summary}\n`
  appendFileSync(progressPath, entry, 'utf-8')
  log(`[system] PROGRESS.md actualizado`)
}

// ── CLI: approve command ──────────────────────────────────────────────────────

const args = process.argv.slice(2)
if (args[0] === '--approve') {
  const state = loadState()
  if (!state) { console.error('No STATE.json encontrado'); process.exit(1) }
  clearHumanGate(state)
  log(`[main] Gate humano liberado para ${state.featureId}`)
  process.exit(0)
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function main() {
  // Read system context first
  readSystemContext()

  let state = loadState()

  if (!state) {
    const featureId = args[0]
    if (!featureId) {
      console.error('Uso: npm start <featureId>\n  featureId = nombre del archivo en features/ sin .md')
      process.exit(1)
    }
    state = await startFeature(featureId)
  } else {
    // Resuming — re-resolve target from spec
    const specPath = path.join(FEATURES_DIR, `${state.featureId}.md`)
    if (existsSync(specPath)) {
      const spec = readFileSync(specPath, 'utf-8')
      const targetMatch = spec.match(/^target:\s*(.+)$/m)
      const target = targetMatch?.[1]?.trim() ?? 'spensiv'
      setActiveTarget(target)
      log(`[main] Resumiendo feature ${state.featureId} — target: ${target}`)
    }
  }

  await runLoop(state)
}

async function startFeature(featureId: string): Promise<OrchestratorState> {
  const specPath = path.join(FEATURES_DIR, `${featureId}.md`)
  if (!existsSync(specPath)) {
    throw new Error(`Feature spec no encontrada: ${specPath}`)
  }

  const spec = readFileSync(specPath, 'utf-8')

  // parse frontmatter
  const titleMatch = spec.match(/^title:\s*(.+)$/m)
  const title = titleMatch?.[1]?.trim() ?? featureId

  const targetMatch = spec.match(/^target:\s*(.+)$/m)
  const target = targetMatch?.[1]?.trim() ?? 'spensiv'

  // set active target before any repo operations
  setActiveTarget(target)
  log(`[main] Feature ${featureId} — target: ${target}`)

  const branch = await createFeatureBranch(featureId, title)
  const planSteps = await planFeature(spec)
  log(`[main] Feature ${featureId}: ${planSteps.length} pasos planificados`)

  return initState(featureId, branch, planSteps)
}

async function runLoop(state: OrchestratorState) {
  if (state.pausedUntil) {
    const until = new Date(state.pausedUntil)
    if (until > new Date()) {
      await sleepUntil(until)
      state.pausedUntil = null
      saveState(state)
    }
  }

  if (state.needsHumanApproval) {
    log(`[main] Esperando aprobación humana: ${state.needsHumanApproval}`)
    log(`[main] Ejecutá: npm run approve`)
    while (state.needsHumanApproval) {
      await new Promise(r => setTimeout(r, 60_000))
      const fresh = loadState()!
      state = fresh
    }
    log('[main] Aprobación recibida. Continuando...')
  }

  while (true) {
    const step = getNextPendingStep(state)
    if (!step) {
      log(`[main] Feature ${state.featureId} COMPLETO.`)
      const prBody = buildPRBody(state)
      appendProgress(state.featureId, prBody)
      await createPR(
        state.featureId,
        `Feature ${state.featureId} implementado por orquestador`,
        prBody,
      )
      break
    }

    log(`\n[main] === Step ${step.id}/${state.steps.length}: ${step.desc} ===`)

    if (requiresHumanApproval(step.desc)) {
      setHumanGate(state, `Step ${step.id}: ${step.desc}`)
      await runLoop(state)
      return
    }

    markStepStatus(state, step.id, 'running', { sessionId: step.sessionId })

    const execResult = await executeStepWithRetry(
      step,
      state,
      (errors) => errors,
    )

    if (execResult.sessionId) {
      markStepStatus(state, step.id, 'running', { sessionId: execResult.sessionId })
    }

    if (!execResult.ok) {
      step.retries = (step.retries ?? 0) + 1
      if (step.retries >= 3) {
        markStepStatus(state, step.id, 'blocked', { error: execResult.finalError })
        setHumanGate(state, `Step ${step.id} bloqueado tras 3 reintentos: ${execResult.finalError?.slice(0, 200)}`)
        await runLoop(state)
        return
      }
      markStepStatus(state, step.id, 'pending', { retries: step.retries })
      continue
    }

    const verify = await runVerifier()
    if (!verify.ok) {
      log(`[main] Verifier falló en step ${step.id} — reintentando con el error`)
      step.retries = (step.retries ?? 0) + 1
      if (step.retries >= 3) {
        markStepStatus(state, step.id, 'blocked', { error: verify.errors })
        setHumanGate(state, `Step ${step.id} bloqueado: verifier sigue fallando`)
        await runLoop(state)
        return
      }
      markStepStatus(state, step.id, 'pending', { retries: step.retries })
      const fix = await executeStepWithRetry(step, state, () => verify.errors)
      if (!fix.ok) {
        markStepStatus(state, step.id, 'blocked')
        setHumanGate(state, `Step ${step.id}: no pasa verifier`)
        await runLoop(state)
        return
      }
      const verify2 = await runVerifier()
      if (!verify2.ok) {
        markStepStatus(state, step.id, 'blocked', { error: verify2.errors })
        setHumanGate(state, `Step ${step.id}: verifier falla tras corrección`)
        await runLoop(state)
        return
      }
    }

    if (step.ui) {
      const baseUrl = process.env.QA_BASE_URL ?? 'http://localhost:3000'
      const routes = (process.env.QA_ROUTES ?? '/').split(',')
      const qa = await runQA(state.featureId, step.id, baseUrl, routes)
      if (!qa.ok) {
        const isNoServer = qa.errors.every(e => e.startsWith('NO_SERVER:'))
        if (isNoServer) {
          log(`[main] QA visual omitido (sin servidor). Typecheck y lint ya pasaron. Continuar con QA_BASE_URL=<url> para verificación visual.`)
        } else {
          log(`[main] QA falló en step ${step.id} — reintentando`)
          step.retries = (step.retries ?? 0) + 1
          markStepStatus(state, step.id, 'pending', { retries: step.retries })
          if (step.retries >= 3) {
            markStepStatus(state, step.id, 'blocked', { error: qa.errors.join('\n') })
            setHumanGate(state, `Step ${step.id}: QA gate falla — ver screenshots en ${qa.screenshotDir}`)
            await runLoop(state)
            return
          }
          continue
        }
      }
    }

    const sha = await commitStep(step.id, step.desc)
    markStepStatus(state, step.id, 'done', { commit: sha, sessionId: execResult.sessionId })
    log(`[main] Step ${step.id} completado y commiteado (${sha.slice(0, 8)})`)
  }
}

function buildPRBody(state: OrchestratorState): string {
  const stepList = state.steps
    .map(s => `- [x] Step ${s.id}: ${s.desc} (${s.commit?.slice(0, 8) ?? 'N/A'})`)
    .join('\n')
  return `## Feature ${state.featureId}\n\nImplementado automáticamente por el orquestador Tier 1.\n\n### Pasos\n${stepList}\n\n### QA\nScreenshots en \`orchestrator/qa-artifacts/${state.featureId}/\`\n\n> Revisar con Claude in Chrome para validación de UX.`
}

main().catch(err => {
  log(`[main] ERROR FATAL: ${err.message}`)
  process.exit(1)
})
