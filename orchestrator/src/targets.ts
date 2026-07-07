import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TARGETS_JSON = path.join(__dirname, '..', '..', 'targets', 'targets.json')

export interface Target {
  path: string
  description: string
  stack: string
  verifyCmd: string
  lintCmd: string
  testCmd: string
  qaBaseUrl: string
  dbModel?: 'prisma' | 'none'   // 'none' = app sin Prisma (ej. Supabase-client): el loop no exige dev DB ni inyecta DATABASE_URL
  devDatabaseUrl?: string
  devDirectUrl?: string
  prodDbPatterns?: string[]
  baseBranch?: string   // override manual de la rama default (main/master/...). Si no está seteado, se detecta en runtime vía origin/HEAD.
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

function expandEnvVars(value: string | undefined): string | undefined {
  if (!value) return value
  return value.replace(/\$\{([^}]+)\}/g, (_, varName: string) => {
    const val = process.env[varName]
    if (!val) throw new Error(
      `[targets] Variable de entorno "${varName}" no definida.\n` +
      `Asegurate de correr el orquestador con --env-file=.env o setear la variable antes de iniciar.`
    )
    return val
  })
}

export function getTargetConfig(): Target {
  if (!activeTarget) throw new Error('No hay target activo — llamá setActiveTarget() primero')
  const file: TargetsFile = JSON.parse(readFileSync(TARGETS_JSON, 'utf-8'))
  const target = file.targets[activeTarget]
  if (!target) throw new Error(`Target "${activeTarget}" ya no existe en targets.json`)
  return {
    ...target,
    devDatabaseUrl: expandEnvVars(target.devDatabaseUrl),
    devDirectUrl: expandEnvVars(target.devDirectUrl),
  }
}
