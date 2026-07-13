# S-039 — Escalación automática de steps trabados (Opus-fixer) en vez de gate manual

> Prompt para Claude Code. Ejecutor: Sonnet. Repo: `augusto-os`. Autorizado a commitear y pushear a `main`.
> Diagnóstico y diseño ya hechos (Cowork, 2026-07-13) — no rediscutas el enfoque, implementalo.

## Contexto

Hoy, cuando un step se traba (falla 3 veces: builder, verifier, QA o reviewer), `index.ts` llama a `haltBlocked()`
(agregado en S-038/0c53d49): loguea, avisa por Telegram y **corta el proceso entero**, obligando a Augusto a
entrar a mano, diagnosticar, arreglar el código él mismo y correr `npm start <featureId>` de nuevo.

Antes de eso (hasta el commit 0c53d49) existía `setHumanGate`: pausaba el proceso esperando un click de "✅
aprobar" en Telegram. Confirmado leyendo `index.ts` (línea ~206-210 antes del cambio): ese click **no arreglaba
nada** — el único efecto era `markStepStatus(blockedStep.id, 'pending')`, es decir, reintentar a ciegas el mismo
step con el mismo modelo (`MODEL_BUILDER`, Sonnet) que ya había fallado 3 veces, sesión resumida, sin ningún dato
nuevo. Augusto terminó aprobando todo sin revisar nada porque no había nada real que revisar — el gate no aportaba
señal, solo latencia.

**Objetivo de S-039:** que ninguno de los dos extremos sea necesario. Cuando un step se traba, en vez de parar y
esperar a Augusto (por click o por intervención manual), el loop debe **escalar solo** a un modelo más capaz con
el historial completo de por qué falló, intentar arreglarlo, y solo si eso también falla, anotarlo para revisión
posterior **sin frenar el resto del trabajo pendiente** (otras features/steps siguen su curso).

Los gates de seguridad reales (`checkHumanGate` en `gates.ts`: prisma migrate/db push, vercel deploy, DROP
TABLE/TRUNCATE/DELETE sin WHERE, git push a main, archivos de mutuo/pagaré) **no se tocan** — esos protegen
dinero/prod/legal real y siguen bloqueando duro, sin escalación ni excepción.

## Diseño

1. **Modelo fixer:** agregar `MODEL_FIXER = MODEL_PLANNER` (`claude-opus-4-8`) en `models.ts` — reusar la constante
   existente, no inventar una nueva si termina siendo el mismo valor; si preferís una constante separada por
   claridad semántica está bien, pero que apunte a Opus, no a Sonnet (ya falló con Sonnet 3 veces, repetir con el
   mismo tier no tiene sentido).

2. **Acumular historial de fallos, no solo el último error.** Hoy `executeStepWithRetry` pisa `priorError` en cada
   intento (`priorError = result.output.slice(-2000)`) — al llegar al tercer fallo solo se conserva el último. Para
   que el fixer tenga contexto real, necesita ver **la secuencia completa**: qué intentó el builder en cada intento,
   qué dijo el verifier/QA/reviewer en cada rechazo. Sumá un array (`failureHistory: string[]` o similar) al `Step`
   en `state.ts` (zod, con `.default([])` como los campos existentes — ver `retries`/`adrIds` para el patrón) que
   se va appendeando en cada fallo real (builder / verifier / QA / reviewer) en vez de solo pisar una variable
   local. Cap razonable de tamaño total (ej. últimos 4-6 fallos, o un total de caracteres) para no volar el
   contexto del fixer.

