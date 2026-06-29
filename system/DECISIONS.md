# ADR — Architecture Decision Records · augusto-os

Registro de decisiones de diseño. Cada decisión es un **ADR** inmutable: una vez aceptada no se edita, se **reemplaza** por uno nuevo que la supersede (dejando trazabilidad).

El objetivo de este archivo es doble: (1) documentar el *por qué* detrás de cada decisión, y (2) ser **autosuficiente** — cualquier agente (Claude, Llama, otro) debe poder leer esto y retomar el contexto sin reconstruirlo. Por eso cada entrada declara explícitamente su **Origen**: si la decisión fue una instrucción de Augusto o un supuesto que tomó el agente por su cuenta. Eso permite auditar después qué se decidió deliberadamente vs. qué asumió la máquina.

## Template (copiar para cada ADR nuevo)

```
## ADR-0033 · 2026-06-27 · S-027: heartbeat del loop de build + lock por liveness

**Estado:** aceptada
**Origen:** Instrucción de Augusto
**Target:** sistema

**Decisión:** Dos señales de vida separadas: (1) `planner`/`builder` en `orch_presence` siguen siendo el heartbeat de `sync.ts` (control plane alive, cada 5s); (2) nueva fila `role='loop'` en `orch_presence` cuyo `last_heartbeat` viene de `index.ts` (proceso de build alive) vía `LOOP_HEARTBEAT.json`. Lock (`AUTOPILOT.lock`) ahora guarda `featureId` y `acquireLock` respeta el lock si hay heartbeat fresco del loop (proceso vivo) independientemente de la antigüedad del lock. Dashboard usa `presenceMap.loop.last_heartbeat` para staleness del slot Builder; si no existe, hace fallback al heartbeat de `builder` (sync.ts). Umbral de liveness del lock: `LOOP_HB_STALE_MS = 3 min` (> `CUELGUE_SEC = 2 min` de ADR-0032). `markBacklogState` retorna `boolean`; `tryAutopilotPick` solo marca `marked=true` si la fila realmente existió.
**Contexto:** ADR-0032 (S-015) documentó explícitamente la limitación: "Un loop colgado dentro del proceso seguirá mostrando heartbeat fresco si sync.ts sobrevive". El bug `Lock stale (660s), pisando...` ocurre cuando el lock tiene >10 min (Architect lento o proceso colgado) y se sobreescribe aunque el loop esté vivo. `markBacklogState: ID NONEXISTENT-999 no encontrado` ocurre cuando `AUTOPILOT_MAP.json` tiene una entrada stale o cuando el backlog fue editado manualmente entre el pick y el mark.
**Alternativas descartadas:** Heartbeat directo de index.ts a Supabase (requiere credenciales en el loop, que hoy solo las tiene sync.ts). Señal vía IPC/socket entre sync.ts e index.ts (sobrecomplejo para procesos detached). Lock basado en PID + kill-check (frágil en Windows con procesos detached).
**Consecuencias:** Si `index.ts` se cuelga en una LLM call, su heartbeat deja de avanzar en ≤3 min; el dashboard lo muestra como "posible cuelgue" (> CUELGUE_SEC = 2 min) y el lock pasa a ser reclamable (>3 min). ADR-0032 queda supersedido para la limitación de liveness del loop. sync.ts debe reiniciarse para empezar a emitir el rol `loop` (requiere que `index.ts` esté corriendo y haya escrito `LOOP_HEARTBEAT.json`).

> S-027 · 2026-06-27

---
```

## ADR-0038 · 2026-06-29 · S-031: centralizar MAX_TURNS y fix visibilidad de errores del CLI

**Estado:** aceptada
**Origen:** Instrucción de Augusto
**Target:** sistema

**Decisión:** `MAX_TURNS = 15` exportado desde `models.ts` (junto a los `MODEL_*`). Los tres agentes LLM (`defaultCallClaude` de `architect.ts`, `planner.ts`, `reviewer.ts`) usan `String(MAX_TURNS)` en lugar del literal `'1'` que cortaba el loop cuando claude emitía un `tool_use` en el turno 1 antes de producir output final. Error de visibilidad: el `throw` de cada agente incluye ahora `stdout` además de `stderr`. `planFeature` refactorizado con `PlannerOpts.callClaude?` injectable, siguiendo el patrón de `architect.ts` y `reviewer.ts`, para hacer testeable el camino de error.
**Contexto:** El autopilot fallaba en AR-005 con `Error: Reached max turns (1)`. El CLI de claude cambió de comportamiento: con prompts complejos el modelo emite un `tool_use` en el turno 1 antes de emitir el texto final, y con `--max-turns 1` el loop cortaba exactamente ahí → exit 1 → Architect nunca devolvía el spec. Cualquier valor > 1 hubiera bastado; se eligió 15 para dar margen a razonamientos que encadenan múltiples herramientas. El mismo problema aplica a Planner y Reviewer aunque sus prompts sean más simples: se arreglan por consistencia y prevención.
**Alternativas descartadas:** `--max-turns 2` (hubiera resuelto el caso inmediato pero no prompts más largos de Architect). Sin tope (loops infinitos potenciales si el modelo no converge). Un tope por agente en vez de compartido (no hay razón para diferenciar; centralizar es más mantenible, siguiendo S-019).
**Consecuencias:** Un agente que no converja en 15 turnos igualmente falla, pero es una condición anómala que indica un prompt problemático. AR-005 devuelto a `pending` para reintento. Campo `MAX_TURNS` en `models.ts` es el único punto de ajuste si en el futuro se quiere cambiar el tope.

> S-031 · 2026-06-29

---

## ADR-0037 · 2026-06-28 · S-030: clasificación de ejecutor del backlog + autopilot por allowlist

**Estado:** aceptada
**Origen:** Instrucción de Augusto
**Target:** sistema

**Decisión:** Agregar columna `Ejecutor` (`auto` | `cc` | `manual`) a la tabla de `BACKLOG.md` como campo explícito de elegibilidad del autopilot. El autopilot (`parseEligibleBacklog`) cambia su filtro primario de lista negra por palabras a lista blanca: sólo toma ítems con `Ejecutor=auto`. Fail-safe: columna ausente o vacía → `manual`. Mantener el chequeo de keywords de riesgo como red de seguridad secundaria: si un ítem `auto` contiene dinero/prod/legal/migración, se salta con warning en lugar de ejecutarse. Campo espejado a `orch_backlog.ejecutor` en Supabase vía `sync.ts`. El backlog actual se clasificó con valores conservadores: todos los ítems de Sistema → `cc`; migraciones y features que tocan dinero/prod en Kredy → `manual`; setup dev sin riesgo de prod (Spensiv seed, Argos) → `cc`; ningún ítem promovido a `auto` (decisión de Augusto).

**Contexto:** El autopilot (S-004) usaba una lista negra de keywords para excluir ítems riesgosos. Es frágil: puede dejar pasar algo peligroso que no use esas palabras, o bloquear algo seguro que las contenga accidentalmente. La inversión a allowlist garantiza que solo los ítems explícitamente aprobados por Augusto (`auto`) corran solos. Candidatos a `auto` identificados pero no promovidos aún (Augusto decide): AR-003 (polish de prompt), SPT-001 (seed data dev Spensiv), AR-004 (Supabase branch dev Argos).

