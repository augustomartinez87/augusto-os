import { z } from 'zod'
import { existsSync, readFileSync } from 'fs'
import path from 'path'

export const EvidenceItemSchema = z.object({
  path: z.string(),
  simbolo: z.string(),
  lineas: z.string(),
  explicacion: z.string(),
  confianza: z.number().min(0).max(1),
})

export const ScoutReportSchema = z.object({
  objetivo: z.string(),
  archivos: z.array(z.string()),
  patrones: z.array(z.string()),
  dependencias: z.array(z.string()),
  riesgos: z.array(z.string()),
  evidencia: z.array(EvidenceItemSchema),
  resumen: z.string(),
})

export type ScoutReport = z.infer<typeof ScoutReportSchema>
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>

export interface ValidationStats {
  total: number
  pathsDiscarded: number
  symbolsUnverified: number
}

export interface ValidatedReport {
  report: ScoutReport
  stats: ValidationStats
}

export function validateEvidence(report: ScoutReport, repoRoot: string): ValidatedReport {
  let pathsDiscarded = 0
  let symbolsUnverified = 0

  const sanitizedEvidence = report.evidencia
    .filter(item => {
      const absPath = path.resolve(repoRoot, item.path)
      if (!existsSync(absPath)) {
        pathsDiscarded++
        return false
      }
      return true
    })
    .map(item => {
      const absPath = path.resolve(repoRoot, item.path)
      let content = ''
      try { content = readFileSync(absPath, 'utf-8') } catch { /* keep item as-is */ }
      if (item.simbolo && content && !content.includes(item.simbolo)) {
        symbolsUnverified++
        return { ...item, confianza: 0, explicacion: `[NO VERIFICADO] ${item.explicacion}` }
      }
      return item
    })

  return {
    report: { ...report, evidencia: sanitizedEvidence },
    stats: {
      total: report.evidencia.length,
      pathsDiscarded,
      symbolsUnverified,
    },
  }
}
