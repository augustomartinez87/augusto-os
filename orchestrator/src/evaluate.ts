import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..', '..')

const ARQUITECTURA_PATH = path.join(REPO_ROOT, 'system', 'ARQUITECTURA-ACTUAL.md')
const BACKLOG_PATH = path.join(REPO_ROOT, 'system', 'BACKLOG.md')

const MAX_CONTEXT_CHARS = 8_000

function readContextFile(filePath: string, label: string): string {
  if (!existsSync(filePath)) {
    console.warn(`[evaluate] ${label} no encontrado en ${filePath} — degradando a [no disponible]`)
    return `## ${label}\n[no disponible]`
  }
  const content = readFileSync(filePath, 'utf-8').slice(0, MAX_CONTEXT_CHARS)
  return `## ${label}\n${content}`
}

export function readSystemContext(): string {
  const arquitectura = readContextFile(ARQUITECTURA_PATH, 'ARQUITECTURA-ACTUAL.md')
  const backlog = readContextFile(BACKLOG_PATH, 'BACKLOG.md')
  return `${arquitectura}\n\n${backlog}`
}

export function buildEvaluatePrompt(postText: string, systemContext: string): string {
  return `Sos el Evaluator agent de augusto-os. Tu tarea es evaluar un post de X/Twitter contra la arquitectura real del sistema y decidir si la idea que propone ya existe, vale la pena implementarla, es bait, o debe ignorarse.

## Contexto del sistema
${systemContext}

## Post a evaluar
"${postText}"

## Instrucciones de evaluación

Respondé las tres preguntas siguientes. Sé directo y concreto; 2-3 oraciones por pregunta:

1. **¿Ya está implementado y dónde?** Si la idea (o algo funcionalmente equivalente) ya existe en el orchestrator, indicá exactamente en qué archivo o función. Si no existe, decilo.
2. **¿Vale la pena y qué beneficio concreto trae?** Si no está implementado, evaluá si tiene valor real para el sistema actual. El beneficio debe ser concreto y medible, no abstracto.
3. **¿Es bait y por qué?** Indicá si es una idea que suena bien pero no aplica al contexto real, introduce complejidad innecesaria, o desvía el foco sin beneficio claro.

Respondé SOLO con el siguiente JSON (sin texto antes ni después, sin fences de código):

{
  "etiqueta": "<YA-EXISTE|IMPLEMENTAR|BAIT|IGNORAR>",
  "resumen": "<prosa corta de 2-4 oraciones que condensa las tres respuestas>"
}

Reglas para la etiqueta:
- \`YA-EXISTE\`: la idea o algo funcionalmente equivalente ya está implementada en el sistema.
- \`IMPLEMENTAR\`: no existe aún, tiene valor concreto y vale la pena hacerla.
- \`BAIT\`: suena atractivo pero introduce complejidad innecesaria, no aplica al contexto, o desvía el foco sin beneficio claro.
- \`IGNORAR\`: no aplica al sistema, es irrelevante, o no hay información suficiente para evaluarla.`
}