**Alternativas descartadas:** Mantener lista negra extendida (no resuelve el problema de cobertura incompleta). Campo en un YAML separado (más fricción que la columna inline en BACKLOG.md). Clasificación en Supabase como fuente de verdad (BACKLOG.md es la fuente de verdad per CONVENTIONS §1).

**Consecuencias:** Ningún ítem corre en autopilot a menos que Augusto lo marque `auto` explícitamente. El dashboard puede mostrar el ejecutor de cada ítem (requiere `ALTER TABLE orch_backlog ADD COLUMN IF NOT EXISTS ejecutor text DEFAULT 'manual'` en Supabase). Los tests de `parseEligibleBacklog` actualizados: 256 tests verdes. El campo en `BacklogRow` es `ejecutor: string`; siempre `'auto'` en los ítems retornados.

> S-030 · 2026-06-28

---

## ADR-0036 · 2026-06-28 · S-025: retención de logs — disco 30 días, Supabase 7 días, throttle 1 hora

**Estado:** aceptada
**Origen:** Supuesto del agente (auditable — Augusto puede ajustar los umbrales en `log-cleanup.ts`)
**Target:** sistema

**Decisión:** Crear `log-cleanup.ts` con tres umbrales exportados: `DISK_LOG_RETENTION_DAYS=30`, `SUPABASE_LOG_RETENTION_DAYS=7`, `CLEANUP_INTERVAL_MS=1h`. El cleanup corre desde `sync.ts` (que ya tiene el tick cada 5s), throttleado via `shouldRunCleanup(lastCleanupAt)`: primera ejecución al arrancar sync.ts, luego cada hora. Disco: borra `logs/*.log` y `loop-F-XXXX.log`/`blocked.log` de la raíz con mtime < 30 días, con doble guarda: siempre preserva `orchestrator.log` (sync.ts tiene un `logOffset` en memoria que apunta a él) y cualquier archivo que contenga el featureId activo. Supabase: DELETE a `orch_logs` donde `ts < now - 7d`, con `Prefer: return=representation` para contar filas eliminadas. No-op si Supabase no está configurado.

**Contexto:** 39 archivos en `logs/` (136K), 2414 líneas en `orchestrator.log`, un solo run de prueba dejó 18 filas en `orch_logs`. El dashboard lee siempre `.order("ts", desc).limit(60)` — el cleanup no lo afecta bajo ninguna condición. `sync.ts` hace 720 ticks/hora; sin throttle cada tick haría un DELETE a Supabase.

**Alternativas descartadas:** Retención por número de filas (K últimas) en vez de antigüedad — más complejo, requiere COUNT + DELETE en dos queries. Cleanup en un proceso/cron separado — sync.ts ya está siempre corriendo y tiene acceso a `rest()`. Rotar `orchestrator.log` — sync.ts mantiene `logOffset` en memoria apuntando al archivo; borrarlo en un run activo corrompería el offset.

**Consecuencias:** Los 39 logs existentes (F-0001 a F-0007) serán borrados en el primer cleanup que corra (todos tienen más de 30 días si el repo tiene < 30 días de features, o se preservan si son recientes). `blocked.log` se borra por antigüedad (inofensivo: es un audit trail de rechazos, 1 línea actualmente). Las constantes de umbral están en `log-cleanup.ts` — Augusto las puede cambiar sin tocar sync.ts ni la lógica de build.

> S-025 · 2026-06-28

---

## ADR-0035 · 2026-06-28 · S-029: coordinación bot + loop para evitar 409 Conflict de Telegram

**Estado:** aceptada
**Origen:** Instrucción de Augusto
**Target:** sistema

**Decisión:** Crear `bot-heartbeat.ts` con `writeBotHeartbeat()` / `isBotAlive()`. El bot escribe `BOT_HEARTBEAT.json` al inicio de cada ciclo de long-poll (~10s). El gate-wait del loop chequea `isBotAlive()` antes de llamar `pollApprovalOnce()`: si el bot está vivo, el loop solo duerme 3s y relee STATE.json; si el bot está caído o nunca arrancó, el loop pollea Telegram directamente. Umbral de staleness del bot: 30s (= 3 ciclos perdidos). STATE.json sigue siendo la fuente de verdad del approve en ambos casos — la condición del while siempre es `loadState()?.needsHumanApproval`.

**Contexto:** ADR-0034 (S-028) embebió `pollApprovalOnce()` en el loop para no depender del bot. Pero cuando `npm run bot` Y el loop corren a la vez, ambos hacen `getUpdates` con el mismo token → Telegram devuelve 409 Conflict al segundo consumidor. El loop nunca procesaba el callback porque el bot siempre tenía el long-poll abierto (timeout=10s > timeout=5s del loop). El 409 no rompía nada (el loop detecta el approve vía STATE.json escrito por el bot), pero era ruido innecesario y podría causar race conditions si el timing cambia.

**Alternativas descartadas:** Un único proceso que maneje ideas Y gates (fusionar bot + loop): complica demasiado el ciclo de vida. Webhook para el bot y long-poll solo para el loop: requiere URL pública. Canal IPC entre bot y loop: sobrecomplejo.

**Consecuencias:** Con los 3 procesos corriendo (sync, bot, loop): el bot es el único consumidor de getUpdates, sin 409. El loop queda 100% coordinado vía STATE.json. Si el bot cae mientras el loop espera un gate, en ≤30s el loop detecta que el bot está inactivo y empieza a pollApprovalOnce() como fallback automático — sin intervención manual.

> S-029 · 2026-06-28

---

## ADR-0034 · 2026-06-28 · S-028: polling de Telegram embebido en el gate-wait del loop

**Estado:** aceptada
**Origen:** Instrucción de Augusto
**Target:** sistema

**Decisión:** Exportar `pollApprovalOnce(offset, deps?)` desde `telegram.ts` y llamarlo dentro del gate-wait de `runLoop` en lugar del `setTimeout(60_000)` original. El loop principal ahora procesa callbacks de aprobar/rechazar de Telegram directamente (sin depender de `npm run bot` corriendo en paralelo). El intervalo entre polls es 5s (timeout del getUpdates) + 3s de pausa = ~8s de latencia máxima desde que Augusto aprieta el botón hasta que el loop reanuda. `npm run approve` sigue funcionando como fallback (limpia STATE.json desde terminal).

**Contexto:** S-006 implementó la notificación de gates por Telegram (inline keyboard ✅/🚫) pero el procesamiento del callback vivía en `npm run bot` (proceso separado). Si el bot no estaba corriendo cuando Augusto apretaba "Aprobar", el callback quedaba bufferizado en la API de Telegram y el loop esperaba para siempre. Bug reportado: "Augusto aprobó desde Telegram pero el loop siguió en 'Esperando aprobación humana'".

**Alternativas descartadas:** Lanzar `npm run bot` automáticamente desde `index.ts` como child process (complica el manejo de señales, logs duplicados, ciclos de vida acoplados). Webhook en lugar de long-polling (requiere URL pública, cambia la arquitectura de red). Flag en Supabase como señal de aprobación (dependencia extra, el loop ya no podría operar offline).

