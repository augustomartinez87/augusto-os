import { execa } from 'execa'
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { MODEL_ARCHITECT } from './models.js'
import type { IntakeResult } from './intake.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FEATURES_DIR = path.join(__dirname, '..', 'features')
const TEMPLATE_PATH = path.join(FEATURES_DIR, '_TEMPLATE.md')
const REPO_ROOT = path.join(__dirname, '..', '..')

export function getNextFeatureId(featuresDir?: string): string {
  const dir = featuresDir ?? FEATURES_DIR
  let max = 0
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      const m = /^F-(\d{4})\.md$/.exec(f)
      if (m) {
        const n = parseInt(m[1], 10)
        if (n > max) max = n
      }
    }
  }
  return `F-${String(max + 1).padStart(4, '0')}`
}

function loadRelatedContent(intake: IntakeResult, featuresDir: string): string {
  const parts: string[] = []
  for (const fId of intake.relatedFeatures.slice(0, 3)) {
    const fp = path.join(featuresDir, `${fId}.md`)
    if (existsSync(fp)) {
      const excerpt = readFileSync(fp, 'utf-8').slice(0, 600)
      parts.push(`### ${fId}\n${excerpt}`)
    }
  }
  return parts.join('\n\n')
}

export function buildArchitectPrompt(
  intake: IntakeResult,
  template: string,
  featureId: string,
  relatedContent?: string,
): string {
  const relatedIds = [...intake.relatedAdrs, ...intake.relatedFeatures].join(', ') || 'ninguno identificado'
  const related = relatedContent?.trim() || 'Ninguno.'

  return `Sos el Architect agent de augusto-os. Tu tarea es escribir el spec completo de una feature NUEVA siguiendo exactamente el template y la Definition of Ready provistos.

## Contexto del intake
${intake.contextSummary}

## Idea original
"${intake.ideaText}"

## Ítems relacionados (para no reinventar)
ADRs/features identificados por grep: ${relatedIds}

${related !== 'Ninguno.' ? `### Excerpts de features relacionados\n${related}` : ''}

## Template a seguir
${template}

## Instrucciones de escritura

1. Asigná el ID: **${featureId}** (reemplazá F-XXXX en el frontmatter).
2. Respondé SOLO con el contenido del .md (frontmatter + secciones). Sin texto extra antes ni después. Empezá con "---".
3. Completá TODAS las secciones del template. No dejés ninguna en blanco ni con placeholder genérico.
4. Definition of Ready — el spec DEBE:
   - Tener \`target\`, \`ui\`, y al menos 2 criterios de aceptación observables (verificables sí/no).
   - Tener un "Fuera de alcance" explícito.
   - Declarar si toca DB/prod/legal (con texto como "Toca DB → gate humano requerido").
   - Nombrar qué existe en el repo que el loop debe reusar (archivos, helpers, patrones con rutas).
5. Target a usar: **${intake.target !== 'unknown' ? intake.target : 'determinar según la idea'}**
6. Si la idea toca DB/prod/legal, declaralo en "Restricciones clave": "Toca DB → gate humano requerido antes de correr migraciones."
7. NO incluyas pasos de migración SQL, deploy a Vercel ni cambios legales como steps ejecutables. Ponelos en "Restricciones clave".
8. Pasos sugeridos: atómicos, implementables de forma independiente, que typechequeen solos. Máximo 10. Mínimo 2.`
}

function extractMarkdownContent(raw: string): string {
  let text = raw.trim()

  // Strip ``` fences that the model might add
  const fenced = /^```(?:yaml|markdown|md)?\s*\n([\s\S]+?)\n```\s*$/m.exec(text)
  if (fenced) text = fenced[1].trim()

  // Find the start of frontmatter in case there's preamble text
  const idx = text.indexOf('---')
  if (idx > 0) text = text.slice(idx)

  if (!text.startsWith('---')) {
    throw new Error(`Architect no devolvió frontmatter válido. Primeros 300 chars:\n${raw.slice(0, 300)}`)
  }

  return text
}

export interface ArchitectOpts {
  featuresDir?: string
  templatePath?: string
  // Injectable for tests — receives the full prompt, returns raw Claude output
  callClaude?: (prompt: string) => Promise<string>
}

async function defaultCallClaude(prompt: string): Promise<string> {
  const result = await execa('claude', [
    '--model', MODEL_ARCHITECT,
    '--max-turns', '1',
    '--output-format', 'text',
    '--dangerously-skip-permissions',
    '--strict-mcp-config',
    '-p', prompt,
  ], {
    cwd: REPO_ROOT,
    reject: false,
    stdin: 'ignore',
  })

  if (result.exitCode !== 0) {
    throw new Error(`Architect (Claude) falló con código ${result.exitCode}:\n${result.stderr}`)
  }

  return result.stdout
}

export async function runArchitect(intake: IntakeResult, opts?: ArchitectOpts): Promise<string> {
  const featuresDir = opts?.featuresDir ?? FEATURES_DIR
  const templatePath = opts?.templatePath ?? TEMPLATE_PATH
  const callClaude = opts?.callClaude ?? defaultCallClaude

  const template = readFileSync(templatePath, 'utf-8')
  const featureId = getNextFeatureId(featuresDir)
  const relatedContent = loadRelatedContent(intake, featuresDir)
  const prompt = buildArchitectPrompt(intake, template, featureId, relatedContent)

  const raw = await callClaude(prompt)
  let content = extractMarkdownContent(raw)

  // Ensure the assigned featureId is in the content (in case Opus used the placeholder)
  content = content.replace(/id:\s*F-XXXX/i, `id: ${featureId}`)

  const filePath = path.join(featuresDir, `${featureId}.md`)
  writeFileSync(filePath, content.endsWith('\n') ? content : content + '\n', 'utf-8')

  return filePath
}
