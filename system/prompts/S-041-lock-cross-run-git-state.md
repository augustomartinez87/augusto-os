> Prompt para Claude Code. Ejecutor: Sonnet. Repo: augusto-os (target `sistema`, carpeta `orchestrator/`). Rama únicamente — NO mergees ni pushees a main. Este código es el pipeline que auto-deploya a producción en otros repos (Kredy/Argos/Spensiv/3 Salteñas) sin gate humano por-step (ADR-0019); un bug en el fix puede trabar o, peor, deadlockear el loop completo. Merge lo hace Augusto a mano después de revisar.

## Contexto (diagnóstico real, ya verificado — no re-investigues desde cero)

Incidente real 2026-07-13/14 (F-0028 step 3, ver BACKLOG.md S-041): `STATE.json` quedó con `blocked`/`commit: null` mientras el commit real (`099927c`) era válido. Sospecha original: colisión de git entre `orch-sync` (pm2) y un loop manual corriendo en paralelo. Diagnostiqué la causa raíz exacta en el código:

1. **`orchestrator/src/state.ts:7`** — `STATE_PATH = path.join(__dirname, '..', 'STATE.json')` es una ruta ÚNICA y FIJA, no namespaced por `featureId` ni por target. `loadState()`/`saveState()` (mismo archivo, defaults a `STATE_PATH`) son compartidos por CUALQUIER proceso del orquestador, sin importar en qué repo esté trabajando. Dos procesos corriendo a la vez — sin importar si son del mismo target o no — leen y pisan el mismo archivo.

2. **`orchestrator/src/index.ts`, función `main()` (~línea 75)** — un `npm start <featureId>` manual llama `loadState()`/`startFeature()`/`runLoop()` directo. NO llama a `acquireLock()`/`releaseLock()` en ningún punto. El mutex que sí existe (`AUTOPILOT.lock`, `LOCK_PATH`, `acquireLock()`/`releaseLock()` en `autopilot.ts` líneas ~192-249) es privado del flujo de autopilot: solo evita que **autopilot se auto-duplique** en la ventana del Planner. Un run manual nunca lo consulta ni lo respeta — no hay ninguna coordinación entre un run manual y uno de autopilot, ni entre dos runs manuales concurrentes.

3. **`orchestrator/targets/targets.json`** — cada target tiene un único `path` fijo (ej. kredy → `C:/Users/Augusto/Downloads/Proyectos/kredy`). `git.ts` (`createFeatureBranch`/`commitStep`/`mergeIntoMain`/`pushMain`) opera siempre sobre `getRepoRoot()`, ese mismo working tree — confirmé que no se usa `git worktree` en ningún lado del código (`grep -rn worktree src/` → sin resultados). Dos runs sobre el MISMO target chocan en checkout/staging/commit real.

4. **Ya existe la señal de vida necesaria para resolver esto sin construir nada nuevo:** `index.ts` YA llama `writeLoopHeartbeat(featureId, fase)` en varios puntos (planning/planned/building:step-N/verifying:step-N/merging/deploying — grep `writeLoopHeartbeat` en `index.ts`), y `acquireLock()` YA usa `readLoopHeartbeat()`/`isLoopHeartbeatFresh()` (umbral `LOOP_HB_STALE_MS` = 3 min, `loop-heartbeat.ts`) para decidir si un lock existente corresponde a un proceso vivo antes de pisarlo. Es decir: la infraestructura de detección de "hay un run vivo" ya está completa y testeada (`autopilot.test.ts`); lo único que falta es que `index.ts` la use para sí mismo, no solo autopilot para su propia ventana de spawn.

**Nota sobre `autopilot.ts` (no la toques salvo lo del punto 2 del diseño):** hoy autopilot adquiere el lock, corre el Scout (investigación read-only sobre el target, puede incluir `git log`/`git diff`/`git status` — confirmá si aplica), spawnea `npm start <featureId>` fire-and-forget (`detached: true`, línea ~263) y libera el lock casi inmediatamente después del spawn (comentario explícito: "takes 30-90s to create STATE.json via Planner" — el release NO espera a que el hijo termine ni a que arranque). Esto es intencional y está bien para el propósito original (evitar doble-spawn en el tick de 5s), pero significa que con el fix de abajo queda una ventana chica entre que el padre libera el lock y el hijo lo vuelve a tomar. Aceptá esa ventana como riesgo residual (es de milisegundos de arranque de proceso, no los 30-90s del Planner, si el hijo toma el lock como primera acción de `main()`) — NO construyas un handshake entre padre e hijo para cerrarla del todo, es sobreingeniería para este caso de uso (un solo operador).

## Diseño

Extendé el alcance de `AUTOPILOT.lock` (mismo archivo, mismo `acquireLock`/`releaseLock`, no renombres la constante salvo que tengas una razón de peso) para que cubra **cualquier ejecución del loop**, no solo la ventana de spawn de autopilot:

