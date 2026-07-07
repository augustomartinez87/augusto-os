import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { runDeepSeekAgent } from './deepseek.js'
import { validateEvidence, type ScoutReport } from './report.js'
import type { ScoutTask } from './provider.js'
import type { IntakeResult } from '../intake.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FEATURES_DIR = path.join(__dirname, '..', '..', 'features')
const SCOUT_TIMEOUT_MS = 5 * 60 * 1000

function buildObjective(intake: IntakeResult, focus: ScoutTask['focus']): string {
  const base = intake.ideaText
  if (focus === 'mapa') return `Mapa del repo para: ${base}`
  if (focus === 'detective') return `Investigar qué existe para implementar: ${base}`
  return `Riesgos y restricciones técnicas para: ${base}`
}

function reportToMarkdown(reports: ScoutReport[], featureId: string): string {
  const lines: string[] = [
    `# Investigación Scout — ${featureId}`,
    '',
    `> Generado automáticamente. Evidencia verificada contra filesystem.`,
    '',
  ]

  for (const report of reports) {
    lines.push(`## ${report.objetivo}`, '')
    lines.push(`**Resumen:** ${report.resumen}`, '')

    if (report.archivos.length) {
      lines.push('### Archivos clave')
      report.archivos.forEach(f => lines.push(`- \`${f}\``))
      lines.push('')
    }

    if (report.patrones.length) {
      lines.push('### Patrones a seguir')
      report.patrones.forEach(p => lines.push(`- ${p}`))
      lines.push('')
    }

    if (report.dependencias.length) {
      lines.push('### Dependencias relevantes')
      report.dependencias.forEach(d => lines.push(`- ${d}`))
      lines.push('')
    }

    if (report.riesgos.length) {
      lines.push('### Riesgos / Restricciones')
      report.riesgos.forEach(r => lines.push(`- ${r}`))
      lines.push('')
    }

    if (report.evidencia.length) {
      lines.push('### Evidencia verificada')
      for (const e of report.evidencia) {
        const conf = Math.round(e.confianza * 100)
        lines.push(`- **\`${e.path}\`** — \`${e.simbolo}\` (líneas ${e.lineas}, confianza ${conf}%): ${e.explicacion}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

export interface ScoutResult {
  markdown: string
  reports: ScoutReport[]
}

export async function runScout(
  intake: IntakeResult,
  repoRoot: string,
  featureId: string,
): Promise<ScoutResult | null> {
  if (process.env.SCOUT_ENABLED !== 'true') return null

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    console.warn('[scout] DEEPSEEK_API_KEY no definida — scout omitido')
    return null
  }

  const focuses: ScoutTask['focus'][] = ['mapa', 'detective', 'riesgos']

  const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`[scout] Timeout (${ms}ms) en ${label}`)), ms)
      ),
    ])

  const tasks: ScoutTask[] = focuses.map(focus => ({
    objetivo: buildObjective(intake, focus),
    repoRoot,
    focus,
  }))

  const settled = await Promise.allSettled(
    tasks.map(task =>
      withTimeout(
        runDeepSeekAgent(task, apiKey, featureId),
        SCOUT_TIMEOUT_MS,
        task.focus,
      )
    )
  )

  const reports: ScoutReport[] = []
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i]
    if (result.status === 'fulfilled') {
      const { report, stats } = validateEvidence(result.value, repoRoot)
      if (stats.pathsDiscarded > 0 || stats.symbolsUnverified > 0) {
        console.warn(
          `[scout] ${focuses[i]}: ${stats.pathsDiscarded} paths descartados, ${stats.symbolsUnverified} símbolos no verificados`
        )
      }
      reports.push(report)
    } else {
      console.warn(`[scout] Investigación "${focuses[i]}" falló: ${result.reason}`)
    }
  }

  if (reports.length === 0) {
    console.warn('[scout] Todas las investigaciones fallaron — continuando sin research')
    return null
  }

  const markdown = reportToMarkdown(reports, featureId)
  const json = JSON.stringify(reports, null, 2)

  mkdirSync(FEATURES_DIR, { recursive: true })
  writeFileSync(path.join(FEATURES_DIR, `${featureId}.research.md`), markdown, 'utf-8')
  writeFileSync(path.join(FEATURES_DIR, `${featureId}.research.json`), json, 'utf-8')

  return { markdown, reports }
}
