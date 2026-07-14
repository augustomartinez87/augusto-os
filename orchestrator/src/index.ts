#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  loadState, saveState, initState, markStepStatus, appendFailureHistory,
  getNextPendingStep, getBlockedStep, archiveState, type OrchestratorState, type Step,
} from './state.js'
import { planFeature, loadFeatureSpec } from './planner.js'
import { executeStepWithRetry } from './executor.js'
import { escalateStep } from './escalation.js'
import { runScout } from './scout/index.js'
import { runVerifier, runReleaseChecks } from './verifier.js'
import { runQA } from './qa.js'
import { runReviewer } from './reviewer.js'
import { commitStep, createFeatureBranch, mergeIntoMain, pushMain, getDefaultBranch } from './git.js'
import { setHumanGate, clearHumanGate, requiresHumanApproval } from './gates.js'
import { notifyDeployed, notifyReleaseFailed, notifyStepBlocked, pollApprovalOnce } from './telegram.js'
import { isBotAlive } from './bot-heartbeat.js'
import { log, sleepUntil, probeAvailability } from './limits.js'
import { setActiveTarget, getTargetConfig } from './targets.js'
import { assertNoProdDb } from './db-guard.js'
import { appendAdr, readAdrMeta, type AdrDraft } from './adr.js'
import { appendProgress } from './progress.js'
import { getOperatorState } from './operator-state.js'
import { resolveBacklogId, markBacklogState, clearPick } from './autopilot.js'
import { writeLoopHeartbeat } from './loop-heartbeat.js'
import type { IntakeResult } from './intake.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FEATURES_DIR = path.join(__dirname, '..', 'features')
const SYSTEM_DIR = path.join(__dirname, '..', '..', 'system')

// ── System memory ─────────────────────────────────────────────────────────────

function readSystemContext(): { mode: string } {
  const { mode } = getOperatorState()
  log(`[system] Modo operativo: ${mode}`)
  if (mode === 'SLEEP') {
    log('[system] Modo SLEEP — el loop no interrumpe al operador. Pendientes se registran y continúan.')
  }
  return { mode }
}

// Detecta si un feature ya se ejecutó y finalizó, para no re-planificar y gastar tokens.
function featureAlreadyFinished(featureId: string): string | null {
  // Señal fuerte: STATE archivado = el feature ya se liberó (push/deploy hecho).
  const archived = path.join(__dirname, '..', `STATE.${featureId}.archived.json`)
  if (existsSync(archived)) {
    let when = ''
    try { when = JSON.parse(readFileSync(archived, 'utf-8')).updatedAt ?? '' } catch { /* ignore */ }
    return when ? `liberado el ${when}` : 'liberado (STATE archivado)'
  }
  // Señal secundaria: figura como completado en PROGRESS.md
  const progressPath = path.join(SYSTEM_DIR, 'PROGRESS.md')
  if (existsSync(progressPath) && readFileSync(progressPath, 'utf-8').includes(`${featureId} completado`)) {
    return 'figura como completado en PROGRESS.md'
  }
  return null
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
    // Guard anti-reejecución: si el feature ya finalizó, no re-planificar (gasta tokens).
    const finished = featureAlreadyFinished(featureId)
    if (finished && !args.includes('--force')) {
      log(`[main] ⚠ ${featureId} YA se ejecutó y finalizó (${finished}).`)
      log(`[main] Re-ejecutarlo invoca al planner (Opus) + executor (Sonnet) y gasta tokens sin necesidad.`)
      log(`[main] Si estás seguro de re-ejecutarlo igual: npm start ${featureId} --force`)
      process.exit(0)
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
      assertNoProdDb()
    }
  }

  await runLoop(state)
}

async function loadOrRunScout(featureId: string, target: string, title: string, scoutRoot: string): Promise<string | undefined> {
  const researchPath = path.join(FEATURES_DIR, `${featureId}.research.md`)
  if (existsSync(researchPath)) {
    return readFileSync(researchPath, 'utf-8')
  }
  if (process.env.SCOUT_ENABLED !== 'true') return undefined
  const syntheticIntake: IntakeResult = {
    ideaText: title,
    target: target as IntakeResult['target'],
    classification: 'feature',
    relatedAdrs: [],
    relatedFeatures: [],
    relatedBacklogIds: [],
    contextSummary: `Target: ${target} | Feature: ${featureId}`,
    needsArchitect: false,
  }
  const result = await runScout(syntheticIntake, scoutRoot, featureId)
  return result?.markdown
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

  // guard: abort if dev DB not configured or points to prod
  assertNoProdDb()

  writeLoopHeartbeat(featureId, 'planning')
  const branch = await createFeatureBranch(featureId, title)

  const { getScoutRoot } = await import('./targets.js')
  const research = await loadOrRunScout(featureId, target, title, getScoutRoot())
  if (research) log(`[main] Research del scout cargado para ${featureId} (${research.length} chars)`)

  const planSteps = await planFeature(spec, { research })
  writeLoopHeartbeat(featureId, 'planned')
  log(`[main] Feature ${featureId}: ${planSteps.length} pasos planificados`)

  return initState(featureId, branch, planSteps)
}

