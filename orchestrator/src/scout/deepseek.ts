import path from 'path'
import { ScoutReportSchema, type ScoutReport } from './report.js'
import { list_tree, read_file, grep } from './tools.js'
import type { ScoutTask } from './provider.js'
import { recordInvocation } from '../metrics.js'

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'
const DEEPSEEK_BALANCE_URL = 'https://api.deepseek.com/user/balance'
const DEEPSEEK_MODEL = 'deepseek-v4-flash'
const MAX_LOOP_TURNS = 15
const MAX_INPUT_TOKENS = 200_000
const DEEPSEEK_COST_PER_M_INPUT_USD = 0.14
const DEEPSEEK_COST_PER_M_OUTPUT_USD = 0.28
// read_file nunca se poda: ya viene topeado a MAX_READ_LINES por llamada (barato) y
// es la evidencia que el modelo necesita citar en el research final. list_tree/grep
// son solo para decidir dónde mirar — se podan agresivo, no hace falta que sobrevivan.
const MAX_KEPT_EXPLORATION_RESULTS = 2
const EXPLORATION_TOOLS = new Set(['list_tree', 'grep'])
const PRUNE_PLACEHOLDER = '[resultado ya leído, omitido para ahorrar contexto]'

// S-034: cachea unos minutos el chequeo proactivo de saldo — no golpear de más la API.
export const BALANCE_CHECK_INTERVAL_MS = 7 * 60 * 1000  // 7 min, dentro del rango 5-10 pedido

// Clasificación explícita de "sin saldo" — nunca inferida por substring del texto del
// error (esa clase de bug ya nos mordió con el 429 falso positivo en limits.ts). Se
// dispara únicamente por el status code HTTP real (402 Insufficient Balance, doc oficial
// de DeepSeek: https://api-docs.deepseek.com/quick_start/error_codes).
export class DeepSeekInsufficientBalanceError extends Error {
  constructor() {
    super('DeepSeek: sin saldo (HTTP 402 Insufficient Balance)')
    this.name = 'DeepSeekInsufficientBalanceError'
  }
}

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_tree',
      description: 'Lista el árbol de archivos de un directorio hasta maxDepth niveles (por defecto 3). Ignora node_modules, .next, dist, build.',
      parameters: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: 'Directorio a listar, relativo a la raíz del repo. Usar "." para la raíz.' },
          maxDepth: { type: 'number', description: 'Profundidad máxima (1-5). Por defecto 3.' },
        },
        required: ['dir'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Lee un archivo del repo (máx 150 líneas). Ruta relativa a la raíz del repo.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Ruta relativa al archivo.' },
          fromLine: { type: 'number', description: 'Línea inicial (1-indexed). Por defecto 1.' },
          toLine: { type: 'number', description: 'Línea final (inclusive). Por defecto fromLine + 149.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Busca un patrón regex en los archivos del repo (máx 50 matches).',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Patrón regex a buscar.' },
          glob: { type: 'string', description: 'Filtro de archivos, ej: "*.ts", "**/*.tsx", "*.json".' },
        },
        required: ['pattern', 'glob'],
      },
    },
  },
]

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface ChatResponse {
  choices: Array<{
    message: {
      role: string
      content: string | null
      tool_calls?: ToolCall[]
    }
    finish_reason: string
  }>
  usage?: { prompt_tokens: number; completion_tokens: number }
}

function dispatchTool(name: string, args: Record<string, unknown>, repoRoot: string): string {
  try {
    if (name === 'list_tree') {
      const dir = path.resolve(repoRoot, String(args.dir ?? '.'))
      const maxDepth = typeof args.maxDepth === 'number' ? Math.min(args.maxDepth, 5) : 3
      const entries = list_tree(dir, repoRoot, maxDepth)
      return JSON.stringify(entries.slice(0, 500))
    }
    if (name === 'read_file') {
      const text = read_file(String(args.path), repoRoot, Number(args.fromLine ?? 1), args.toLine != null ? Number(args.toLine) : undefined)
      return text
    }
    if (name === 'grep') {
      const matches = grep(String(args.pattern), String(args.glob ?? '**/*'), repoRoot)
      return JSON.stringify(matches)
    }
    return JSON.stringify({ error: `Herramienta desconocida: ${name}` })
  } catch (e) {
    return JSON.stringify({ error: String(e) })
  }
}

