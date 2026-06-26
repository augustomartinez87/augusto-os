// src/telegram.ts — S-006: aprobar/rechazar gates y mandar ideas desde Telegram.
// Sin dependencias: usa fetch nativo contra la Bot API. Degradación total:
// si falta TELEGRAM_BOT_TOKEN/CHAT_ID, todo es no-op y el sistema sigue con `npm run approve`.

import { appendFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadState, saveState } from './state.js'
import { log } from './limits.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const INBOX = path.join(__dirname, '..', '..', 'system', 'FEATURE-INTAKE.md')
const BLOCKED_LOG = path.join(__dirname, '..', 'blocked.log')

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID
const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null

async function tg(method: string, body: Record<string, unknown>): Promise<any> {
  if (!API) return null
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

function allowed(id: unknown): boolean {
  return CHAT_ID != null && CHAT_ID !== '' && String(id) === String(CHAT_ID)
}

/** Llamado por gates.ts cuando el loop pausa en un gate humano. No-op si no hay credenciales. */
export async function notifyGate(detail: string, featureId: string): Promise<void> {
  if (!API || !CHAT_ID) return
  const body = {
    chat_id: CHAT_ID,
    text: `🔔 Gate de *${featureId}*\n\n${detail}`,
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
      const r = await tg('sendMessage', body)
      if (r?.ok) return
    } catch (e) {
      log(`[telegram] intento ${attempt}/5 de avisar el gate falló: ${(e as Error).message}`)
    }
    await new Promise((res) => setTimeout(res, 2000))
  }
  log('[telegram] no se pudo avisar el gate tras 5 intentos — usá `npm run approve` para este.')
}

/** Envía un mensaje de texto plano con reintento (sin parse_mode, para no romper con caracteres del error). */
async function tgSendRetry(text: string): Promise<void> {
  if (!API || !CHAT_ID) return
  const body = { chat_id: CHAT_ID, text }
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const r = await tg('sendMessage', body)
      if (r?.ok) return
    } catch (e) {
      log(`[telegram] intento ${attempt}/5 de avisar falló: ${(e as Error).message}`)
    }
    await new Promise((res) => setTimeout(res, 2000))
  }
  log('[telegram] no se pudo enviar el aviso tras 5 intentos.')
}

/** Aviso de deploy exitoso a prod (auto-deploy en verde). */
export async function notifyDeployed(featureId: string, tnaNote?: string): Promise<void> {
  await tgSendRetry(`✅ ${featureId} deployado a prod.\nVerificación OK: typecheck + lint + tests + build.${tnaNote ? `\n${tnaNote}` : ''}`)
}

/** Aviso de release fallido — NO se deployó. Manda el error para debuggear. */
export async function notifyReleaseFailed(featureId: string, errors: string): Promise<void> {
  const clip = errors.length > 1400 ? errors.slice(0, 1400) + '…' : errors
  await tgSendRetry(`❌ ${featureId} NO se deployó — falló la verificación:\n\n${clip}\n\nRevisalo conmigo o con quien corresponda.`)
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
  if (!CHAT_ID) return
  if (t === '/start' || t === '/help') {
    await tg('sendMessage', { chat_id: CHAT_ID, text: MENU })
    return
  }
  if (t.toLowerCase().startsWith('/idea')) {
    const idea = t.slice(5).trim()
    if (!idea) {
      await tg('sendMessage', { chat_id: CHAT_ID, text: 'Mandá /idea seguido de tu idea. Ej: /idea agregar export CSV a Kredy' })
      return
    }
    saveIdea(idea)
    await tg('sendMessage', { chat_id: CHAT_ID, text: 'Idea anotada 📝 (FEATURE-INTAKE.md)' })
    return
  }
  await tg('sendMessage', { chat_id: CHAT_ID, text: '¿Qué querés hacer? Para anotar una idea: /idea <tu idea>. Cuando haya algo para aprobar, te aviso yo. /help para ver las opciones.' })
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

/** Long-polling. Procesa botones (aprobar/rechazar) y texto libre (ideas → backlog). */
export async function runTelegramListener(): Promise<void> {
  if (!API) { log('[telegram] TELEGRAM_BOT_TOKEN no configurado — bot deshabilitado.'); return }
  if (!CHAT_ID) { log('[telegram] TELEGRAM_CHAT_ID no configurado — completá tu chat_id en .env.'); return }

  log('[telegram] Bot AlantORCH escuchando (Aprobar/Rechazar gates + cola de ideas)...')

  // NO drenamos el backlog: así las ideas que mandaste con el bot apagado se
  // capturan al reconectar (Telegram las bufferea ~24h). Los botones viejos son
  // inofensivos: approveGate valida que el featureId coincida con el gate actual.
  let offset = 0

  while (true) {
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
          if (answer) await tg('sendMessage', { chat_id: CHAT_ID, text: answer })
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
