import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse as parseYaml } from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_STATE_PATH = path.join(__dirname, '..', '..', 'system', 'OPERATOR_STATE.yaml')

export type OperatorMode = 'PRODUCT' | 'OFFICE' | 'SLEEP'
export type ResponseStyle = 'normal' | 'short'

export interface OperatorState {
  mode: OperatorMode
  responseStyle: ResponseStyle
  availableForQuestions: boolean
}

const DEFAULTS: OperatorState = {
  mode: 'PRODUCT',
  responseStyle: 'normal',
  availableForQuestions: true,
}

export function getOperatorState(statePath = DEFAULT_STATE_PATH): OperatorState {
  if (!existsSync(statePath)) return { ...DEFAULTS }
  const raw = readFileSync(statePath, 'utf-8')
  const parsed = parseYaml(raw) ?? {}

  const rawMode = parsed.mode ?? 'PRODUCT'
  const mode: OperatorMode = ['PRODUCT', 'OFFICE', 'SLEEP'].includes(rawMode)
    ? (rawMode as OperatorMode)
    : 'PRODUCT'

  const rawStyle = parsed.response_style ?? 'normal'
  const responseStyle: ResponseStyle = ['normal', 'short'].includes(rawStyle)
    ? (rawStyle as ResponseStyle)
    : 'normal'

  const availableForQuestions =
    typeof parsed.available_for_questions === 'boolean'
      ? parsed.available_for_questions
      : true

  return { mode, responseStyle, availableForQuestions }
}