**Consecuencias:** `npm run bot` queda reducido a: (1) procesar `/idea` desde el celu, (2) manejar approvals cuando el loop no está corriendo (p. ej. si el usuario quiere pre-aprobar antes de lanzar). Si ambos procesos corren a la vez, `approveGate` es idempotente (segunda llamada retorna "No hay ningún gate pendiente." sin tocar state). `TgDeps` en `pollApprovalOnce` acepta solo `send` + `chatId` (subset de la interfaz existente) para mantener los tests limpios.

> S-028 · 2026-06-28

---

## ADR-0032 · 2026-06-27 · S-015: umbrales de staleness para liveness del roster

**Estado:** aceptada
**Origen:** Supuesto del agente (auditoria pendiente por Augusto)
**Target:** sistema

**Decisión:** Dos umbrales para clasificar el heartbeat de `orch_presence`: (1) `STALE_SEC = 30` — sin señal de heartbeat por >30s → punto gris, label "sin señal", sin animación de pulso. (2) `CUELGUE_SEC = 120` — sin heartbeat por >2min con un run activo → punto coral, label "posible cuelgue", borde rojo (clase `stage.cuelgue`). Por debajo de 30s, el agente se muestra como activo normal.
**Contexto:** El proceso sync.ts emite heartbeat cada 5s. Si el proceso muere, el heartbeat para. Un threshold de 30s = 6 ticks fallidos → ruido tolerable (reinicio, GC, red lenta). 2min = umbral claro de "esto no es retraso, es cuelgue". Valores derivados del intervalo de tick (5s) y de la experiencia con el `Lock stale (660s)` visto en logs del autopilot.
**Alternativas descartadas:** Umbral único (30s para todo) — no distingue "retraso momentáneo" de "loop muerto hace 10 minutos". Usar `updated_at` de `orch_steps` — mide inactividad del loop pero no muerte del proceso monitor.
**Consecuencias:** Augusto puede ajustar `STALE_SEC`/`CUELGUE_SEC` en `dashboard/index.html` (constantes al inicio del script). Un loop colgado *dentro* del proceso (ej. lock stale en Claude Code) seguirá mostrando heartbeat fresco si sync.ts sobrevive — limitación conocida; requeriría heartbeat desde index.ts para detectar ese caso.

> S-015 · 2026-06-27

---
## ADR-0031 · 2026-06-27 · Dashboard vista Operaciones: roster honesto de etapas reales + feed de deltas

**Estado:** aceptada
**Origen:** Instrucción de Augusto
**Target:** sistema

**Decisión:** El roster del dashboard representa las etapas reales del pipeline (Planner/Builder como agentes LLM + Verifier/Deploy como código determinístico marcado "auto"). No se fabrican agentes inexistentes (Researcher no se muestra). El feed se construye de deltas (pasos done + features completadas), no del log crudo; el log pasa a panel colapsable. El hero responde "quién tiene la posta" derivado de `orch_runs`/`orch_steps` via `derivePosta()`.
**Contexto:** Evitar "teatro" — actividad decorativa que no refleja el sistema real. El manifiesto de producto exige no mentir actividad. Según `system/ARQUITECTURA-ACTUAL.md`, solo Planner (Opus) y Builder (Sonnet) son agentes LLM reales; Verifier y Deploy son código determinístico. Como el loop es secuencial, solo se enciende quien tiene la posta.
**Alternativas descartadas:** Roster de 5 agentes (Planner/Builder/Researcher/Verifier/Deploy) con estado simulado — fabrica actividad inexistente (Researcher no existe). Log crudo como feed principal — no comunica progreso, comunica ruido.
**Consecuencias:** Cuando existan agentes LLM reales nuevos (p.ej. Reviewer, Tester), se suman al roster sin tocar la arquitectura de la vista. El log crudo sigue disponible en panel secundario colapsable para debugging.

> S-022 · 2026-06-27

---
## ADR-0030 · 2026-06-27 · Loops nocturnos — sync.ts dispara npm start autónomamente en modo SLEEP

**Estado:** aceptada
**Origen:** Instrucción de Augusto
**Target:** sistema

**Decisión:** sync.ts llama a tryAutopilotPick() en cada tick. Si el modo es SLEEP y el loop está libre, toma el primer ítem P2+/pending/sin-keywords-de-riesgo del backlog, genera el spec vía Architect y spawnea `npm start` en background sin intervención humana.
**Contexto:** El operador puede estar OOO total (modo SLEEP activado desde el dashboard). El sistema debe poder avanzar el backlog solo, sin consumir LLM en la decisión de picking (heurístico puro) y con backstops duros: gates del loop, cap 5/día, denylist de riesgo.
**Alternativas descartadas:** Cron externo (más infra, requiere setup extra). Polling manual por Telegram (requiere disponibilidad del operador).
**Consecuencias / riesgo residual:** Cap de 5 features/día. Lock con timeout 10 min protege contra crashes del sync. Si un gate humano se activa en SLEEP, el loop pausa en silencio (S-002). El backlog queda en "armado (autopilot) <ISO>" para trazabilidad; si falla el release no se resetea solo.

> Generado por el loop · feature S-004 · step 0

---
## ADR-0027 · 2026-06-26 · El selector de ciudad va encima del botón "Generar contrato", no dentro del dropdown

**Estado:** aceptada
**Origen:** Supuesto del agente
**Target:** kredy

**Decisión:** El `Select` se renderiza como elemento propio antes del `DropdownMenu`, de modo que el usuario elige ciudad primero y luego selecciona qué documento descargar.
**Contexto:** El spec pedía "exponer un selector de ciudad" pero no especificó dónde ubicarlo dentro del componente. Las alternativas eran: (a) dentro de cada `DropdownMenuItem` como submenú, (b) como campo separado encima del botón principal.
**Alternativas descartadas:** Submenú en cascada dentro del dropdown (más compacto pero peor UX en mobile y más complejo); radio buttons inline (más verboso para dos opciones).
**Consecuencias / riesgo residual:** El flujo es: elegir ciudad → abrir dropdown → elegir documento. Si Augusto prefiere otra ubicación o quiere que la selección de ciudad esté dentro del propio dropdown, requiere ajuste de layout.

> Generado por el loop · feature F-0006 · step 8

---
## ADR-0026 · 2026-06-26 · Intimación mediante "notificación fehaciente" sin especificar el canal

**Estado:** aceptada
**Origen:** Supuesto del agente
**Target:** kredy

**Decisión:** Se usó "notificación fehaciente" como vehículo de la intimación, sin limitar el canal (postal, telegrama, WhatsApp con acuse, etc.), dejando esa elección al Mutuante.
**Contexto:** El spec indica "5 días corridos para regularizar antes de poder dar por caídos los plazos" pero no especifica cómo debe canalizarse la intimación; en derecho argentino el término "fehaciente" es el estándar que admite múltiples medios y no cierra futuros canales.
**Alternativas descartadas:** Mencionar explícitamente telegrama colacionado o carta documento (más restrictivo y puede quedar desactualizado); omitir la calidad de fehaciente (ambiguo y riesgoso en caso de litigio).
**Consecuencias / riesgo residual:** Validar con el abogado que "notificación fehaciente" sea compatible con los medios que el Mutuante usa habitualmente (p.ej. WhatsApp); si se requiere un canal específico, la cláusula deberá ajustarse.

