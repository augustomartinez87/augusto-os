import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TARGETS_JSON = path.join(__dirname, '..', '..', 'targets', 'targets.json')

interface Target {
  path: string
  description: string
  stack: string
  verifyCmd: string
  lintCmd: string
  testCmd: string
  qaBaseUrl: string
}

interface TargetsFile {
  targets: Record<string, Target>
}

let activeTarget: string | null = null

export function setActiveTarget(name: string): void {
  const file: TargetsFile = JSON.parse(readFileSync(TARGETS_JSON, 'utf-8'))
  if (!file.targets[name]) {
    throw new Error(`Target "${name}" no encontrado en targets.json. Disponibles: ${Object.keys(file.targets).join(', ')}`)
  }
  activeTarget = name
}

export function getActiveTargetName(): string {
  if (!activeTarget) throw new Error('No hay target activo — llamá setActiveTarget() primero')
  return activeTarget
}

export function getRepoRoot(): string {
  if (!activeTarget) throw new Error('No hay target activo — llamá setActiveTarget() primero')
  const file: TargetsFile = JSON.parse(readFileSync(TARGETS_JSON, 'utf-8'))
  const target = file.targets[activeTarget]
  if (!target) throw new Error(`Target "${activeTarget}" ya no existe en targets.json`)
  return target.path
}

export function getTargetConfig(): Target {
  if (!activeTarget) throw new Error('No hay target activo — llamá setActiveTarget() primero')
  const file: TargetsFile = JSON.parse(readFileSync(TARGETS_JSON, 'utf-8'))
  return file.targets[activeTarget]
}
