// src/bot.ts — proceso del bot de Telegram (S-006). Correr con `npm run bot`,
// en paralelo al loop. Escucha gates y la cola de ideas.
import { runTelegramListener } from './telegram.js'

runTelegramListener().catch((e) => {
  console.error('[bot] error fatal:', e)
  process.exit(1)
})