/**
 * S-039: cuando retries/verifier/QA/reviewer se agotan, en vez de bloquear directo
 * (haltBlocked / ADR-0019), se escala a un fixer más capaz (Opus, MODEL_FIXER) con el
 * historial completo de fallos del step, en sesión fresca. Si el fixer resuelve el
 * problema (y pasa verifier), el step NUNCA llega a marcarse 'blocked' de cara al
 * usuario — el flujo sigue normal. Solo si el fixer también falla se marca 'blocked'
 * de verdad, se notifica por Telegram (informativo, sin botón) y se continúa el loop
 * sin cortar el proceso — `getNextPendingStep` ya corta limpio cuando no queda más
 * trabajo elegible, sin necesidad de un `return` forzado acá.
 */
async function escalateOrHalt(
  state: OrchestratorState,
  step: Step,
  detail: string,
): Promise<{ ok: boolean; sessionId: string | null; adrBlocks: AdrDraft[] }> {
  log(`[main] Step ${step.id} trabado tras agotar reintentos — escalando a Opus (fixer) antes de bloquear.`)
  log(`[main] Motivo: ${detail}`)

  const result = await escalateStep(step, state, step.failureHistory ?? [])

  if (result.ok) {
    log(`[main] Fixer (Opus) resolvió el step ${step.id} — retomando el flujo normal, sin marcarlo bloqueado.`)
    return { ok: true, sessionId: result.sessionId, adrBlocks: result.adrBlocks }
  }

  const combinedDetail = `${detail}\n\n[fixer también falló] ${result.finalError ?? '(sin detalle)'}`
  markStepStatus(state, step.id, 'blocked', { error: combinedDetail })
  log(`[main] Fixer también falló — step ${step.id} BLOQUEADO de verdad (requiere fix manual).`)
  log(`[main] Corregí el problema y re-ejecutá \`npm start ${state.featureId}\` para reintentar.`)
  await notifyStepBlocked(state.featureId, combinedDetail)
  return { ok: false, sessionId: null, adrBlocks: [] }
}