- `index.ts` `main()` adquiere el lock como PRIMERA acción real (antes de `loadState()`/`startFeature()`), tanto en el camino de arranque nuevo (`args[0]` = featureId) como en el de resume (STATE.json ya existe). Si `acquireLock()` devuelve `false`, no bloquees ni reintentes — logueá con qué featureId/fase está ocupado el lock (usá `readLoopHeartbeat()` para eso, mismo patrón que el mensaje de log que ya existe en `acquireLock()`) y salí con `process.exit(1)` — mismo estilo que el guard anti-reejecución existente (líneas ~86-92: `log('[main] ⚠ ...')` + exit), pero acá SÍ es un código de salida de fallo real (no hizo lo que se le pidió), a diferencia de ese caso.
- El resto de la ejecución de `main()` (todo lo que hoy pasa por `runLoop()`, merge, push) queda bajo el lock — liberalo en un `finally` que cubra TODO el bloque, para que se libere incluso si `runLoop()` tira una excepción no capturada. Mirá el patrón que ya usa `autopilot.ts` en su propio try/finally (líneas ~314-409) y replicalo.
- El branch `--approve` del CLI (líneas ~64-71, `clearHumanGate` + exit inmediato) NO necesita el lock — es una mutación síncrona instantánea, no compite por el working tree. Dejalo como está.
- Esto resuelve, como efecto colateral y sin tocar `state.ts` ni `git.ts`: mientras el lock esté extendido a cubrir toda la duración del run, es estructuralmente imposible que dos procesos lean/escriban `STATE.json` a la vez o pisen el working tree de un target a la vez — no hace falta namespacear `STATE.json` por featureId ni meter `git worktree`. Si en algún punto de la implementación ves que esto NO alcanza para algún caso concreto (ej. dos targets distintos que en teoría podrían correr en paralelo sin problema y el lock global se lo impide innecesariamente), anotalo en el ADR final como limitación conocida — no lo resuelvas expandiendo el alcance sin que yo lo vea primero.

Si preferís un diseño distinto (ej. lock por-target en vez de global), es una decisión de arquitectura con impacto real en cuánto paralelismo se pierde — dejala explícita en el ADR si te desviás de lo de arriba, no la asumas en silencio.

## Tareas

1. Refactor mínimo en `index.ts` para que la lógica de "intentar tomar el lock, loguear quién lo tiene si falla, salir" quede en una función exportada y testeable (mismo patrón de las opciones inyectables que ya usa el codebase — `PlannerOpts.callClaude?`, `ReviewerOpts` — no hace falta ese nivel de inyección acá, alcanza con extraer la función pura del cuerpo de `main()`).
2. Cablear esa función en ambos caminos de `main()` (arranque nuevo y resume) + el `finally` de liberación alrededor de `runLoop()`.
3. Tests nuevos (`index.test.ts`, hoy solo cubre `appendProgress` — sumá un describe nuevo) cubriendo: (a) lock libre → adquiere y procede; (b) lock tomado con heartbeat fresco → no procede, exit code de fallo; (c) lock tomado pero heartbeat stale → lo reclama y procede (mismo comportamiento que ya prueba `autopilot.test.ts` para `acquireLock`, no dupliques esos tests — solo verificá que `index.ts` invoca el flujo correctamente). Usá tmpdir + paths inyectados como ya hace `index.test.ts`/`autopilot.test.ts`, no toques el `STATE.json`/`AUTOPILOT.lock` reales del repo.
4. Suite completa (`npm test`) + `npx tsc --noEmit` limpios.

## Restricciones

- No toques `state.ts` ni `git.ts` — el fix vive enteramente en el lock/`index.ts`.
- No renombres `AUTOPILOT.lock`/`LOCK_PATH` salvo que sea trivial y lo justifiques en el ADR (no es necesario para que el fix funcione).
- No construyas coordinación entre proceso padre (autopilot) e hijo (loop spawneado) más allá de lo que ya existe (heartbeat + lock file) — la ventana residual de milisegundos descrita arriba es aceptable.
- No toques `AUTOPILOT.lock`/gating de `tryAutopilotPick` salvo que el testing te muestre que rompe algo puntual — el objetivo es que autopilot siga funcionando exactamente igual, solo que ahora un run manual también respeta el mismo lock.
- Rama nueva (`fix/S-041-lock-cross-run`), commiteá ahí. NO merge, NO push a main — lo reviso y mergeo yo.

## Al terminar

Reportá: diff resumido, resultado de tests/tsc, y un escenario simulado concreto (aunque sea manual, corriendo dos procesos a mano) que demuestre que el segundo `npm start` con el lock tomado sale limpio en vez de pisar el primero. ADR si tomaste alguna decisión no cubierta arriba (especialmente si el lock quedó global vs. por-target, o si tocaste el timing de release de autopilot).