3. **Función de escalación** (nuevo archivo `orchestrator/src/escalation.ts`, o donde tenga más sentido dentro de
   `executor.ts` — tu criterio): `escalateStep(step, state, failureHistory): Promise<{ ok: boolean, sessionId,
   adrBlocks, finalError? }>`.
   - Sesión **nueva, no resumida** (no `--resume` del session id del builder trabado) — el punto es un par de ojos
     frescos con más criterio, no continuar el mismo hilo de razonamiento que ya se estancó.
   - Prompt: spec del step + secciones "Fuera de alcance"/"Restricciones clave" (ya existen en
     `loadSpecSections`, reusalas) + un resumen claro de `failureHistory` ("intento 1: builder implementó X, falló
     verifier con: ...; intento 2: ...; intento 3: ..."), pidiendo explícitamente que diagnostique la causa raíz
     antes de tocar código, no que repita el mismo approach.
   - Mismo formato de invocación que `reviewer.ts` (`--model MODEL_FIXER`, `--output-format json`,
     `parseClaudeJson` para extraer `text`, `recordInvocation` para métricas) o el de `executor.ts` si necesita
     escribir archivos (sí necesita — a diferencia del reviewer, este SÍ debe poder usar
     `Read,Edit,Write,Bash,Glob,Grep`).
   - Presupuesto de reintentos propio y chico: 1-2 intentos, no otros 3 — es la última instancia, no un loop
     paralelo infinito.
   - Después de un intento exitoso del fixer, corré el verifier igual que se corre para el builder normal (no te
     saltees la verificación solo porque el modelo es más caro/confiable).

4. **Reemplazar `haltBlocked` en los 5 call-sites de `index.ts`** (búscalos por `haltBlocked(state,`) por una
   función `escalateOrHalt(step, state, detail)` que:
   - Arma/lee el `failureHistory` acumulado del step.
   - Llama a `escalateStep`.
   - Si tiene éxito: seguí el flujo normal (commit, ADR, avanzar al siguiente step) — el step deja de estar
     bloqueado, nunca llega a marcarse `blocked` de cara al usuario.
   - Si también falla: **ahí sí** marcá `blocked` de verdad, loguealo con el historial completo (builder + fixer),
     avisá por Telegram con `notifyStepBlocked` (ya existe, dejala como está — es informativa, sin botón, correcto)
     y **NO cortés el proceso entero**: el loop debe seguir buscando otro step/feature elegible
     (`getNextPendingStep` ya saltea steps `blocked`, así que alcanza con no hacer `return`/salir del proceso si
     hay más trabajo pendiente en cola). Si no queda nada más que hacer, ahí sí termina naturalmente, como hoy.

5. **Costo:** Opus es caro. No hace falta un cap duro para la v1, pero dejá loggeado cuántas veces se disparó la
   escalación (para que se pueda revisar el gasto después, ej. vía `recordInvocation` que ya trackea costo por
   invocación — confirmá que el rol `fixer` quede identificable en las métricas igual que `executor`/`reviewer`).

## Tareas

1. `models.ts`: agregar `MODEL_FIXER`.
2. `state.ts`: agregar `failureHistory` (o el nombre que prefieras, documentalo) al schema de `Step`, default `[]`,
   backward-compatible con estados existentes en disco.
3. Acumular fallos reales (builder/verifier/QA/reviewer) en ese array en vez de pisar una variable local.
4. `escalation.ts` (o donde corresponda): `escalateStep()` como se describe arriba.
5. `index.ts`: reemplazar los 5 usos de `haltBlocked` por `escalateOrHalt`, sin cortar el loop si hay más trabajo
   pendiente cuando la escalación también falla.
6. Tests: mock del `callClaude`/`execa` del fixer (mismo patrón que `reviewer.test.ts` con `ReviewerOpts.callClaude`
   inyectable) cubriendo: escalación exitosa retoma el flujo normal; escalación fallida marca `blocked` y el loop
   sigue con el próximo step/feature disponible en vez de terminar el proceso; `failureHistory` se acumula
   correctamente a través de múltiples tipos de fallo (no solo builder).
7. Verificación real: si podés, disparar un step que falle a propósito (ej. un step con una restricción imposible)
   contra un target de test y confirmar en los logs que escala a Opus y qué hace con eso — si no es práctico,
   dejalo documentado como pendiente de validar en el próximo trabazo real.
8. Marcá `S-039` ✅ en `system/BACKLOG.md` al terminar, con fecha, y una línea resumiendo qué tan lejos llegó la
   verificación real (mock vs. corrida real).

## Restricciones

- No toques `gates.ts` / `checkHumanGate` — los gates de dinero/prod/legal siguen duros, sin escalación.
- No hagas que el fixer pueda correr `prisma migrate`, `vercel deploy`, tocar `main` directo, ni archivos de
  mutuo/pagaré — mismas restricciones absolutas que ya tiene el prompt del builder en `buildPrompt()`
  (`executor.ts`), copiálas/reusalas, no las relajes para el fixer.
- El fixer no reemplaza al reviewer: si escala y arregla, el diff igual pasa por verifier (y por reviewer, si ese
  fue el step que lo originó) antes de commitear — no bypasees controles existentes.
- Commit + push a `main`. Veredicto: con qué mock/caso confirmaste que (a) la escalación exitosa retoma el flujo
  normal y (b) una escalación fallida no frena el resto de la cola.