function buildSystemPrompt(task: ScoutTask): string {
  const focusInstructions: Record<ScoutTask['focus'], string> = {
    mapa: 'Construí un mapa completo del repo: estructura de carpetas, archivos clave, stack tecnológico, patrones de código predominantes y dependencias principales.',
    detective: `Investigá el repo con el ojo de un detective buscando exactamente qué existe hoy que sea relevante para: "${task.objetivo}". Identificá archivos, funciones, tipos, hooks, endpoints, helpers que el implementador deberá reusar o modificar.`,
    riesgos: `Identificá riesgos y restricciones técnicas relevantes para: "${task.objetivo}". Buscá: coupling, migraciones necesarias, tests que pueden romperse, convenciones que deben respetarse, deuda técnica relevante.`,
  }

  return `Sos un investigador de código. Tu objetivo es: "${task.objetivo}".

FOCO: ${focusInstructions[task.focus]}

Tenés acceso a tres herramientas: list_tree, read_file, grep. Úsalas para explorar el repo antes de responder.

Tenés un máximo de ${MAX_LOOP_TURNS} turnos. A partir del turno ${MAX_LOOP_TURNS - 3} de ${MAX_LOOP_TURNS}, dejá de llamar tools y escribí tu respuesta final en JSON con la evidencia que ya tenés — marcá como [NO VERIFICADO] en la explicación lo que no llegaste a confirmar. Una respuesta parcial y honesta es mejor que ninguna.

Cuando hayas terminado la investigación, devolvé un JSON con este schema exacto:
{
  "objetivo": string,
  "archivos": string[],      // rutas relativas de archivos clave encontrados
  "patrones": string[],      // patrones de código que el implementador debe seguir
  "dependencias": string[],  // librerías/módulos relevantes para la tarea
  "riesgos": string[],       // riesgos o restricciones encontrados
  "evidencia": [{
    "path": string,          // ruta relativa al archivo
    "simbolo": string,       // UN identificador literal y copiable — el nombre exacto de una función, variable, tipo o clave, tal cual aparece en el archivo. Nunca una frase descriptiva ni varios identificadores unidos con "+" o "y". Si hay varios símbolos relevantes en el mismo lugar, generá una entrada de evidencia separada por cada uno.
    "lineas": string,        // número de líneas, ej: "42-58"
    "explicacion": string,   // por qué es relevante
    "confianza": number      // 0.0-1.0
  }],
  "resumen": string          // resumen ejecutivo de 2-4 oraciones
}

NO incluyas texto fuera del JSON en tu respuesta final.`
}

// Poda solo list_tree/grep (exploración descartable, mantiene las últimas
// MAX_KEPT_EXPLORATION_RESULTS). read_file nunca se toca — el mensaje 'assistant' que
// disparó cada tool call (con name+arguments) tampoco, así el modelo sigue viendo qué
// ya llamó y no repite lecturas que aún tiene completas en contexto.
function pruneToolHistory(messages: ChatMessage[]): void {
  const explorationIndexes = messages.reduce<number[]>((acc, m, i) => {
    if (m.role === 'tool' && m.name && EXPLORATION_TOOLS.has(m.name)) acc.push(i)
    return acc
  }, [])
  const toPrune = explorationIndexes.slice(0, Math.max(0, explorationIndexes.length - MAX_KEPT_EXPLORATION_RESULTS))
  for (const i of toPrune) {
    if (messages[i].content !== PRUNE_PLACEHOLDER) {
      messages[i] = { ...messages[i], content: PRUNE_PLACEHOLDER }
    }
  }
}

