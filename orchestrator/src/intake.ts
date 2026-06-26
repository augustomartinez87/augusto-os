import { readFileSync, existsSync, readdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SYSTEM_DIR = path.join(__dirname, '..', '..', 'system')
const FEATURES_DIR = path.join(__dirname, '..', 'features')

export type TargetName = 'kredy' | 'spensiv' | 'argos' | 'sistema' | 'unknown'
export type Classification = 'bug' | 'feature' | 'arquitectura'

export interface IntakeResult {
  ideaText: string
  target: TargetName
  classification: Classification
  relatedAdrs: string[]
  relatedFeatures: string[]
  relatedBacklogIds: string[]
  contextSummary: string
  needsArchitect: boolean
}

export interface IntakePaths {
  decisionsPath?: string
  featuresDir?: string
  backlogPath?: string
}

const TARGET_KEYWORDS: Record<Exclude<TargetName, 'unknown'>, string[]> = {
  kredy: [
    'kredy', 'préstamo', 'prestamo', 'crédito', 'credito', 'mutuo', 'pagaré', 'pagare',
    'agente productor', 'loan', 'originar', 'originación', 'originacion', 'cuil', 'cuil/',
    'prestatario', 'cuota', 'tasa mensual', 'refinanciación', 'refinanciacion', 'ap score',
  ],
  spensiv: [
    'spensiv', 'finanzas personales', 'cashflow', 'cash flow', 'tracker de gastos',
    'gastos', 'tarjeta', 'deuda personal', 'proyección de deuda', 'export csv',
  ],
  argos: [
    'argos', 'portfolio', 'portfolio tracker', 'inversión', 'inversion', 'carry trade',
    'carry', 'fci', 'rendi', 'vestyapp', 'vesty', 'cedears', 'tipo de cambio', 'tracker',
    'acciones',
  ],
  sistema: [
    'orquestador', 'orchestrator', 'intake', 'architect', 'backlog del sistema',
    'planner', 'executor', 'builder', 'gates.ts', 'models.ts', 's-008', 's-007', 's-009',
    'telegram bot', 'bot de telegram', 'dashboard de control', 'augusto-os',
  ],
}

// 'loop' alone is too generic (Argos has loops too); require more context for 'sistema'
const ARCH_KEYWORDS = [
  'orquestador', 'orchestrator', 'refactor del loop', 'migrar el orquestador',
  'migración del sistema', 'intake', 'architect agent', 'planner.ts', 'executor.ts',
  'gates.ts', 'models.ts', 'arquitectura del sistema',
]

const BUG_KEYWORDS = [
  'bug', 'error', 'falla', 'fallo', 'roto', 'broken', 'fix ', 'arreglar',
  'no funciona', 'crash', 'se rompe', 'está mal', 'está roto', 'devuelve mal', 'incorrecto',
]

const TRIVIAL_KEYWORDS = [
  'typo', 'copy ', 'renombrar', 'rename', 'cambiar el color', 'cambiar el texto',
  'cambiar el label', 'cambiar el icono',
]

const STOP_WORDS = new Set([
  'para', 'como', 'algo', 'esto', 'esta', 'este', 'pero', 'que', 'una', 'uno',
  'los', 'las', 'con', 'del', 'from', 'this', 'that', 'with', 'the', 'and', 'for',
  'hay', 'ver', 'hay', 'sus', 'por', 'son', 'muy', 'más', 'mas',
])

export function detectTarget(text: string): TargetName {
  const lower = text.toLowerCase()
  for (const [target, keywords] of Object.entries(TARGET_KEYWORDS) as [Exclude<TargetName, 'unknown'>, string[]][]) {
    if (keywords.some(kw => lower.includes(kw.toLowerCase()))) return target
  }
  return 'unknown'
}

export function classify(text: string): Classification {
  const lower = text.toLowerCase()
  if (ARCH_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()))) return 'arquitectura'
  if (BUG_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()))) return 'bug'
  return 'feature'
}

