**Loops nocturnos** — en modo SLEEP, el sistema toma sola la siguiente item elegible del backlog, le genera el spec vía Architect, y la corre con `npm start` sin que Augusto dispare nada. Objetivo: no dejar tokens/sesión sin usar mientras Augusto está OOO total.

## Contexto (leé antes de tocar nada)

- `orchestrator/src/operator-state.ts` (S-002) — `getOperatorState()` lee `system/OPERATOR_STATE.yaml`. Mode SLEEP ya es controlable remoto desde el dashboard (S-007b) vía `orchestrator/src/sync.ts` → `pullOperatorState()`.
- `orchestrator/src/sync.ts` — proceso de larga duración (`npm run sync`, tick cada 5s). Ya tiene el patrón de "leer Supabase/YAML y actuar" (`pullWebIdeas`, `pullOperatorState`). Este feature agrega un tercer actor al mismo tick: si está en SLEEP y el loop está libre, arrancar un feature solo.
- `orchestrator/src/state.ts` — `STATE_PATH` (`orchestrator/STATE.json`). Si existe y no está archivado, hay un feature corriendo. `loadState()`/`existsSync(STATE_PATH)` es cómo sabés si el loop está libre.
- `orchestrator/src/intake.ts` — `runIntake(ideaText)` clasifica target/classification, busca ADRs/features/backlog relacionados. `detectTarget()` es por keywords y NO es confiable para items de backlog (descripciones cortas) — para este feature el target ya lo sabés por la sección del BACKLOG.md (Sistema/Kredy/Spensiv/Argos), así que sobreescribís `intake.target` a mano con el mapeo `Sistema→sistema, Kredy→kredy, Spensiv→spensiv, Argos→argos` antes de pasarlo al Architect. NO confíes en `detectTarget` para esto.
- `orchestrator/src/architect.ts` — `runArchitect(intakeResult, opts?)` escribe `features/F-XXXX.md` vía Opus. Llamalo directo (no pases por el gate de `needsArchitect` de `intake-cli.ts` — para items de backlog siempre querés el spec).
- `orchestrator/src/index.ts` — `npm start <featureId>` arranca el loop (Planner→Builder→Verifier→Reviewer→QA→commit→auto-deploy). `startFeature()` llama al Planner (Opus) ANTES de crear `STATE.json` — hay una ventana de 30-90s donde el loop "está ocupado" pero `STATE.json` todavía no existe. Tenelo en cuenta para el lock (ver restricciones).
- `system/BACKLOG.md` — tablas markdown por sección (`## Sistema`, `## Kredy`, etc.), columnas `| ID | P | Descripción | Estado |`. `P` es número (prioridad) o `✅` (done). `Estado` hoy es texto libre: `pending`, `waiting`, `blocked`, `done <fecha> (...)`.
- `orchestrator/src/adr.ts` — `appendAdr()` ya usado por S-009 para loguear decisiones de diseño en `system/DECISIONS.md`. Vas a usarlo una vez (al arrancar el primer feature autopilot) para documentar que `sync.ts` ahora puede disparar `npm start` de forma autónoma — es un cambio de arquitectura real, no cosmético.

## Qué construir

### 1. `orchestrator/src/autopilot.ts` (nuevo)

- `parseEligibleBacklog(backlogPath?: string): BacklogRow[]` — parsea `BACKLOG.md` (mismo estilo que `parseBacklog()` de `sync.ts`, pero quedate con `{ id, project, target, priority, label, fullLine, state }`). Filtra:
  - `priority` es número (no `✅`) y `>= 2`.
  - `state` (trim + lowercase) es **exactamente** `pending` — NO toques `waiting`, `blocked`, `done...`, `armado...`, ni nada que no sea literalmente `pending`. Esto es deliberadamente estricto: si algún día agregás un estado nuevo, por defecto NO es elegible.
  - La línea completa (`fullLine`, incluye ID + descripción) no matchea ningún keyword de este denylist (case-insensitive, lista exportada `RISK_KEYWORDS` para poder testearla y extenderla después):
    `['dinero', 'producción', 'produccion', 'legal', 'mutuo', 'pagaré', 'pagare', 'migración', 'migracion', 'migrate', 'deploy a prod', 'dinero real', 'cuenta real', 'transferencia']`
  - Orden: por prioridad numérica ascendente; empate → orden de aparición en el archivo.
  - Devuelve la lista completa ordenada (no solo el primero — facilita testear).

- `markBacklogState(id: string, newState: string, backlogPath?: string): void` — reemplaza la columna `Estado` de la fila con ese `id` en `BACKLOG.md` (regex sobre la línea `| <id> | ... | ... | <viejo estado> |` → reemplaza solo el último campo). Si el ID no existe, no-op + log.

- `MAP_PATH` = `orchestrator/AUTOPILOT_MAP.json` — `{ [featureId: string]: { backlogId: string, pickedAt: string } }`. Helpers `readMap()`/`writeMap()`/`recordPick(featureId, backlogId)`/`resolveBacklogId(featureId): string | undefined`/`clearPick(featureId)`.

- `COUNTER_PATH` = `orchestrator/AUTOPILOT_COUNTER.json` — `{ date: 'YYYY-MM-DD', count: number }`. `canTriggerToday(maxPerDay = 5): boolean` — resetea el contador si la fecha cambió, compara contra `maxPerDay`. `incrementCounter(): void`.

- `LOCK_PATH` = `orchestrator/AUTOPILOT.lock` — contiene `{ createdAt: ISOString }`. `acquireLock(staleMs = 10 * 60 * 1000): boolean` — si no existe lock, lo crea y devuelve `true`. Si existe pero es más viejo que `staleMs`, lo pisa (asume proceso muerto) y devuelve `true`. Si existe y es reciente, devuelve `false`. `releaseLock(): void` — borra el archivo si existe.

