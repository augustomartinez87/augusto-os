import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DECISIONS_PATH = path.join(__dirname, '..', '..', 'system', 'DECISIONS.md')

const VALID_ORIGINS = ['Instrucción de Augusto', 'Supuesto del agente', 'Derivada'] as const

export interface AdrDraft {
  target: string
  origen: string
  titulo: string
  decision: string
  contexto: string
  alternativas: string
  consecuencias: string
}

function extractField(block: string, field: string): string {
  const re = new RegExp(`^\\s*${field}:\\s*(.*)$`, 'im')
  return re.exec(block)?.[1]?.trim() ?? ''
}

function normalizeOrigen(raw: string): string {
  if ((VALID_ORIGINS as readonly string[]).includes(raw)) return raw
  return `Supuesto del agente (${raw})`
}

export function parseAdrBlocks(output: string): AdrDraft[] {
  const blocks: AdrDraft[] = []
  const re = /===ADR===([\s\S]*?)===END ADR===/g
  let m
  while ((m = re.exec(output)) !== null) {
    const body = m[1]
    blocks.push({
      target:        extractField(body, 'target'),
      origen:        extractField(body, 'origen'),
      titulo:        extractField(body, 'titulo'),
      decision:      extractField(body, 'decision'),
      contexto:      extractField(body, 'contexto'),
      alternativas:  extractField(body, 'alternativas'),
      consecuencias: extractField(body, 'consecuencias'),
    })
  }
  return blocks
}

export function appendAdr(draft: AdrDraft, featureId: string, stepId: number, filePath?: string): number {
  const p = filePath ?? DECISIONS_PATH
  const content = existsSync(p) ? readFileSync(p, 'utf-8') : ''

  const idRe = /ADR-(\d{4})/g
  let max = 0
  let m
  while ((m = idRe.exec(content)) !== null) {
    const n = parseInt(m[1], 10)
    if (n > max) max = n
  }
  const nextId = max + 1
  const idStr = `ADR-${String(nextId).padStart(4, '0')}`
  const today = new Date().toISOString().split('T')[0]
  const origen = normalizeOrigen(draft.origen)

  const entry = [
    `## ${idStr} · ${today} · ${draft.titulo}`,
    ``,
    `**Estado:** aceptada`,
    `**Origen:** ${origen}`,
    `**Target:** ${draft.target || 'sistema'}`,
    ``,
    `**Decisión:** ${draft.decision}`,
    `**Contexto:** ${draft.contexto}`,
    `**Alternativas descartadas:** ${draft.alternativas || 'ninguna'}`,
    `**Consecuencias / riesgo residual:** ${draft.consecuencias || 'ninguna'}`,
    ``,
    `> Generado por el loop · feature ${featureId} · step ${stepId}`,
    ``,
    `---`,
    ``,
  ].join('\n')

  // Insert newest-first: before the first real ADR entry (4-digit ID), which sits AFTER
  // the template block. Using \d{4} avoids matching ## ADR-XXXX inside the template fence.
  const insertIdx = content.search(/\n## ADR-\d{4}/)
  const newContent = insertIdx === -1
    ? content + entry
    : content.slice(0, insertIdx + 1) + entry + content.slice(insertIdx + 1)

  writeFileSync(p, newContent, 'utf-8')
  return nextId
}

export interface AdrMeta {
  id: number
  idStr: string
  titulo: string
  origen: string
}

export function readAdrMeta(ids: number[], filePath?: string): AdrMeta[] {
  if (!ids.length) return []
  const p = filePath ?? DECISIONS_PATH
  if (!existsSync(p)) return ids.map(id => ({ id, idStr: `ADR-${String(id).padStart(4, '0')}`, titulo: '', origen: '' }))

  const content = readFileSync(p, 'utf-8')
  return ids.map(id => {
    const idStr = `ADR-${String(id).padStart(4, '0')}`
    const titulo = new RegExp(`## ${idStr} · \\d{4}-\\d{2}-\\d{2} · ([^\\n]+)`).exec(content)?.[1]?.trim() ?? ''
    const origen = new RegExp(`## ${idStr}[\\s\\S]*?\\*\\*Origen:\\*\\* ([^\\n]+)`).exec(content)?.[1]?.trim() ?? ''
    return { id, idStr, titulo, origen }
  })
}
