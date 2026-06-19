import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getTargetConfig, getActiveTargetName } from './targets.js'
import { log } from './limits.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROD_HOSTS_PATH = path.join(__dirname, '..', '..', 'config', 'prod-db-hosts.json')

interface TargetWithDb {
  devDatabaseUrl?: string
  devDirectUrl?: string
  prodDbPatterns?: string[]
}

interface ProdHostsConfig {
  patterns: string[]
}

export interface DbEnvOverride {
  DATABASE_URL: string
  DIRECT_URL: string
}

let _cached: DbEnvOverride | null = null

function loadGlobalProdPatterns(): string[] {
  if (!existsSync(PROD_HOSTS_PATH)) return []
  const data = JSON.parse(readFileSync(PROD_HOSTS_PATH, 'utf-8')) as ProdHostsConfig
  return data.patterns ?? []
}

function matchesProdPattern(url: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    if (url.includes(pattern)) return pattern
  }
  return null
}

function extractHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url.slice(0, 60)
  }
}

/**
 * Called once at startup. Validates that the dev DB URL is configured and
 * does NOT point to production. Throws with a clear message if either check fails.
 * Returns the env override to inject into child processes.
 */
export function assertNoProdDb(): DbEnvOverride {
  const targetName = getActiveTargetName()
  const target = getTargetConfig() as unknown as TargetWithDb & { path: string }

  const devUrl = target.devDatabaseUrl
  const devDirectUrl = target.devDirectUrl

  // 1. Check devDatabaseUrl is configured
  if (!devUrl || devUrl.includes('<COMPLETAR>')) {
    throw new Error(
      `[guard] devDatabaseUrl no configurada para target "${targetName}".\n` +
      `Opciones:\n` +
      `  A) Docker local: docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16\n` +
      `                   cd ${target.path} && npx prisma db push\n` +
      `  B) Supabase branch: crear en dashboard.supabase.com y pegar URL en targets.json\n` +
      `Completá targets/targets.json [${targetName}].devDatabaseUrl antes de correr el loop.`
    )
  }

  // 2. Check devDatabaseUrl does NOT match prod patterns
  const patterns = [
    ...loadGlobalProdPatterns(),
    ...(target.prodDbPatterns ?? []),
  ]

  const matched = matchesProdPattern(devUrl, patterns)
  if (matched) {
    throw new Error(
      `[guard] DATABASE_URL apunta a producción — corrida abortada.\n` +
      `devDatabaseUrl para target "${targetName}" contiene el patrón de prod: "${matched}".\n` +
      `Configurá una DB de desarrollo separada en targets.json y nunca uses la URL de prod aquí.`
    )
  }

  const override: DbEnvOverride = {
    DATABASE_URL: devUrl,
    DIRECT_URL: devDirectUrl ?? devUrl,
  }

  _cached = override
  log(`[guard] DB no-prod verificada para "${targetName}" — host: ${extractHost(devUrl)}`)
  return override
}

/**
 * Returns the cached DB env override. Must be called after assertNoProdDb().
 * All child processes (executor, verifier, QA) must include this in their env.
 */
export function getDbEnvOverride(): DbEnvOverride {
  if (!_cached) {
    throw new Error('[guard] getDbEnvOverride() llamado antes de assertNoProdDb(). Bug en el loop.')
  }
  return _cached
}