> Generado por el loop · feature F-0006 · step 7

---
## ADR-0025 · 2026-06-26 · Extraer getMissingContractFields a lib/contract-gate.ts para testabilidad

**Estado:** aceptada
**Origen:** Supuesto del agente
**Target:** kredy

**Decisión:** La función de validación del gate se movió del componente React (con `'use client'`) a un módulo puro en `lib/`, cambiando su firma de `(loan: LoanDetail)` a `(person: PersonGateFields | null | undefined)`.
**Contexto:** El vitest.config.ts usa `environment: 'node'`; importar un componente con `'use client'` y `useState` en ese entorno falla. La función era una función pura sin dependencia de React, así que extraerla es el cambio mínimo que la hace testeable.
**Alternativas descartadas:** (a) Cambiar el entorno de vitest a jsdom — agrega overhead y no es necesario para lógica pura. (b) Testear la UI con React Testing Library — fuera de alcance del step. (c) Duplicar la lógica en el test — testa una reimplementación, no el código real.
**Consecuencias / riesgo residual:** El call site cambió de `getMissingContractFields(loan)` a `getMissingContractFields(loan.person)`. Si otros componentes en el futuro necesitan el gate, importan desde `lib/contract-gate` directamente.

> Generado por el loop · feature F-0006 · step 5

---
## ADR-0024 · 2026-06-26 · "Ambos documentos" también bloqueado cuando faltan datos del contrato

**Estado:** aceptada
**Origen:** Supuesto del agente
**Target:** kredy

**Decisión:** Se deshabilita tanto "Contrato de Mutuo" como "Ambos documentos" cuando hay campos faltantes en `loan.person`. "Pagaré" se mantiene habilitado.
**Contexto:** El spec dice "deshabilitar la opción de Contrato", pero "Ambos documentos" llama a `downloadBothDocuments` que incluye el contrato; permitirlo generaría un doc incompleto o fallaría silenciosamente.
**Alternativas descartadas:** Bloquear solo "Contrato de Mutuo" y dejar "Ambos documentos" activo (generar solo el pagaré en ese caso, renombrando la opción).
**Consecuencias / riesgo residual:** Si el comportamiento deseado es que "Ambos" genere solo el pagaré cuando el contrato está bloqueado, habría que refactorizar `downloadBothDocuments` para que sea condicional — queda abierto si Augusto prefiere ese flujo.

> Generado por el loop · feature F-0006 · step 4

---
## ADR-0023 · 2026-06-26 · Fecha de emisión del pagaré = loan.startDate

**Estado:** aceptada
**Origen:** Supuesto del agente
**Target:** kredy

**Decisión:** Se usa `loan.startDate` como fecha de emisión del pagaré, pre-completada en el documento generado, en lugar de dejarlo como placeholder.
**Contexto:** El spec indica "Dejar líneas en blanco SOLO para firma, aclaración y DNI de la mutuaria", lo que implica que la fecha de emisión debe estar pre-completada. `loan.startDate` es la fecha disponible más cercana a la fecha real de firma.
**Alternativas descartadas:** Dejar la fecha como placeholder rojo (inconsistente con la restricción de "solo tres blancos"); usar fecha actual en el momento de generación (no disponible de forma reproducible en el módulo).
**Consecuencias / riesgo residual:** Si el contrato se genera antes de la firma y `startDate` difiere del día real de firma, la fecha del pagaré quedará desactualizada. El gate humano (revisión mutuo|pagaré) debe verificar esto antes de imprimir.

> Generado por el loop · feature F-0006 · step 2

---
## ADR-0022 · 2026-06-26 · Agregar cláusula "sin protesto" al texto de SÉPTIMA

**Estado:** aceptada
**Origen:** Supuesto del agente
**Target:** kredy

**Decisión:** Se incorporó la mención `"sin protesto"` directamente en el cuerpo de la SÉPTIMA ("...un pagaré con cláusula 'sin protesto' por la suma de..."), no solo en la guía del pagaré.
**Contexto:** El spec lista "Pagaré siempre con cláusula 'sin protesto'" como restricción clave y el nombre del branch es `sin-protesto-por-el-to`, pero la tarea del step 1 dice explícitamente solo "reemplazar capital/capitalLetras por el total". No se especificó dónde añadir "sin protesto" en este step.
**Alternativas descartadas:** Dejarlo solo para el step de la guía del pagaré (`generatePagareGuide`), que es donde el prestamista rellena el instrumento físico. En ese caso SÉPTIMA no lo mencionaría.
**Consecuencias / riesgo residual:** Si "sin protesto" no se quiere en SÉPTIMA (por criterio legal: que sea solo una instrucción del pagaré físico y no una cláusula declarativa del mutuo), hay que revertir esa frase. La validación de abogado que ya exige el spec debería cubrir esto.

> Generado por el loop · feature F-0006 · step 1

---
## ADR-0021 · 2026-06-25 · Estrategia de mocking: userCache pre-poblado vs mock de prisma.user

**Estado:** aceptada
**Origen:** Supuesto del agente
**Target:** kredy

**Decisión:** Se pre-carga el usuario en `userCache` del contexto en lugar de mockear `prisma.user.findUnique`, para que el middleware `isAuthed` lo encuentre en caché y no haga ninguna llamada a Prisma para auth.
**Contexto:** El middleware `isAuthed` llama `ctx.prisma.user.findUnique` solo cuando el usuario no está en caché. La forma más simple de testear el router sin mockear todo el esquema de User es saltar esa rama pre-cargando la caché.
**Alternativas descartadas:** Mockear `prisma.user.findUnique` explícitamente en cada test; o exportar `createCallerFactory` desde `lib/trpc.ts` para crear un caller con contexto ya enriquecido (sin middleware). Ambas son más verbosas o requieren cambios en prod.
**Consecuencias / riesgo residual:** Si `isAuthed` cambia su lógica de caché (p. ej. añade más campos al User), los tests deberán actualizar `MOCK_USER`. Si la firma de `userCache` cambia, los tests rompen — es un acoplamiento bajo pero real.

> Generado por el loop · feature F-0007 · step 6

---
## ADR-0020 · 2026-06-25 · Botones inline en el banner vs. navegación a pestaña Documentos

**Estado:** aceptada
**Origen:** Supuesto del agente
**Target:** kredy

**Decisión:** Se creó `DocUploadButton` como componente standalone con su propia lógica de upload, renderizando los botones directamente en el banner de advertencia.
**Contexto:** El spec dice "conectar la subida… reusando el flujo de upload existente" pero no especifica si el CTA del banner debe disparar el upload inline o simplemente navegar a la pestaña Documentos donde `LoanAttachments` ya tiene los botones de subida para todos los tipos.
**Alternativas descartadas:** (1) Hacer el banner clickeable y switchear programáticamente a la pestaña Documentos — sin código nuevo pero UX con dos clics. (2) Extraer un hook `useLoanAttachmentUpload(loanId)` compartido entre `LoanAttachments` y el banner — sin duplicación, pero refactor más amplio. Se descartó por ser mayor al cambio mínimo requerido.
**Consecuencias / riesgo residual:** Hay duplicación parcial de la lógica fetch+mutación entre `LoanAttachments` y `DocUploadButton`. Si la lógica de upload cambia (ej. endpoint, validaciones), hay que actualizarla en los dos lugares.