async function runLoop(state: OrchestratorState) {
  if (state.pausedUntil) {
    const until = new Date(state.pausedUntil)
    if (until > new Date()) {
      const alreadyAvailable = await probeAvailability()
      if (alreadyAvailable) {
        log('[main] Probe de arranque indica disponibilidad — cancelando pausa anticipada.')
        state.pausedUntil = null
        saveState(state)
      } else {
        await sleepUntil(until)
        state.pausedUntil = null
        saveState(state)
      }
    }
  }

  if (state.needsHumanApproval) {
    log(`[main] Esperando aprobación humana: ${state.needsHumanApproval}`)
    log(`[main] Ejecutá: npm run approve  (o aprobá desde Telegram)`)
    let _tgOffset = 0
    while (loadState()?.needsHumanApproval) {
      if (!isBotAlive()) {
        // bot no está corriendo → el loop pollea Telegram directamente como fallback
        const r = await pollApprovalOnce(_tgOffset)
        _tgOffset = r.newOffset
      }
      // si el bot está vivo, él procesa el callback y escribe STATE.json → solo dormimos
      if (loadState()?.needsHumanApproval) await new Promise(res => setTimeout(res, 3_000))
    }
    state = loadState()!
    log('[main] Aprobación recibida. Continuando...')
    // If a step was blocked while waiting (reviewer rejected twice), reset it so the loop retries it.
    const blockedAfterApproval = getBlockedStep(state)
    if (blockedAfterApproval) {
      markStepStatus(state, blockedAfterApproval.id, 'pending')
      state = loadState()!
    }
  }

  while (true) {
    const step = getNextPendingStep(state)
    if (!step) {
      const blocked = getBlockedStep(state)
      if (blocked) {
        log(`[main] Step ${blocked.id} BLOQUEADO — ejecución detenida. Requiere intervención humana.`)
        log(`[main] Error: ${blocked.error ?? '(sin detalle)'}`)
        log(`[main] Restaurá el step a 'pending' en STATE.json y re-ejecutá \`npm start ${state.featureId}\`.`)
        break
      }
      log(`[main] Feature ${state.featureId}: steps COMPLETOS.`)

      // 1. Merge a main (local, una sola vez)
      if (!state.merged) {
        writeLoopHeartbeat(state.featureId, 'merging')
        const baseBranch = getTargetConfig().baseBranch ?? await getDefaultBranch()
        const merged = await mergeIntoMain(state.branch, baseBranch)
        state.merged = merged
        saveState(state)
        if (!merged) {
          log(`[main] Merge automático no aplicado (posible conflicto). Branch ${state.branch} intacta — resolvé y re-corré.`)
          break
        }
        appendProgress(path.join(SYSTEM_DIR, 'PROGRESS.md'), state.featureId, buildPRBody(state))
      }

      // 2. Fase de release: si las verificaciones dan VERDE → push+deploy automático + aviso.
      //    Si FALLAN → NO deploya y avisa el error por Telegram para debuggear.
      if (!state.pushed) {
        writeLoopHeartbeat(state.featureId, 'deploying')
        const checks = await runReleaseChecks()
        if (!checks.ok) {
          log(`[main] RELEASE BLOQUEADO — verificaciones fallaron, NO se deploya:\n${checks.errors.slice(0, 2000)}`)
          void notifyReleaseFailed(state.featureId, checks.errors)
          log(`[main] Arreglá y re-corré \`npm start ${state.featureId}\` para reintentar el release.`)
          break
        }
        log('[main] Verificaciones OK — pusheando main (Vercel deploya prod automáticamente)...')
        const baseBranch = getTargetConfig().baseBranch ?? await getDefaultBranch()
        const ok = await pushMain(baseBranch)
        if (!ok) {
          log('[main] Push falló. main local quedó mergeada; revisá credenciales/remoto y reintentá con `npm start ' + state.featureId + '`.')
          void notifyReleaseFailed(state.featureId, 'El push a main falló (credenciales/remoto). La branch ya está mergeada en main local; reintentá el release.')
          break
        }
        state.pushed = true
        saveState(state)
        void notifyDeployed(state.featureId, checks.tnaNote)
        const autopilotBacklogId = resolveBacklogId(state.featureId)
        if (autopilotBacklogId) {
          markBacklogState(autopilotBacklogId, `done ${new Date().toISOString().split('T')[0]} (autopilot)`)
          clearPick(state.featureId)
        }
      }

      // 3. Cierre
      archiveState(state.featureId)
      const allAdrIds = state.steps.flatMap(s => s.adrIds ?? [])
      if (allAdrIds.length) {
        const metas = readAdrMeta(allAdrIds)
        log(`[adr] ADRs generados en esta feature:`)
        for (const { idStr, titulo, origen } of metas) {
          const flag = origen.includes('Supuesto') ? ' ← REVISAR' : ''
          log(`  ${idStr} — ${titulo} [${origen}]${flag}`)
        }
      }
      log(`[main] ${state.featureId} RELEASED (push hecho). STATE.json archivado como STATE.${state.featureId}.archived.json`)
      break
    }

    log(`\n[main] === Step ${step.id}/${state.steps.length}: ${step.desc} ===`)
    writeLoopHeartbeat(state.featureId, `building:step-${step.id}`)

    if (requiresHumanApproval(step.desc) && !step.humanApproved) {
      setHumanGate(state, `Step ${step.id}: ${step.desc}`)
      // Esperar aprobación inline y marcar el step como aprobado para NO re-gatear
      // el MISMO paso una y otra vez (bug del loop infinito).
      let _tgOff2 = 0
      while (loadState()?.needsHumanApproval) {
        if (!isBotAlive()) {
          const r2 = await pollApprovalOnce(_tgOff2)
          _tgOff2 = r2.newOffset
        }
        if (loadState()?.needsHumanApproval) await new Promise(res => setTimeout(res, 3_000))
      }
      state = loadState()!
      markStepStatus(state, step.id, 'pending', { humanApproved: true })
      log(`[main] Step ${step.id} aprobado — continuando (no se re-gatea)`)
      continue
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

    let sessionId = execResult.sessionId
    let pendingAdrBlocks = execResult.adrBlocks

    if (!execResult.ok) {
      appendFailureHistory(state, step.id, `builder: ${execResult.finalError ?? '(sin detalle)'}`)
      step.retries = (step.retries ?? 0) + 1
      if (step.retries < 3) {
        markStepStatus(state, step.id, 'pending', { retries: step.retries })
        continue
      }
      const esc = await escalateOrHalt(state, step, `Step ${step.id} bloqueado tras 3 reintentos: ${execResult.finalError?.slice(0, 200)}`)
      if (!esc.ok) continue
      sessionId = esc.sessionId
      pendingAdrBlocks = esc.adrBlocks
      markStepStatus(state, step.id, 'running', { sessionId, retries: 0, error: null })
      // el fixer ya corrió el verifier internamente (escalateStep) — seguimos a QA/reviewer
    } else {
      writeLoopHeartbeat(state.featureId, `verifying:step-${step.id}`)
      const verify = await runVerifier()
      if (!verify.ok) {
        log(`[main] Verifier falló en step ${step.id} — reintentando con el error`)
        appendFailureHistory(state, step.id, `verifier: ${verify.errors}`)
        step.retries = (step.retries ?? 0) + 1
        if (step.retries >= 3) {
          const esc = await escalateOrHalt(state, step, `Step ${step.id} bloqueado: verifier sigue fallando`)
          if (!esc.ok) continue
          sessionId = esc.sessionId
          pendingAdrBlocks = esc.adrBlocks
          markStepStatus(state, step.id, 'running', { sessionId, retries: 0, error: null })
        } else {
          markStepStatus(state, step.id, 'pending', { retries: step.retries })
          const fix = await executeStepWithRetry(step, state, () => verify.errors)
          if (!fix.ok) {
            appendFailureHistory(state, step.id, `builder (fix de verifier): ${fix.finalError ?? '(sin detalle)'}`)
            const esc = await escalateOrHalt(state, step, `Step ${step.id}: no pasa verifier`)
            if (!esc.ok) continue
            sessionId = esc.sessionId
            pendingAdrBlocks = esc.adrBlocks
            markStepStatus(state, step.id, 'running', { sessionId, retries: 0, error: null })
          } else {
            sessionId = fix.sessionId
            pendingAdrBlocks = fix.adrBlocks
            const verify2 = await runVerifier()
            if (!verify2.ok) {
              appendFailureHistory(state, step.id, `verifier (post-fix): ${verify2.errors}`)
              const esc = await escalateOrHalt(state, step, `Step ${step.id}: verifier falla tras corrección`)
              if (!esc.ok) continue
              sessionId = esc.sessionId
              pendingAdrBlocks = esc.adrBlocks
              markStepStatus(state, step.id, 'running', { sessionId, retries: 0, error: null })
            }
          }
        }
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
          appendFailureHistory(state, step.id, `QA: ${qa.errors.join('\n')}`)
          step.retries = (step.retries ?? 0) + 1
          if (step.retries >= 3) {
            const esc = await escalateOrHalt(state, step, `Step ${step.id}: QA gate falla — ver screenshots en ${qa.screenshotDir}`)
            if (!esc.ok) continue
            sessionId = esc.sessionId
            pendingAdrBlocks = esc.adrBlocks
            markStepStatus(state, step.id, 'running', { sessionId, retries: 0, error: null })
          } else {
            markStepStatus(state, step.id, 'pending', { retries: step.retries })
            continue
          }
        }
      }
    }

    let review = await runReviewer(step, state)
    if (!review.approved) {
      log(`[reviewer] CHANGES_REQUESTED en step ${step.id}:\n${review.feedback}`)
      appendFailureHistory(state, step.id, `reviewer: ${review.feedback}`)
      step.retries = (step.retries ?? 0) + 1
      if (step.retries >= 3) {
        const esc = await escalateOrHalt(state, step, `Step ${step.id}: Reviewer rechazó el diff 3 veces`)
        if (!esc.ok) continue
        sessionId = esc.sessionId
        pendingAdrBlocks = esc.adrBlocks
        markStepStatus(state, step.id, 'running', { sessionId, retries: 0, error: null })
        // El fixer arregló lo que el reviewer venía rechazando — el reviewer origina
        // esta escalación, así que el diff igual tiene que pasar por él antes de commitear.
        review = await runReviewer(step, state)
        if (!review.approved) {
          markStepStatus(state, step.id, 'blocked', { error: review.feedback })
          await notifyStepBlocked(state.featureId, `Step ${step.id}: reviewer sigue rechazando incluso después de escalar a Opus:\n${review.feedback}`)
          continue
        }
      } else {
        markStepStatus(state, step.id, 'pending', { retries: step.retries })
        const fix = await executeStepWithRetry(step, state, () => review.feedback)
        if (!fix.ok) {
          appendFailureHistory(state, step.id, `builder (fix de review): ${fix.finalError ?? '(sin detalle)'}`)
          const esc = await escalateOrHalt(state, step, `Step ${step.id}: no pasa review tras fix`)
          if (!esc.ok) continue
          sessionId = esc.sessionId
          pendingAdrBlocks = esc.adrBlocks
          markStepStatus(state, step.id, 'running', { sessionId, retries: 0, error: null })
          review = await runReviewer(step, state)
          if (!review.approved) {
            markStepStatus(state, step.id, 'blocked', { error: review.feedback })
            await notifyStepBlocked(state.featureId, `Step ${step.id}: reviewer sigue rechazando incluso después de escalar a Opus:\n${review.feedback}`)
            continue
          }
        } else {
          sessionId = fix.sessionId
          pendingAdrBlocks = fix.adrBlocks
          const verify2 = await runVerifier()
          if (!verify2.ok) {
            appendFailureHistory(state, step.id, `verifier (post-review-fix): ${verify2.errors}`)
            const esc = await escalateOrHalt(state, step, `Step ${step.id}: verifier falla tras corrección de reviewer`)
            if (!esc.ok) continue
            sessionId = esc.sessionId
            pendingAdrBlocks = esc.adrBlocks
            markStepStatus(state, step.id, 'running', { sessionId, retries: 0, error: null })
          }
          review = await runReviewer(step, state)
          if (!review.approved) {
            appendFailureHistory(state, step.id, `reviewer (post-review-fix): ${review.feedback}`)
            const esc = await escalateOrHalt(state, step, `Step ${step.id}: reviewer rechaza tras segunda corrección`)
            if (!esc.ok) continue
            sessionId = esc.sessionId
            pendingAdrBlocks = esc.adrBlocks
            markStepStatus(state, step.id, 'running', { sessionId, retries: 0, error: null })
            review = await runReviewer(step, state)
            if (!review.approved) {
              markStepStatus(state, step.id, 'blocked', { error: review.feedback })
              await notifyStepBlocked(state.featureId, `Step ${step.id}: reviewer sigue rechazando incluso después de escalar a Opus:\n${review.feedback}`)
              continue
            }
          }
        }
      }
    }
    log(`[reviewer] APPROVED step ${step.id}`)

    const sha = await commitStep(step.id, step.desc)

    // Write ADRs emitted by the executor (idempotent: skip if already saved in STATE)
    const adrIds: number[] = []
    if (pendingAdrBlocks.length && !(step.adrIds?.length)) {
      for (const block of pendingAdrBlocks) {
        const id = appendAdr(block, state.featureId, step.id)
        if (id === null) continue
        adrIds.push(id)
        log(`[adr] ADR-${String(id).padStart(4, '0')} registrado (origen: ${block.origen})`)
      }
    }

    markStepStatus(state, step.id, 'done', { commit: sha, sessionId, adrIds })
    log(`[main] Step ${step.id} completado y commiteado (${sha.slice(0, 8)})`)
  }
}

function buildPRBody(state: OrchestratorState): string {
  const stepList = state.steps
    .map(s => `- [x] Step ${s.id}: ${s.desc} (${s.commit?.slice(0, 8) ?? 'N/A'})`)
    .join('\n')

  const allAdrIds = state.steps.flatMap(s => s.adrIds ?? [])
  let adrSection = ''
  if (allAdrIds.length) {
    const metas = readAdrMeta(allAdrIds)
    const lines = metas.map(({ idStr, titulo, origen }) => {
      const badge = origen.includes('Supuesto') ? ' **⚠ REVISAR**' : ''
      return `- ${idStr} — ${titulo} [${origen}]${badge}`
    })
    adrSection = `\n\n### Decisiones (ADR)\n${lines.join('\n')}`
  }

  return `## Feature ${state.featureId}\n\nImplementado automáticamente por el orquestador Tier 1.\n\n### Pasos\n${stepList}${adrSection}\n\n### QA\nScreenshots en \`orchestrator/qa-artifacts/${state.featureId}/\`\n\n> Revisar con Claude in Chrome para validación de UX.`
}

main().catch(err => {
  log(`[main] ERROR FATAL: ${err.message}`)
  process.exit(1)
})