- `async function tryAutopilotPick(opts?: { runIntake?, runArchitect?, spawnLoop? }): Promise<{ featureId: string, backlogId: string } | null>` — orquesta todo:
  1. `getOperatorState().mode !== 'SLEEP'` → return null (no-op silencioso).
  2. `existsSync(STATE_PATH)` (loop ocupado) → return null.
  3. `!canTriggerToday()` → log una vez por tick (`[autopilot] tope diario alcanzado, esperando a mañana`) → return null.
  4. `!acquireLock()` → return null (ya hay un pick en curso, evita doble-spawn en la ventana Planner).
  5. `parseEligibleBacklog()` — si vacío, `releaseLock()`, log (rate-limitado, no en cada tick — guardá el último timestamp de este log en una variable de módulo y solo repetilo cada ~10 min) y return null.
  6. Tomá el primero (`picks[0]`). `markBacklogState(pick.id, 'armado (autopilot) ' + fechaISO)`.
  7. Armá `ideaText` = `pick.label` (o la descripción completa de la fila si es más rica). `const intake = runIntake(ideaText); intake.target = pick.target` (override, ver contexto). Forzá `runArchitect(intake)` → `featureId`.
  8. `recordPick(featureId, pick.id)`.
  9. Si es el primer pick autopilot de la sesión (podés chequear si `DECISIONS.md` ya tiene un ADR con "loops nocturnos" — si no, agregalo una sola vez con `appendAdr()`), documentando: "sync.ts puede disparar `npm start` autónomamente en modo SLEEP, alcance P2+/pending/sin keywords de riesgo, cap de 5/día, lock con timeout 10min".
  10. Spawneá el loop SIN esperar a que termine: `execa('npm', ['start', featureId], { cwd: ORCH_DIR, detached: true, stdio: 'ignore' }).catch(e => log(...))` — fire-and-forget, no `await` del resultado completo (el loop puede tardar horas).
  11. `incrementCounter()`. `releaseLock()`. Log: `[autopilot] SLEEP — arrancó ${featureId} desde ${pick.id} sin intervención.`
  12. Devolvé `{ featureId, backlogId: pick.id }`.
  - Envolvé TODO en try/catch — si algo falla, `releaseLock()` en el `finally` y logueá, pero NUNCA tires una excepción que mate el `tick()` de sync.ts.
  - Los pasos de I/O externo (`runIntake`/`runArchitect`/spawn) deben ser inyectables vía `opts` para poder testear `tryAutopilotPick` sin llamar a Opus ni spawnear procesos de verdad.

### 2. Wiring en `orchestrator/src/sync.ts`

- Importá `tryAutopilotPick` y llamalo desde `tick()`, después de `pullOperatorState()`. Envuelto en su propio try/catch (no debe poder romper el resto del tick).

### 3. Marcar `done` al terminar — `orchestrator/src/index.ts`

- Donde hoy se llama `notifyDeployed(featureId, ...)` (loop ya hizo push a main, deploy automático en curso): si `resolveBacklogId(state.featureId)` devuelve un backlogId, llamá `markBacklogState(backlogId, 'done ' + fechaISO + ' (autopilot)')` y `clearPick(state.featureId)`. Si el release falla (rama de `notifyReleaseFailed`), NO toques el estado del backlog (queda en `armado (autopilot) ...` — Augusto lo revisa a mano cuando vuelva, no reintentes solo).

## Restricciones

- NO toques `gates.ts` ni el comportamiento de los gates duros existentes — son el backstop real de seguridad. Si autopilot arranca algo que termina pegando un gate humano, el loop pausa igual (S-002: en SLEEP espera en silencio, sin avisar por Telegram) y NO se vuelve a marcar como pending ni se reintenta solo.
- El picker es heurístico y determinístico (regex/denylist) — CERO llamadas a LLM para decidir qué elegir. Esto tiene que poder testearse con datos fijos.
- `Estado` en `BACKLOG.md` solo se considera elegible si es **exactamente** `pending` — cualquier otra cosa (incluso vacío o un typo) lo excluye por default.
- Cap diario default 5 (constante exportada, fácil de cambiar después) — esto es para no fundir tokens en una sola noche si algo anda mal.
- El lock tiene que tener timeout — si el proceso de sync se cae con el lock tomado, la próxima vuelta no debe quedar bloqueada para siempre.
- Sin dependencias nuevas (ya tenés `execa` en el orchestrator).
- Documentá la decisión de arquitectura (sync.ts dispara `npm start`) con un ADR vía `appendAdr()` — una sola vez, no en cada pick.

## Tests

- `autopilot.test.ts`: `parseEligibleBacklog` con un `BACKLOG.md` de fixture — casos: excluye P1, excluye `✅`/done, excluye `waiting`/`blocked`, excluye filas con keywords de riesgo, incluye P2+/pending limpio, ordena por prioridad.
- `markBacklogState` — idempotente, no rompe otras filas.
- `tryAutopilotPick` con `runIntake`/`runArchitect`/`spawnLoop` inyectados (mocks) — casos: no-op si mode≠SLEEP, no-op si `STATE.json` existe, no-op si cap alcanzado, no-op si lock tomado, pick exitoso marca `armado`, registra en el map, incrementa contador, libera lock.
- Lock con timestamp viejo se considera stale y se pisa.

## Entrega

- Branch `feature/s004-loops-nocturnos`, sin push ni merge.
- Typecheck + tests del orchestrator en verde.
- Mostrame el diff completo de los 3 archivos (`autopilot.ts` nuevo, `sync.ts`, `index.ts`) y el texto del ADR que agregaste a `DECISIONS.md`.