> Generado por el loop · feature F-0007 · step 4

---
## ADR-0018 · 2026-06-25 · Banner de pendientes se muestra solo en préstamos activos

**Estado:** aceptada
**Origen:** Supuesto del agente
**Target:** kredy

**Decisión:** La condición `loan.status === 'active'` se agrega además de `documentStatus.status === 'pendiente'`, de modo que préstamos completados, refinanciados o incobrables no muestran la alerta aunque les falten documentos.
**Contexto:** El spec dice "vista de detalle del préstamo activo" pero no especifica si la restricción de estado debe estar hardcodeada en el componente o si el helper ya lo maneja. El helper es agnóstico al estado del préstamo; el filtro debe vivir en la UI.
**Alternativas descartadas:** Mostrar el banner para cualquier estado (si hay documentos faltantes, siempre alertar). Descartado porque un préstamo cerrado o incobrable no requiere que el usuario suba documentos.
**Consecuencias / riesgo residual:** Si en el futuro se quiere mostrar la alerta también en `defaulted` (para auditoría), hay que ampliar la condición en el componente.

> Generado por el loop · feature F-0007 · step 3

---
## ADR-0017 · 2026-06-25 · Carga de RiskConfig dentro del gate de vínculo vs. reutilización del check de deudor

**Estado:** aceptada
**Origen:** Supuesto del agente
**Target:** kredy

**Decisión:** El gate de vínculo carga su propio `riskConfig.findFirst` en lugar de recibir el objeto ya cargado, porque `checkDebtorLimit` no expone el `RiskConfig` como retorno y no existe una consulta previa al config de riesgo en `preApprove`.
**Contexto:** El spec pide aplicar `checkRelationshipLimit` con el `enforcementMode` de `RiskConfig`, pero en el flujo existente `preApprove` no carga `RiskConfig` en ningún punto anterior — sólo usa `AgentConfig`.
**Alternativas descartadas:** Extraer una función `loadRiskConfig` compartida con `checkDebtorLimit`; refactorizar `checkDebtorLimit` para devolver el config. Ambas implican tocar `lib/risk/debtorLimit.ts`, que está fuera del scope del step 4.
**Consecuencias / riesgo residual:** Se hace una query extra a `risk_configs` en el path de pre-aprobación. Si en un step futuro se centraliza la carga de `RiskConfig`, este bloque debería recibirlo como parámetro.

> Generado por el loop · feature F-0005 · step 4

---
## ADR-0016 · 2026-06-25 · La regla del referido no override blocked=true en hard mode

**Estado:** aceptada
**Origen:** Supuesto del agente
**Target:** kredy

**Decisión:** Cuando `amigo_de_amigo` sin referrer y capital supera el límite en modo `hard`, se devuelve `blocked: true, requiresManualReview: true` en lugar de forzar solo `requiresManualReview`. El flag `blocked` no se anula.
**Contexto:** El spec dice "forzar requiresManualReview = true" pero no especifica qué pasa cuando el check de capital ya retorna `blocked: true`. Podría haberse silenciado el `blocked` para dejar que el flujo manual lo resuelva.
**Alternativas descartadas:** Retornar `blocked: false, requiresManualReview: true` siempre que aplique la regla del referido, anulando el bloqueo por capital — esto daría más control manual pero abriría el paso a montos prohibidos si el revisor no nota el límite.
**Consecuencias / riesgo residual:** El orquestador que llama a `checkRelationshipLimit` debe manejar el caso `blocked: true && requiresManualReview: true`; si solo lee `blocked`, la regla del referido queda silenciada en ese path.

> Generado por el loop · feature F-0005 · step 3

---
## ADR-0015 · 2026-06-25 · checkRelationshipLimit es síncrona y acepta limits precargados

**Estado:** aceptada
**Origen:** Supuesto del agente
**Target:** kredy

**Decisión:** La función es pura y síncrona; el llamador carga los límites con `loadRelationshipLimits(db, userId)` y los pasa como `limits?`. Si se omite, usa `DEFAULT_RELATIONSHIP_LIMITS`.
**Contexto:** El spec define la firma como `{ relationship, referrer, capital, enforcementMode }` sin mencionar `db` ni `userId`. Para cumplir esa firma sin acceso a la DB dentro de la función, se separaron la carga (async, ya existía en step 1) y la evaluación (sync, step 2).
**Alternativas descartadas:** Recibir `db + userId` internamente y hacer la función async; eso la habría acoplado a Prisma y forzado a los callers a await una función que conceptualmente es solo una comparación.
**Consecuencias / riesgo residual:** El caller debe asegurarse de cargar los límites antes de llamar a `checkRelationshipLimit`; si omite `limits` opera sobre defaults, lo cual es seguro pero puede no reflejar overrides de RiskConfig.

> Generado por el loop · feature F-0005 · step 2

---
## ADR-0014 · 2026-06-25 · JSON de overrides como campo futuro en RiskConfig, no en tabla dedicada

**Estado:** aceptada
**Origen:** Supuesto del agente
**Target:** kredy

**Decisión:** `loadRelationshipLimits` lee `cfg.relationshipLimits` (Json?) desde `RiskConfig` vía optional chaining y try/catch; mientras la columna no exista siempre devuelve los defaults. No se crea una tabla dedicada tipo `ApScoreConfig`.
**Contexto:** El spec dice "del JSON de RiskConfig" pero `RiskConfig` no tiene ese campo aún, y "sin migración" prohíbe crearlo ahora. `loadScoreConfig` usa tabla dedicada; `debtorLimit.ts` usa optional chaining sobre `RiskConfig`. El spec apunta a `RiskConfig` → se siguió ese modelo.
**Alternativas descartadas:** Tabla dedicada tipo `ApScoreConfig` con `id: 'default'` (como `loadScoreConfig`), pero requeriría migración ahora.
**Consecuencias / riesgo residual:** La migración de F-0005 (step posterior) deberá agregar `relationshipLimits Json?` a `RiskConfig` para que los overrides persistan. Hasta ese momento el servicio siempre retorna los defaults.

> Generado por el loop · feature F-0005 · step 1

---
## ADR-XXXX · YYYY-MM-DD · <título corto>

**Estado:** propuesta | aceptada | reemplazada-por-ADR-YYYY | descartada
**Origen:** Instrucción de Augusto | Supuesto del agente | Derivada (consecuencia técnica de otro ADR)
**Target:** sistema | kredy | spensiv | argos

