import { pushBacklogFile } from './backlog.js'

// Uso: npm run backlog:push -- "mensaje corto describiendo qué se reconcilió"
//
// Para cerrar sesiones MANUALES (Cowork/Claude Code fuera del loop) que editaron
// system/BACKLOG.md a mano — verificando contra código/logs/DB que un ítem estaba done,
// descartado, o corrigiendo una descripción — y necesitan que ese cambio salga de esta
// máquina. El loop automático (`npm start F-XXXX`) ya hace esto solo vía
// commitAndPushBacklog(); este CLI es el equivalente para todo lo que pasa fuera de él.
async function main(): Promise<void> {
  const message = process.argv[2]

  if (!message || !message.trim()) {
    console.error('[backlog-cli] Error: falta el mensaje. Uso: npm run backlog:push -- "mensaje"')
    process.exit(1)
  }

  const result = await pushBacklogFile(message.trim())

  if (result.pushed) {
    console.log(`[backlog-cli] system/BACKLOG.md comiteado y pusheado a augusto-os/${result.branch}.`)
  } else if (result.committed) {
    console.error(`[backlog-cli] Comiteado localmente pero el push falló: ${result.error}`)
    process.exit(1)
  } else if (result.error) {
    console.error(`[backlog-cli] No se comiteó: ${result.error}`)
    process.exit(1)
  } else {
    console.log('[backlog-cli] Sin cambios pendientes en system/BACKLOG.md — nada que hacer.')
  }
}

main().catch((e: Error) => {
  console.error('[backlog-cli] Error fatal:', e.message)
  process.exit(1)
})
