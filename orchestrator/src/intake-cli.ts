import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { runIntake } from './intake.js'
import { runArchitect } from './architect.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const INTAKE_FILE = path.join(__dirname, '..', '..', 'system', 'FEATURE-INTAKE.md')

const IDEA_LINE_RE = /^- \[\d{4}-\d{2}-\d{2}T[^\]]+\] \((?:telegram|web)\) (.+)$/

function readLastUnprocessedIdea(): { text: string; lineIndex: number } | null {
  if (!existsSync(INTAKE_FILE)) return null

  const lines = readFileSync(INTAKE_FILE, 'utf-8').split('\n')
  let lastIdx = -1
  let lastText = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes('<!-- procesado -->')) continue
    const m = IDEA_LINE_RE.exec(line)
    if (m) {
      lastIdx = i
      lastText = m[1].trim()
    }
  }

  if (lastIdx === -1) return null
  return { text: lastText, lineIndex: lastIdx }
}

function markProcessed(lineIndex: number): void {
  const lines = readFileSync(INTAKE_FILE, 'utf-8').split('\n')
  lines[lineIndex] = lines[lineIndex] + ' <!-- procesado -->'
  writeFileSync(INTAKE_FILE, lines.join('\n'), 'utf-8')
}

async function main(): Promise<void> {
  const cliArg = process.argv[2]
  const forceArchitect = process.argv.includes('--force-architect')

  let ideaText: string
  let fromFile = false
  let lineIndex = -1

  if (cliArg && cliArg !== '--force-architect') {
    ideaText = cliArg
  } else {
    const last = readLastUnprocessedIdea()
    if (!last) {
      console.log('[intake] No hay ideas sin procesar en system/FEATURE-INTAKE.md')
      process.exit(0)
    }
    ideaText = last.text
    lineIndex = last.lineIndex
    fromFile = true
    console.log(`[intake] Procesando última idea sin procesar: "${ideaText}"`)
  }

  console.log('\n[intake] Corriendo análisis...')
  const result = runIntake(ideaText)

  console.log('\n[intake] Resultado:')
  console.log(`  target:          ${result.target}`)
  console.log(`  classification:  ${result.classification}`)
  console.log(`  relatedAdrs:     ${result.relatedAdrs.join(', ') || 'ninguno'}`)
  console.log(`  relatedFeatures: ${result.relatedFeatures.join(', ') || 'ninguno'}`)
  console.log(`  relatedBacklog:  ${result.relatedBacklogIds.join(', ') || 'ninguno'}`)
  console.log(`  needsArchitect:  ${result.needsArchitect}`)
  console.log(`  contextSummary:  ${result.contextSummary}`)

  if (!result.needsArchitect && !forceArchitect) {
    console.log('\n[intake] Idea trivial o muy vaga — no amerita gastar Opus.')
    console.log('[intake] Opciones:')
    console.log('  1. Revisala y escribí el spec a mano desde orchestrator/features/_TEMPLATE.md')
    console.log('  2. Forzá el Architect con --force-architect si querés igualmente el spec automático')
    if (fromFile) markProcessed(lineIndex)
    process.exit(0)
  }

  console.log('\n[intake] Invocando Architect (Opus)... esto puede tardar ~30-60s')
  const filePath = await runArchitect(result)

  console.log(`\n[intake] Spec escrito en: ${filePath}`)
  console.log('[intake] Revisá el spec antes de correr: npm start <feature-id>')

  if (fromFile) markProcessed(lineIndex)
}

main().catch((e: Error) => {
  console.error('[intake] Error fatal:', e.message)
  process.exit(1)
})