**Decisión:** qué se decidió, en una o dos frases.
**Contexto:** por qué surgió, qué problema resuelve.
**Alternativas descartadas:** qué otras opciones había y por qué no.
**Consecuencias / riesgo residual:** qué queda abierto o qué se vuelve frágil.
```

**Campo Origen — cómo clasificar:**
- `Instrucción de Augusto` → Augusto lo pidió o aprobó explícitamente. La máquina ejecutó una orden.
- `Supuesto del agente` → el agente eligió sin instrucción explícita (default razonable, criterio técnico). Revisable.
- `Derivada` → consecuencia técnica forzada por otro ADR; no es una elección libre.

> Convención de estados de features (backlog/active/review/done/blocked) → ver `system/CONVENTIONS.md`.

---

## ADR-0029 · 2026-06-26 · Marcador `<!-- procesado -->` en FEATURE-INTAKE.md para no reprocesar ideas

**Estado:** aceptada
**Origen:** Supuesto del agente
**Target:** sistema

**Decisión:** `intake-cli.ts`, al procesar una idea leída del archivo (sin arg de CLI), le agrega el sufijo `<!-- procesado -->` a esa línea de `system/FEATURE-INTAKE.md` para que no se vuelva a tomar como "última idea sin procesar" en una corrida futura.

**Contexto:** El spec de S-008 no especificaba cómo evitar reprocesar ideas ya convertidas en spec; se dejó como decisión abierta a tomar con criterio. El archivo es append-only y lo escriben dos canales (Telegram `/idea`, dashboard web) — sin un marcador, cada corrida de `npm run intake` (sin arg) reprocesaría la idea más reciente sin distinguir si ya generó un `F-XXXX.md`.

**Alternativas descartadas:** Mover las ideas procesadas a un archivo separado (`FEATURE-INTAKE.processed.md`) — más limpio pero rompe el log cronológico único que también usa el dashboard (S-007) para mostrar el historial de ideas. Un índice separado (ej. `intake-state.json` con offsets) — agrega un segundo archivo de estado a sincronizar.

**Consecuencias / riesgo residual:** El formato de línea de `FEATURE-INTAKE.md` ahora es un contrato implícito para cualquier consumidor futuro (S-007 Fase C, u otro parser) — si algo más lee ese archivo esperando líneas "limpias", debe tolerar el sufijo `<!-- procesado -->`. Si se reformatea el archivo a mano, hay que preservar el marcador en las líneas ya procesadas.

---

## ADR-0028 · 2026-06-26 · `classify` prioriza "arquitectura" sobre "bug" cuando ambos matchean

**Estado:** aceptada
**Origen:** Supuesto del agente
**Target:** sistema

**Decisión:** En `intake.ts`, `classify()` chequea `ARCH_KEYWORDS` antes que `BUG_KEYWORDS` — si una idea matchea ambos conjuntos, se clasifica como `arquitectura`, no como `bug`.

**Contexto:** El spec de S-008 no definía un orden de prioridad entre clasificaciones cuando una idea es ambigua (ej. "el loop falla al reintentar un step bloqueado" matchea tanto "falla" (bug) como "loop"/contexto de orquestador (arquitectura)).

**Alternativas descartadas:** Priorizar `bug` sobre `arquitectura` (trataría bugs del propio orchestrator como features de producto comunes, perdiendo la señal de que ese código corre el auto-deploy a prod y merece más cuidado). Clasificación múltiple/no exclusiva (más expresivo pero el resto del pipeline — `needsArchitect`, el prompt al Architect — asume una sola clasificación).

**Consecuencias / riesgo residual:** Un bug trivial del propio orchestrator (ej. typo en un log) podría clasificarse como `arquitectura` y disparar el Architect (Opus) innecesariamente si además matchea alguna keyword de `ARCH_KEYWORDS`. El costo de ese falso positivo es bajo (un spec de más para revisar) comparado con tratar un cambio arquitectónico real como bug menor.

---

## ADR-0019 · 2026-06-25 · Auto-deploy en verde + sin gates por-step (reemplaza la aprobación humana manual)

**Estado:** aceptada
**Origen:** Instrucción de Augusto
**Target:** sistema

**Decisión:** Se eliminan los gates de aprobación humana por-step (auto-pass) y el gate de deploy a prod pasa a **auto-deploy cuando las verificaciones dan verde** (typecheck + lint + tests + build + TNA check). Si fallan, NO deploya y avisa el error por Telegram. La seguridad deja de ser la aprobación humana previa (que Augusto siempre concedía sin revisar) y pasa a: (a) la verificación automática, (b) el aviso post-deploy por Telegram, (c) la posibilidad de revertir.

**Contexto:** Augusto siempre aprobaba sin revisar a nivel técnico → el tap humano no agregaba seguridad, solo fricción. El db-guard (anti-prod), el hook de comandos (bloquea prisma/deploy/drop reales en ejecución) y el verifier siguen activos.

**Alternativas descartadas:** Auto-deploy sin aviso (máxima velocidad, mínima visibilidad — descartado por ser app con plata real); mantener un tap en Telegram por feature (descartado por fricción innecesaria dado el comportamiento real).

**Consecuencias / riesgo residual:** Un bug que pase las verificaciones llega a prod sin checkpoint humano; mitigación = aviso + revert. **Actualizar el `CLAUDE.md` global**, que hoy exige aprobación explícita para deploys a prod — esta decisión lo cambia deliberadamente. Pendiente: flujo de revert one-tap desde Telegram.

---

## ADR-0013 · 2026-06-25 · Documentos del préstamo (mutuo firmado + pagaré) NO bloqueantes

**Estado:** aceptada
**Origen:** Instrucción de Augusto
**Target:** kredy

**Decisión:** Las fotos del mutuo firmado y del pagaré se registran en Kredy vía `LoanAttachment` (types `mutual`/`pagare`) y se muestran como **pendientes** mientras falten, pero NO bloquean pre-aprobar, aprobar ni activar el préstamo. Reusa el flujo de upload existente de `transfer_receipt`.

**Contexto:** Augusto quiere registro de los documentos físicos firmados sin frenar el ciclo del préstamo. "Tienen que estar, pero no obligatorio para activar; ahí debería aparecer pendiente."

**Consecuencias:** El cumplimiento documental queda como métrica informativa (futuro- recordatorios, o eventualmente subir a score del préstamo). Spec- F-0007 / SP-011.

---

## ADR-0012 · 2026-06-25 · Pagaré generado pre-llenado (uno por el total, sin protesto)

**Estado:** aceptada (revisa una decisión previa del mismo día de "solo guía", cambiada al confirmar la validez legal)
**Origen:** Instrucción de Augusto
**Target:** kredy

**Decisión:** El pagaré se GENERA pre-llenado- un solo pagaré por el TOTAL del préstamo (no por cuota), en A4, con cláusula **"sin protesto"**, monto total a devolver (= `Loan.totalAmount`) en números y letras, vencimiento, lugar de pago y beneficiario (el acreedor). El deudor completa a mano firma, aclaración y DNI (firma ológrafa); se acompaña con una guía de lo manuscrito. NO muestra capital ni TNA. El mutuo también se genera (template único versionado, descarga read-only).

**Contexto:** La decisión inicial fue "solo guía" por duda sobre la validez de un pagaré no-talonario. Al verificar el **Dto-Ley 5965/63** se confirmó que un pagaré impreso en A4 es válido si tiene los requisitos esenciales y firma ológrafa — el talonario no es requisito. Eso habilita generarlo pre-llenado, ganando estandarización y menos error del AP. El "sin protesto" replica el del talonario de librería (dispensa el protesto notarial).

**Alternativas descartadas:** Solo guía sin generar (más trabajo y error para el AP); múltiples pagarés por cuota (Augusto eligió uno por el total); autocompletar la firma (inválido- debe ser manuscrita).

**Consecuencias:** El mutuo YA existe (`lib/contract-generator.ts`, .docx, 10 cláusulas). Hallazgo- hoy el pagaré y la cláusula SÉPTIMA usan el CAPITAL, no el total → F-0006 los corrige a total a devolver. Riesgo legal a validar con abogado- la SÉPTIMA permite accionar por pagaré O contrato (no ambos), así que el pagaré debe ser por el total para no perder los intereses por la vía ejecutiva. El impuesto de sellos es fiscal por jurisdicción, fuera de la feature. Spec- F-0006 / SP-010.

---

## ADR-0011 · 2026-06-25 · Política de originación por vínculo (conocido / referido / desconocido)

**Estado:** aceptada
**Origen:** Instrucción de Augusto
**Target:** kredy

**Decisión:** La pre-aprobación aplica un límite de originación según el vínculo del prestatario con el AP, vía un gate `checkRelationshipLimit` análogo al de exposición por deudor- **conocido/amigo → 500.000**, **referido (`amigo_de_amigo`) → 200.000 y exige referente/aval registrado** (`Person.referrer`), **desconocido → 0 (bloqueado)**. Respeta `enforcementMode` (hard rechaza / soft flaggea). Sin migración- reusa `Person.relationship`/`referrer`.

**Contexto:** Una conocida del AP preguntó por un tercero desconocido para el AP y para Augusto (caso "referido"). Se necesitaba política antes de seguir originando. El referido tiene cadena de responsabilidad (quien lo refiere), distinto de un desconocido total.

**Alternativas descartadas:** Bloquear al referido igual que a un desconocido (pierde negocio con riesgo acotado); permitirlo sin registrar aval (sin cobertura de responsabilidad).

**Consecuencias:** Límites como defaults configurables (patrón `minApScore` de F-0002), ajustables sin migración. Caso de hoy- tratar como referido, hasta 200k, con la conocida como referente. Spec- F-0005 / SP-009. Follow-up- UI de tier/referente (SP-012).

---

## ADR-0010 · 2026-06-20 · Argos en el loop sin dev DB (targets no-Prisma)

**Estado:** aceptada
**Origen:** Supuesto del agente (criterio técnico; Augusto no pidió incluir Argos con un modelo de DB específico)
**Target:** argos

**Decisión:** Argos (`portfolio-tracker`, React/Vite/Supabase-client) entra al loop con `dbModel: "none"` en targets.json. El guard exime a targets no-Prisma de exigir `devDatabaseUrl` y no inyecta `DATABASE_URL`. Razón: su verificación (tsc + lint + test + `vite build`) no toca la DB; Supabase se accede por `VITE_SUPABASE_URL` en runtime, no por Prisma. Se descartó crear un Supabase branch dev (~USD 10/mes) hasta que haga falta QA visual con datos (AR-004).

**Cambios de engine:** `Target.dbModel` ('prisma'|'none', default 'prisma'); `assertNoProdDb` retorna void y cortocircuita en dbModel=none; `getDbEnvOverride` retorna `{}` si no hay override; `qa.ts` solo setea DATABASE_URL/DIRECT_URL si existen; `verifier` (por-step y release) tolera la falta de script `lint` ("missing script" → omitir).

**Riesgo residual:** el executor podría, en teoría, tocar la Supabase prod de Argos (no hay aislamiento de DB). Mitigación: features de Argos deben ser UI/lógica; gates de no-SQL-destructivo siguen activos; no se le pasa service key al loop. Pendiente AR-003: afinar el prompt del executor por dbModel.

---

## ADR-0009 · 2026-06-20 · Fase de release autónoma (merge + verificación + gate de OK + push/deploy)

**Estado:** aceptada
**Origen:** Instrucción de Augusto (pidió delegar push+deploy con OK solo tras verificar todo lo posible)
**Target:** sistema

**Decisión:** el orquestador lleva un feature hasta prod, no solo hasta una branch. Al terminar los steps:
1. **Merge automático** de la feature branch → `main` (local, `--no-ff`, sin push). Si hay conflicto, aborta y deja la branch intacta.
2. **Battery de verificación completa** (`runReleaseChecks`): typecheck + lint + tests + `npm run build` (build de prod) + escaneo informativo de fuga de TNA/tasa en vistas de prestatario. Hard-fail en typecheck/lint/tests/build; el TNA-check es informativo y se muestra en el pedido de OK.
3. Si pasa todo → **gate humano**: el loop pausa y pide `npm run approve`. Si falla algo, NO molesta a Augusto: muestra el error y frena.
4. Con el OK → **push a `main`**. Como Vercel está conectado por Git, el push dispara el deploy a prod (no se usa `vercel` CLI).

**Implementación:** flags nuevos en `STATE.json` (`merged`, `awaitingPushApproval`, `pushed`); `mergeIntoMain`/`pushMain` en git.ts; `runReleaseChecks` en verifier.ts; máquina de estados en el bloque de cierre de index.ts. `STATE.json` se archiva recién tras el push. El gate reusa el mecanismo existente (`npm run approve` en otra terminal mientras el `npm start` sigue corriendo y polleando).

**Límite explícito:** push/deploy son las ÚNICAS acciones de prod; siempre detrás del OK humano. El merge local no toca prod, por eso es automático. Honra el gate de prod del `CLAUDE.md`.

---

## ADR-0008 · 2026-06-20 · Rename: identidad Kredy vs Spensiv + config del orquestador

**Estado:** aceptada
**Origen:** Instrucción de Augusto (naming canónico y decisión de Vercel)
**Target:** sistema / kredy / spensiv

**Decisión (naming canónico):**
- **Kredy** = app de préstamos/crédito + capa AP. Repo originalmente "spensiv" (carpeta `spensiv/`, luego renombrada a `kredy/`). Target del orquestador = **`kredy`**.
- **Spensiv** = app de finanzas personales (cashflow/tarjetas/gastos). Repo `spensiv-tracker` (carpeta `spensiv/` post-rename). Target del orquestador = **`spensiv`**.
- El branding "Spensiv - tu motor de cashflow" le corresponde al TRACKER, no a Kredy.

**Vercel (checklist C):** Augusto renombró el project a **`kredy-ap`** y **reenvía** los links `/l`. El subdominio `kredy.vercel.app` ya estaba tomado por otro team (los `.vercel.app` son globales), así que la URL de prod quedó en **`https://kredy-ap.vercel.app`** (Valid Configuration). El nombre comercial sigue siendo "Kredy"; `-ap` es solo limitación técnica. `metadataBase` de Kredy = `https://kredy-ap.vercel.app` (F-0003). No se compra dominio propio.