export async function runDeepSeekAgent(task: ScoutTask, apiKey: string, featureId: string, signal?: AbortSignal): Promise<ScoutReport> {
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(task) },
    { role: 'user', content: `Explorá el repo y respondé con el JSON de investigación para: "${task.objetivo}" (foco: ${task.focus})` },
  ]

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let exitCode = 1
  const startedAt = Date.now()

  try {
    for (let turn = 0; turn < MAX_LOOP_TURNS; turn++) {
      if (totalInputTokens > MAX_INPUT_TOKENS) {
        throw new Error(`[deepseek] Límite de tokens de input (~${MAX_INPUT_TOKENS}) alcanzado en turn ${turn}`)
      }

      // Señal de turno en vivo: el system prompt inicial no alcanza porque el modelo
      // no tiene forma de saber en qué turno está mientras la conversación avanza.
      // Este mensaje se repite CADA turno para que el corte cerca del final sea accionable.
      const turnsRemaining = MAX_LOOP_TURNS - turn
      let turnNotice = `Turno ${turn + 1} de ${MAX_LOOP_TURNS}.`
      if (turn >= MAX_LOOP_TURNS - 3) {
        turnNotice += ` Te quedan ${turnsRemaining} turnos. DEJÁ DE LLAMAR TOOLS y respondé ahora con el JSON final, marcando como [NO VERIFICADO] lo que no llegaste a confirmar.`
      }
      messages.push({ role: 'user', content: turnNotice })

      const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages,
          tools: TOOL_DEFINITIONS,
          tool_choice: 'auto',
          max_tokens: 4096,
        }),
        signal,
      })

      if (response.status === 402) {
        throw new DeepSeekInsufficientBalanceError()
      }

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`[deepseek] API error ${response.status}: ${errText.slice(0, 500)}`)
      }

      const data: ChatResponse = await response.json() as ChatResponse
      // prompt_tokens ya es el tamaño acumulado del historial en este turno — asignar,
      // no sumar (sumar cuenta el mismo historial varias veces y dispara el límite antes de tiempo).
      totalInputTokens = data.usage?.prompt_tokens ?? totalInputTokens
      totalOutputTokens += data.usage?.completion_tokens ?? 0

      const choice = data.choices[0]
      if (!choice) throw new Error('[deepseek] Respuesta vacía de la API')

      const assistantMsg = choice.message
      messages.push({
        role: 'assistant',
        content: assistantMsg.content,
        tool_calls: assistantMsg.tool_calls,
      })

      if (choice.finish_reason === 'tool_calls' && assistantMsg.tool_calls?.length) {
        for (const toolCall of assistantMsg.tool_calls) {
          let args: Record<string, unknown> = {}
          try { args = JSON.parse(toolCall.function.arguments) as Record<string, unknown> } catch { /* ignore */ }
          const toolResult = dispatchTool(toolCall.function.name, args, task.repoRoot)
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: toolResult,
          })
        }
        pruneToolHistory(messages)
        continue
      }

      // Model finished — extract JSON from the response
      const content = assistantMsg.content ?? ''
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error(`[deepseek] No se encontró JSON en la respuesta final:\n${content.slice(0, 500)}`)
      }

      const parsed = ScoutReportSchema.safeParse(JSON.parse(jsonMatch[0]))
      if (!parsed.success) {
        throw new Error(`[deepseek] JSON del scout inválido: ${parsed.error.message}`)
      }
      exitCode = 0
      return parsed.data
    }

    throw new Error(`[deepseek] Agente superó el máximo de ${MAX_LOOP_TURNS} turns sin respuesta final`)
  } finally {
    recordInvocation({
      featureId,
      role: `scout:${task.focus}`,
      model: DEEPSEEK_MODEL,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costUsd: (totalInputTokens / 1_000_000) * DEEPSEEK_COST_PER_M_INPUT_USD
        + (totalOutputTokens / 1_000_000) * DEEPSEEK_COST_PER_M_OUTPUT_USD,
      durationMs: Date.now() - startedAt,
      exitCode,
    })
  }
}

// ── S-034: chequeo proactivo de saldo (orch-sync) ──────────────────────────────

export interface DeepSeekBalance {
  isAvailable: boolean
  totalBalance: string
  currency: string
}

interface DeepSeekBalanceResponse {
  is_available?: boolean
  balance_infos?: Array<{ currency?: string; total_balance?: string }>
}

/** Pure — fácil de testear sin side-effects, mismo patrón que shouldRunCleanup. */
export function shouldRunBalanceCheck(lastCheckAtMs: number, nowMs = Date.now()): boolean {
  return nowMs - lastCheckAtMs >= BALANCE_CHECK_INTERVAL_MS
}

/** Devuelve null ante cualquier fallo (red, parseo, API key ausente) — nunca tumba el caller. */
export async function fetchDeepSeekBalance(apiKey: string): Promise<DeepSeekBalance | null> {
  try {
    const res = await fetch(DEEPSEEK_BALANCE_URL, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    if (!res.ok) return null
    const data = await res.json() as DeepSeekBalanceResponse
    const info = data.balance_infos?.[0]
    if (!info) return null
    return {
      isAvailable: data.is_available ?? false,
      totalBalance: info.total_balance ?? '0',
      currency: info.currency ?? 'USD',
    }
  } catch {
    return null
  }
}