export function needsArchitectCheck(text: string, classification: Classification): boolean {
  if (classification === 'arquitectura') return true
  const words = text.trim().split(/\s+/)
  if (words.length < 4) return false
  const lower = text.toLowerCase()
  if (TRIVIAL_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()))) return false
  return true
}

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\wáéíóúñü\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
}

export function findRelatedAdrs(text: string, decisionsPath?: string): string[] {
  const fp = decisionsPath ?? path.join(SYSTEM_DIR, 'DECISIONS.md')
  if (!existsSync(fp)) return []

  const content = readFileSync(fp, 'utf-8')
  const keywords = extractKeywords(text)
  const found = new Set<string>()

  // Split at each "## ADR-NNNN" header; each chunk is one ADR section
  const sections = content.split(/(?=\n## ADR-\d{4}\s)/)
  for (const section of sections) {
    const idMatch = /## (ADR-\d{4})\s/.exec(section)
    if (!idMatch) continue
    const lower = section.toLowerCase()
    if (keywords.some(kw => lower.includes(kw))) found.add(idMatch[1])
  }

  return Array.from(found)
}

export function findRelatedFeatures(text: string, featuresDir?: string): string[] {
  const dir = featuresDir ?? FEATURES_DIR
  if (!existsSync(dir)) return []

  const keywords = extractKeywords(text)
  const found: string[] = []

  let files: string[]
  try {
    files = readdirSync(dir).filter(f => /^F-\d{4}\.md$/.test(f))
  } catch {
    return []
  }

  for (const file of files) {
    try {
      const lower = readFileSync(path.join(dir, file), 'utf-8').toLowerCase()
      if (keywords.some(kw => lower.includes(kw))) found.push(file.replace('.md', ''))
    } catch {
      // skip unreadable files
    }
  }

  return found
}

export function findRelatedBacklog(text: string, backlogPath?: string): string[] {
  const fp = backlogPath ?? path.join(SYSTEM_DIR, 'BACKLOG.md')
  if (!existsSync(fp)) return []

  const content = readFileSync(fp, 'utf-8')
  const keywords = extractKeywords(text)
  const found = new Set<string>()

  const ID_RE = /\|\s*((?:S|SP|SPT|AR)-\d{3,4}[a-z]?)\s*\|/
  for (const line of content.split('\n')) {
    const idMatch = ID_RE.exec(line)
    if (!idMatch) continue
    const lower = line.toLowerCase()
    if (keywords.some(kw => lower.includes(kw))) found.add(idMatch[1])
  }

  return Array.from(found)
}

function buildContextSummary(
  target: TargetName,
  classification: Classification,
  adrs: string[],
  features: string[],
  backlogIds: string[],
): string {
  const parts = [
    `Target: ${target}`,
    `Clasificación: ${classification}`,
  ]
  if (adrs.length) parts.push(`ADRs relacionados: ${adrs.join(', ')}`)
  if (features.length) parts.push(`Features relacionados: ${features.join(', ')}`)
  if (backlogIds.length) parts.push(`Backlog: ${backlogIds.join(', ')}`)
  return parts.join(' | ')
}

export function runIntake(ideaText: string, paths?: IntakePaths): IntakeResult {
  const target = detectTarget(ideaText)
  const classification = classify(ideaText)
  const relatedAdrs = findRelatedAdrs(ideaText, paths?.decisionsPath)
  const relatedFeatures = findRelatedFeatures(ideaText, paths?.featuresDir)
  const relatedBacklogIds = findRelatedBacklog(ideaText, paths?.backlogPath)
  const needsArchitect = needsArchitectCheck(ideaText, classification)
  const contextSummary = buildContextSummary(target, classification, relatedAdrs, relatedFeatures, relatedBacklogIds)

  return {
    ideaText,
    target,
    classification,
    relatedAdrs,
    relatedFeatures,
    relatedBacklogIds,
    contextSummary,
    needsArchitect,
  }
}