**Cambios aplicados en augusto-os (config, no destructivo):** `targets/targets.json` (key `spensiv`→`kredy`; nuevo target `spensiv`→tracker); `orchestrator/.env` (`KREDY_DEV_DATABASE_URL` + placeholder tracker, backup en `.env.bak-rename`); `config/prod-db-hosts.json` (patrón `ep-floral-mud`); `executor.ts`/`planner.ts` target-aware; frontmatter F-0001/F-0002 → `target: kredy`.

**Consecuencias:** el `CLAUDE.md` global describe Spensiv como "finanzas personales + préstamos reales", conflando ambos productos. Conviene separarlo — no se editó automáticamente por ser config personal de Augusto.

---

## ADR-0007 · 2026-06-19 · Dev DB de Kredy/Spensiv = Neon

**Estado:** aceptada
**Origen:** Supuesto del agente (elección de Neon sobre alternativas; Augusto aprobó usar una DB no-prod, no eligió el proveedor)
**Target:** sistema / kredy

**Decisión:** La DB de desarrollo para el loop es una base **Neon**. El secreto vive en `orchestrator/.env`, gitignored. El campo `devDatabaseUrl` de `targets.json` referencia `${...}` — nunca el valor crudo. El orquestador arranca con `tsx --env-file=.env` para expandir la referencia antes del guard.

