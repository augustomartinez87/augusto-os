// src/telegram.ts — S-006: aprobar/rechazar gates y mandar ideas desde Telegram.
// Sin dependencias: usa fetch nativo contra la Bot API. Degradación total:
// si falta TELEGRAM_BOT_TOKEN/CHAT_ID, todo es no-op y el sistema sigue con `npm run approve`.

import { appendFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadState, saveState } from './state.js'
import { log } from './limits.js'
import { getOperatorState, type OperatorMode, type ResponseStyle, type OperatorState } from './operator-state.js'
import { writeBotHeartbeat } from './bot-heartbeat.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const INBOX = path.join(__dirname, '..', '..', 'system', 'FEATURE-INTAKE.md')
const BLOCKED_LOG = path.join(__dirname, '..', 'blocked.log')

// Lazy getters — read env at call time so tests can stub TELEGRAM_BOT_TOKEN
function getApi(): string | null {
  const t = process.env.TELEGRAM_BOT_TOKEN
  return t ? `https://api.telegram.org/bot${t}` : null
}
function getDefaultChatId(): string | undefined {
  return process.env.TELEGRAM_CHAT_ID
}

async function tg(method: string, body: Record<string, unknown>): Promise<any> {
  const api = getApi()
  if (!api) return null
  const res = await fetch(`${api}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

function allowed(id: unknown): boolean {
  const chatId = getDefaultChatId()
  return chatId != null && chatId !== '' && String(id) === String(chatId)
}

// ── Internal helpers ───────────────────────────────────────────────────────────

type SendFn = typeof tg

// Injected only in tests: overrides getOperatorState and the transport layer.
interface TgDeps {
  getState?: () => OperatorState
  send?: SendFn
  chatId?: string
}

function pickText(full: string, short: string, mode: OperatorMode, style: ResponseStyle): string {
  return mode === 'OFFICE' && style === 'short' ? short : full
}

/** Sends text with retry. Accepts optional test deps to inject send/chatId. */
async function tgSendRetry(text: string, deps?: Pick<TgDeps, 'send' | 'chatId'>): Promise<void> {
  if (!deps?.send && (!getApi() || !getDefaultChatId())) return
  const send = deps?.send ?? tg
  const chatId = deps?.chatId ?? getDefaultChatId()
  const body = { chat_id: chatId!, text }
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const r = await send('sendMessage', body)
      if (r?.ok) return
    } catch (e) {
      log(`[telegram] intento ${attempt}/5 de avisar falló: ${(e as Error).message}`)
    }
    await new Promise((res) => setTimeout(res, 2000))
  }
  log('[telegram] no se pudo enviar el aviso tras 5 intentos.')
}

// ── Public notification functions ──────────────────────────────────────────────

/** Llamado por gates.ts cuando el loop pausa en un gate humano. No-op si no hay credenciales. */
export async function notifyGate(detail: string, featureId: string, _deps?: TgDeps): Promise<void> {
  const { mode, responseStyle } = (_deps?.getState ?? getOperatorState)()

  if (mode === 'SLEEP') {
    log(`[telegram] SLEEP — notificación suprimida: gate ${featureId}`)
    return
  }

  if (!_deps?.send && (!getApi() || !getDefaultChatId())) return

  const send = _deps?.send ?? tg
  const chatId = _deps?.chatId ?? getDefaultChatId()

  const fullText = `🔔 Gate de *${featureId}*\n\n${detail}`
  const shortText = `🔔 Gate *${featureId}* — ${detail.split('\n')[0]}`
  const text = pickText(fullText, shortText, mode, responseStyle)

  const body = {
    chat_id: chatId!,
    text,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Aprobar', callback_data: `approve:${featureId}` },
        { text: '🚫 Rechazar', callback_data: `reject:${featureId}` },
      ]],
    },
  }
  // El aviso del gate es crítico (es tu única vía para aprobar desde el celu):
  // reintenta ante cortes de red transitorios en vez de perderse en el primer fallo.
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const r = await send('sendMessage', body)
      if (r?.ok) return
    } catch (e) {
      log(`[telegram] intento ${attempt}/5 de avisar el gate falló: ${(e as Error).message}`)
    }
    await new Promise((res) => setTimeout(res, 2000))
  }
  log('[telegram] no se pudo avisar el gate tras 5 intentos — usá `npm run approve` para este.')
}

/** Aviso de deploy exitoso a prod (auto-deploy en verde). */
export async function notifyDeployed(featureId: string, tnaNote?: string, _deps?: TgDeps): Promise<void> {
  const { mode, responseStyle } = (_deps?.getState ?? getOperatorState)()

  if (mode === 'SLEEP') {
    log(`[telegram] SLEEP — notificación suprimida: deployed ${featureId}`)
    return
  }

  const full = `✅ ${featureId} deployado a prod.\nVerificación OK: typecheck + lint + tests + build.${tnaNote ? `\n${tnaNote}` : ''}`
  const short = `✅ ${featureId} deployado`
  await tgSendRetry(pickText(full, short, mode, responseStyle), _deps)
}

/**
 * Aviso informativo de step bloqueado (ADR-0019: sin gates por-step). NO pide
 * aprobación, no tiene botones — el loop ya cortó y requiere fix manual + re-run.
 */
export async function notifyStepBlocked(featureId: string, detail: string, _deps?: TgDeps): Promise<void> {
  const { mode, responseStyle } = (_deps?.getState ?? getOperatorState)()

  if (mode === 'SLEEP') {
    log(`[telegram] SLEEP — notificación suprimida: step blocked ${featureId}`)
    return
  }

  const clip = detail.length > 1400 ? detail.slice(0, 1400) + '…' : detail
  const full = `⛔ ${featureId} — step bloqueado (fix manual + \`npm start ${featureId}\` para reintentar):\n\n${clip}`
  const short = `⛔ ${featureId} — step bloqueado`
  await tgSendRetry(pickText(full, short, mode, responseStyle), _deps)
}

/** Aviso de release fallido — NO se deployó. Manda el error para debuggear. */
export async function notifyReleaseFailed(featureId: string, errors: string, _deps?: TgDeps): Promise<void> {
  const { mode, responseStyle } = (_deps?.getState ?? getOperatorState)()

  if (mode === 'SLEEP') {
    log(`[telegram] SLEEP — notificación suprimida: release failed ${featureId}`)
    return
  }

  const clip = errors.length > 1400 ? errors.slice(0, 1400) + '…' : errors
  const full = `❌ ${featureId} NO se deployó — falló la verificación:\n\n${clip}\n\nRevisalo conmigo o con quien corresponda.`
  const short = `❌ ${featureId} NO se deployó`
  await tgSendRetry(pickText(full, short, mode, responseStyle), _deps)
}

/** Limpia el gate en STATE.json — equivalente a `npm run approve`. El loop (que pollea STATE) reanuda solo. */
function approveGate(featureId?: string): string {
  const s = loadState()
  if (!s) return 'No hay STATE.json activo.'
  if (!s.needsHumanApproval) return 'No hay ningún gate pendiente.'
  if (featureId && s.featureId !== featureId) return `El gate de ${featureId} ya no es el actual (ahora: ${s.featureId}).`
  s.needsHumanApproval = null
  saveState(s)
  return `Aprobado ✅ — ${s.featureId} continúa.`
}

const MENU =
  'AlantORCH — control del orquestador.\n\n' +
  '• /idea <texto> — anota una idea al backlog. Ej: /idea agregar export CSV a Kredy\n' +
  '• Cuando el loop necesite tu OK, te llega un mensaje con ✅ Aprobar / 🚫 Rechazar.\n\n' +
  '(Cualquier otro texto no hace nada — usá /idea para no perder nada.)'

async function handleText(t: string): Promise<void> {
  const chatId = getDefaultChatId()
  if (!chatId) return
  if (t === '/start' || t === '/help') {
    await tg('sendMessage', { chat_id: chatId, text: MENU })
    return
  }
  if (t.toLowerCase().startsWith('/idea')) {
    const idea = t.slice(5).trim()
    if (!idea) {
      await tg('sendMessage', { chat_id: chatId, text: 'Mandá /idea seguido de tu idea. Ej: /idea agregar export CSV a Kredy' })
      return
    }
    saveIdea(idea)
    await tg('sendMessage', { chat_id: chatId, text: 'Idea anotada 📝 (FEATURE-INTAKE.md)' })
    return
  }
  await tg('sendMessage', { chat_id: chatId, text: '¿Qué querés hacer? Para anotar una idea: /idea <tu idea>. Cuando haya algo para aprobar, te aviso yo. /help para ver las opciones.' })
}

function logReject(featureId: string): void {
  appendFileSync(BLOCKED_LOG, `[${new Date().toISOString()}] REJECT(telegram): ${featureId}\n`, 'utf-8')
}

function saveIdea(text: string): void {
  appendFileSync(INBOX, `\n- [${new Date().toISOString()}] (telegram) ${text}`, 'utf-8')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Hace un único ciclo de long-poll (timeout=5s) y procesa callbacks de
 * aprobar/rechazar. Llamado desde el gate-wait del loop principal — no requiere
 * que `npm run bot` esté corriendo en paralelo. Si no hay credenciales configuradas
 * es no-op, por lo que `npm run approve` sigue siendo el camino de fallback.
 */
export async function pollApprovalOnce(
  offset: number,
  deps?: Pick<TgDeps, 'send' | 'chatId'>,
): Promise<{ newOffset: number }> {
  const send = deps?.send ?? tg
  const effectiveChatId = deps?.chatId ?? getDefaultChatId()
  if (!deps?.send && !getApi()) return { newOffset: offset }

  try {
    const data = await send('getUpdates', { offset, timeout: 5 })
    if (!data?.ok || !Array.isArray(data.result)) return { newOffset: offset }

    let newOffset = offset
    for (const upd of data.result) {
      newOffset = upd.update_id + 1
      if (!upd.callback_query) continue
      const cq = upd.callback_query
      if (!effectiveChatId || String(cq.from?.id) !== String(effectiveChatId)) continue
      const [action, featureId] = String(cq.data ?? '').split(':')
      let answer = ''
      if (action === 'approve') answer = approveGate(featureId)
      else if (action === 'reject') { logReject(featureId ?? ''); answer = 'Rechazado — el gate queda en pausa.' }
      if (answer) {
        await send('answerCallbackQuery', { callback_query_id: cq.id, text: answer })
        await send('sendMessage', { chat_id: effectiveChatId, text: answer })
      }
    }
    return { newOffset }
  } catch {
    return { newOffset: offset }
  }
}

/** Long-polling. Procesa botones (aprobar/rechazar) y texto libre (ideas → backlog). */
export async function runTelegramListener(): Promise<void> {
  if (!getApi()) { log('[telegram] TELEGRAM_BOT_TOKEN no configurado — bot deshabilitado.'); return }
  if (!getDefaultChatId()) { log('[telegram] TELEGRAM_CHAT_ID no configurado — completá tu chat_id en .env.'); return }

  log('[telegram] Bot AlantORCH escuchando (Aprobar/Rechazar gates + cola de ideas)...')

  // NO drenamos el backlog: así las ideas que mandaste con el bot apagado se
  // capturan al reconectar (Telegram las bufferea ~24h). Los botones viejos son
  // inofensivos: approveGate valida que el featureId coincida con el gate actual.
  let offset = 0

  while (true) {
    writeBotHeartbeat()
    try {
      const data = await tg('getUpdates', { offset, timeout: 10 })
      if (!data?.ok || !Array.isArray(data.result)) { await sleep(2000); continue }

      for (const upd of data.result) {
        offset = upd.update_id + 1

        // Botones (inline keyboard)
        if (upd.callback_query) {
          const cq = upd.callback_query
          if (!allowed(cq.from?.id)) continue
          const [action, featureId] = String(cq.data ?? '').split(':')
          let answer = ''
          if (action === 'approve') answer = approveGate(featureId)
          else if (action === 'reject') { logReject(featureId ?? ''); answer = 'Rechazado — el gate queda en pausa.' }
          await tg('answerCallbackQuery', { callback_query_id: cq.id, text: answer })
          const chatId = getDefaultChatId()
          if (answer && chatId) await tg('sendMessage', { chat_id: chatId, text: answer })
          continue
        }

        // Texto: /idea anota; cualquier otra cosa → menú (no guarda nada)
        if (upd.message?.text) {
          if (!allowed(upd.message.from?.id)) continue
          const t = String(upd.message.text).trim()
          if (t) await handleText(t)
        }
      }
    } catch (e) {
      log(`[telegram] error en polling: ${(e as Error).message}`)
      await sleep(3000)
    }
  }
}
