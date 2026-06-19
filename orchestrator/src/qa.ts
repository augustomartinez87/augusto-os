import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { log } from './limits.js'
import { getDbEnvOverride } from './db-guard.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface QAResult {
  ok: boolean
  errors: string[]
  screenshotDir: string
}

// Selectors / text patterns that must NOT appear in borrower-facing views.
const FORBIDDEN_BORROWER_PATTERNS = [
  /\bTNA\b/,
  /tasa\s+nominal/i,
  /tasa\s+anual/i,
  /\bTEA\b/,
  /interés\s+anual/i,
]

export async function runQA(featureId: string, stepId: number, baseUrl: string, routes: string[]): Promise<QAResult> {
  const artifactDir = path.join(__dirname, '..', 'qa-artifacts', featureId, `step-${stepId}`)
  mkdirSync(artifactDir, { recursive: true })

  const errors: string[] = []
  // Inject dev DB env so any server-side requests during QA don't hit prod
  const dbEnv = getDbEnvOverride()
  process.env.DATABASE_URL = dbEnv.DATABASE_URL
  process.env.DIRECT_URL = dbEnv.DIRECT_URL

  const browser = await chromium.launch({ headless: true })

  try {
    for (const route of routes) {
      const url = `${baseUrl}${route}`
      const page = await browser.newPage()

      const consoleErrors: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text())
      })
      page.on('pageerror', err => consoleErrors.push(err.message))

      log(`[qa] Navegando ${url}`)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForTimeout(2_000)

      const shotPath = path.join(artifactDir, `${route.replace(/\//g, '_') || 'root'}.png`)
      await page.screenshot({ path: shotPath, fullPage: true })

      if (consoleErrors.length > 0) {
        errors.push(`[${route}] Errores JS en consola:\n${consoleErrors.join('\n')}`)
      }

      const isBorrowerView = route.startsWith('/l/') || route.startsWith('/simular') || route.startsWith('/public')
      if (isBorrowerView) {
        const bodyText = await page.evaluate(() => document.body.innerText)
        for (const pattern of FORBIDDEN_BORROWER_PATTERNS) {
          if (pattern.test(bodyText)) {
            errors.push(`[${route}] INVARIANTE VIOLADA: se muestra "${pattern}" en vista de prestatario`)
          }
        }
      }

      await page.close()
    }
  } catch (err: any) {
    const isNoServer = /ERR_CONNECTION_REFUSED|ECONNREFUSED|net::ERR/.test(err?.message ?? '')
    if (isNoServer) {
      errors.push(`NO_SERVER: ${baseUrl} no disponible — arrancar con QA_BASE_URL=<url> para QA visual`)
      log(`[qa] SKIP: servidor no disponible en ${baseUrl}`)
    } else {
      errors.push(`QA error inesperado: ${err?.message}`)
      log(`[qa] ERROR: ${err?.message}`)
    }
  } finally {
    await browser.close()
  }

  const ok = errors.length === 0
  if (ok) {
    log(`[qa] OK: ${routes.length} rutas verificadas. Screenshots en ${artifactDir}`)
  } else {
    log(`[qa] FAIL: ${errors.length} errores`)
    errors.forEach(e => log(`  ${e}`))
  }

  return { ok, errors, screenshotDir: artifactDir }
}