**Esquema:** Materializado con `prisma db push` desde `prisma/schema.prisma` contra la URL directa de Neon (no la pooled).

**Alternativas descartadas:** Supabase branch ($0.01344/h ≈ USD 10/mes) y Docker local (requiere instalación). Neon tiene tier gratuito suficiente para desarrollo headless.

**Guard:** `prodDbPatterns` contiene `jymdblurkpadupdqzfzo` (matchea la prod Supabase de Kredy). La URL de Neon dev no matchea ningún patrón de prod. El `.env` de la app queda intacto apuntando a prod; el loop overridea solo en memoria (execa).

---

## ADR-0006 · 2026-06-19 · Aislamiento de prod: DB no-prod + guard anti-prod

**Estado:** aceptada
**Origen:** Instrucción de Augusto (exigió que el loop nunca toque prod); el mecanismo (guard + override en memoria) es Supuesto del agente
**Target:** sistema

**Decisión:** El loop inyecta `DATABASE_URL`/`DIRECT_URL` apuntando a una DB no-prod en el env de TODOS los procesos hijo (executor, planner, verifier, QA). El `.env` de la app sigue apuntando a prod para uso manual — el loop overridea solo en memoria (opción `env:` de execa, sin tocar archivos).

**Guard de seguridad (db-guard.ts):** Antes de ejecutar cualquier trabajo, el loop verifica: (1) `devDatabaseUrl` está configurada (no es `<COMPLETAR>`) → si no, aborta; (2) `devDatabaseUrl` NO matchea ningún patrón de prod (`prodDbPatterns` + global en `config/prod-db-hosts.json`) → si matchea, aborta. El guard actúa ANTES de invocar planner/executor/verifier/QA. Defensa en profundidad: aunque el override falle, el loop se niega a correr.

**Contexto:** El `DATABASE_URL` local apunta a prod real. `npm test` (vitest) hereda el env del proceso hijo; sin override, cualquier test que abra Prisma tocaría prod. La capa `permissions.deny` no bloquea esto (solo bloquea `prisma migrate`).

**Alternativa descartada:** Editar el `.env` de la app — Augusto lo usa para desarrollo manual y rompe su flujo.

---

## ADR-0005 · 2026-06-18 · `--strict-mcp-config` como capa de bloqueo MCP

**Estado:** aceptada
**Origen:** Supuesto del agente (criterio técnico de seguridad headless)
**Target:** sistema

**Decisión:** El executor headless usa `--strict-mcp-config` en vez de `--allowedTools` solo para bloquear MCP.

**Contexto:** `--allowedTools` es aditivo — agrega tools pero NO bloquea las MCP del `settings.local.json`. Con `enableAllProjectMcpServers: true`, el executor veía 40+ tools MCP (Supabase, Vercel, etc.) y podía invocarlas. `--strict-mcp-config` overrides todos los configs MCP y carga cero servers.

**Alternativa descartada:** `--permission-prompt-tool auto-deny` — en la versión actual del CLI se trata como nombre de MCP tool y falla con "MCP tool auto-deny not found".

---

## ADR-0004 · 2026-06-18 · Hook `pre-tool-use.sh` como guardrail load-bearing

**Estado:** aceptada
**Origen:** Supuesto del agente (decisión de seguridad derivada de testear el bypass)
**Target:** sistema

**Decisión:** La protección de producción vive en el hook de shell, NO en `permissions.deny`.

**Contexto:** `--dangerously-skip-permissions` bypasea `permissions.deny` por diseño (es su propósito para headless). El hook de shell (exit code 2) es independiente de las permissions y NO se bypasea con esa flag. Verificado 2026-06-18: `blocked.log` capturó los tres comandos simulados con `--dangerously-skip-permissions`.

**Consecuencia:** Si se cambia cómo se invoca `claude`, hay que re-testear ambas capas. La capa deny es documentación; el hook es enforcement real.

---

## ADR-0003 · 2026-06-18 · QA graceful failure con `NO_SERVER:` prefix

**Estado:** aceptada
**Origen:** Supuesto del agente
**Target:** sistema

**Decisión:** Si Playwright no puede conectar al servidor, QA emite error con prefijo `NO_SERVER:` y el orchestrator continúa (no bloquea).

**Contexto:** F-0001 se corría sin dev server levantado. `page.goto` lanzaba `net::ERR_CONNECTION_REFUSED` que propagaba como fatal al main loop. El objetivo es que typecheck + lint + tests sean suficientes para commits headless; QA visual es adicional cuando el server está disponible.

**Cuándo bloquea:** Si hay errores QA que NO son `NO_SERVER:` (ej: JS error en página, invariante rota), sí bloquea y requiere gate humano.

---

## ADR-0002 · 2026-06-18 · augusto-os como repo separado de los targets

**Estado:** aceptada
**Origen:** Instrucción de Augusto (alineado con su visión del "SO de Augusto"); ejecución por el agente
**Target:** sistema

**Decisión:** El orquestador y la memoria del sistema viven en `augusto-os/`, separado de los targets.

**Contexto:** Si el orquestador viviera dentro de un target, tendría acceso implícito al DB, deps y convenciones de ese repo. La separación permite operar sobre cualquier target sin asumir su stack. El `REPO_ROOT` se resuelve dinámicamente desde `targets/targets.json`.

**Alternativa descartada:** Mantener orchestrator en `spensiv/orchestrator/` — ya fue Fase 0, no escala a multi-target.

---

## ADR-0001 · 2026-06-18 · Comisión AP se devenga al cobro, no al originar

**Estado:** aceptada
**Origen:** Instrucción de Augusto (regla de negocio del dominio Kredy)
**Target:** kredy

**Decisión:** La comisión del AP se registra cuando el deudor paga la cuota, no cuando se origina el préstamo. Si el cliente no paga, no hay comisión.

**Contexto:** Evita el caso donde el AP cobró comisión por un préstamo que eventualmente resultó en default. El AP tiene skin in the game en la cobrabilidad.

**Consecuencia:** `realizeCommissionsForPayment` es el punto de entrada correcto, no `createOpportunity`.
