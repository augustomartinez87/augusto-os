import { runEvaluate } from './evaluate.js'

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf-8').trim()
}

async function main(): Promise<void> {
  let postText: string

  if (process.argv[2]) {
    postText = process.argv[2]
  } else {
    console.log('[evaluate] Leyendo post desde stdin (Ctrl+D para terminar)...')
    postText = await readStdin()
  }

  if (!postText.trim()) {
    console.error('[evaluate] Error: no se proporcionó texto del post.')
    process.exit(1)
  }

  console.log('\n[evaluate] Evaluando post con Architect (Opus)... esto puede tardar ~30-60s')

  const result = await runEvaluate(postText)

  console.log(`\n[evaluate] Veredicto: ► ${result.etiqueta}`)
  console.log(`\n[evaluate] Resumen:\n  ${result.resumen}`)
}

main().catch((e: Error) => {
  console.error('[evaluate] Error fatal:', e.message)
  process.exit(1)
})
