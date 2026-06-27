# Prompt para Claude Code — Sprint de hardening del loop (S-019 + S-021 + S-020 + S-017)

> Pegar tal cual en Claude Code, parado en la raíz del repo `augusto-os`.
> **No correr esto vía `npm start F-XXXX`** — es una modificación al orquestador en sí,
> no una feature de producto. Trabajo directo en `orchestrator/src/`.
> **No hacer push directo a `main` al terminar.** Dejar el trabajo committeado en una rama
> (`hardening/loop-s019`) y avisar a Augusto para que revise el diff antes de mergear —
> es la única excepción razonable a "sin gates humanos" (ADR-0019), porque esto modifica
> el mecanismo de seguridad que decide cuándo se hace auto-deploy a prod.

## Contexto

`orchestrator/` es el loop que planifica (Opus), ejecuta (Sonnet) y auto-deploya a prod en
verde (ADR-0019, sin gate humano por step). Es el código menos testeado del sistema pese a
ser el que toca prod. Este sprint corrige 4 bugs/gaps concretos detectados en review.

Leer antes de tocar nada: `system/CONVENTIONS.md`, `system/ARQUITECTURA-ACTUAL.md`,
`system/DECISIONS.md` (ADR-0019 en particular).

## Tareas

### 1. (S-019a) `getNextPendingStep` saltea steps `blocked`

Archivo: `orchestrator/src/state.ts`, línea ~90:

```ts
export function getNextPendingStep(state: OrchestratorState): Step | null {
  return state.steps.find(s => s.status !== 'done') ?? null
}
```

Bug: esto devuelve el primer step que no esté `done`, incluyendo uno en estado `blocked`.
El loop lo vuelve a tomar como "siguiente pendiente" y lo re-ejecuta indefinidamente (o lo
pasa al executor en un estado inconsistente) en vez de detenerse y esperar resolución humana
del bloqueo.

Fix: `getNextPendingStep` debe devolver `null` si el primer step no-`done` tiene
`status === 'blocked'` (el loop principal en `index.ts` ya debe tener — o hay que agregarle —
un chequeo que, al recibir `null` con algún step `blocked` pendiente, loguee el bloqueo y
corte la ejecución en vez de asumir que terminó limpio). Revisar el llamador en
`orchestrator/src/index.ts` línea ~167 para que distinga "no hay más pasos" de "hay un paso
bloqueado esperando intervención".

### 2. (S-019b) `pushMain` no verifica estar en `main`

Archivo: `orchestrator/src/git.ts`, línea ~83:

```ts
export async function pushMain(baseBranch = 'main'): Promise<boolean> {
  const res = await execa('git', ['push', 'origin', baseBranch], { cwd: getRepoRoot(), reject: false })
  ...
}
```

Bug: hace `git push origin main` sin comprobar que el branch actual (HEAD) sea realmente
`main`. Si por cualquier motivo el merge previo (`mergeIntoMain`) falló o dejó el repo en otro
branch, esto puede pushear contenido equivocado a `main` y disparar un deploy a prod no
intencional.

Fix: antes del push, obtener el branch actual (`git rev-parse --abbrev-ref HEAD`) y abortar
con log claro si no coincide con `baseBranch`. No pushear en ese caso.

### 3. (S-019c) Dedup en `appendProgress`

Archivo: `orchestrator/src/index.ts`, función `appendProgress` (línea ~41).

Bug: al resumir una sesión interrumpida (`npm start F-XXXX` sobre un STATE.json existente),
`appendProgress` puede agregar la misma entrada de progreso más de una vez en
`PROGRESS.md`, ensuciando el historial.

Fix: antes de escribir, verificar si ya existe una entrada para ese `featureId` + contenido
equivalente (o un marcador idempotente, ej. hash del summary) en `PROGRESS.md` y no
duplicar. Mirar cómo `adr.ts` resuelve idempotencia para ADRs (S-009) y aplicar el mismo
criterio aquí si es razonable reusarlo.

### 4. (S-019d) Remover `awaitingPushApproval` (código muerto)

Archivo: `orchestrator/src/state.ts`, línea ~34 (campo del schema) y sus usos en
`orchestrator/src/index.ts`.

Contexto: `awaitingPushApproval` quedó del modelo viejo de gate-por-step, reemplazado por
ADR-0019 (auto-deploy en verde, sin gate humano por step). Ya no se usa para bloquear nada.

Fix: eliminar el campo de `state.ts` (schema zod) y todas las referencias muertas en
`index.ts`. Si algún STATE.*.archived.json viejo lo tiene, no migrar — son archivos
archivados, no afecta lectura.

### 5. (S-019e) Centralizar strings de modelo

Archivos: `orchestrator/src/executor.ts` línea ~88 (`'claude-sonnet-4-6'`) y
`orchestrator/src/planner.ts` línea ~50 (`'claude-opus-4-8'`).

Bug: los nombres de modelo están hardcodeados en cada archivo. Esto bloquea S-014 (routing
multi-modelo: Builder barato vía Claude Code Router), que necesita un único punto de
configuración para decidir qué modelo usa cada rol.

Fix: crear `orchestrator/src/models.ts` (o agregar a un `config.ts` si ya existe uno) con
constantes exportadas, ej.:

```ts
export const MODEL_PLANNER = 'claude-opus-4-8'
export const MODEL_BUILDER = 'claude-sonnet-4-6'
```

y reemplazar los strings literales en `executor.ts` y `planner.ts` por estas constantes.
No implementar routing condicional todavía (eso es S-014, fuera de alcance acá) — solo
centralizar.

### 6. (S-021) Tests del core

Hoy solo existe `orchestrator/src/adr.test.ts`. Agregar, con el mismo framework/runner que
ya usa ese archivo:

- `orchestrator/src/state.test.ts`: cubrir `getNextPendingStep` (incluyendo el fix del punto
  1: que devuelva `null` ante un step `blocked`), `markStepStatus`, `archiveState`.
- `orchestrator/src/index.test.ts` (o extraer la lógica pura del loop a funciones testeables
  si `index.ts` está muy acoplado a I/O — usar criterio, no forzar mocks frágiles):
  cubrir al menos el flujo de "step blocked → no avanza" y el dedup de `appendProgress`.
- `orchestrator/src/gates.test.ts`: cubrir `checkHumanGate` con casos que matchean y no
  matchean (incluido el caso `mutuo|pagaré` que ya dispara aprobación humana — no romperlo).

No es necesario cobertura exhaustiva — priorizar los caminos que tocan prod (push, merge,
gates) y los bugs recién corregidos.

### 7. (S-020) Builder ve "Fuera de alcance" / "Restricciones clave" del spec

Archivo: `orchestrator/src/executor.ts`, línea ~30, dentro del prompt que se le pasa al
executor (`TAREA: ${step.desc}`).

Bug: el prompt del Builder solo recibe `step.desc` (la descripción puntual del paso). No ve
las secciones "Fuera de alcance" ni "Restricciones clave" del `features/F-XXXX.md` completo
(ver ejemplo en `orchestrator/features/F-0006.md`), que contienen reglas de dominio que el
Builder debe respetar aunque no estén en el paso individual (ej.: "nunca exponer TNA/tasa al
prestatario", "sin migración de schema").

Fix: el código que arma el prompt del executor debe leer el F-XXXX.md completo (ya se está
leyendo en algún punto del loop para parsear los steps — reusar esa lectura, no volver a
leer el archivo dos veces si se puede evitar) y extraer las secciones "Fuera de alcance" y
"Restricciones clave" (parsear por el encabezado markdown `## Fuera de alcance` y
`## Restricciones clave`), e inyectarlas en el prompt del executor además de `step.desc`,
con un encabezado claro tipo:

```
TAREA: ${step.desc}

FUERA DE ALCANCE (no hacer):
${fueraDeAlcance}

RESTRICCIONES CLAVE (no romper):
${restriccionesClave}
```

Si el F-XXXX.md no tiene alguna de las dos secciones, omitir ese bloque sin error.

### 8. (S-017) Fix del anclaje de inserción del ADR auto-log

Archivo: `orchestrator/src/adr.ts` (la función que inserta ADRs nuevos en
`system/DECISIONS.md`, agregada en S-009).

Bug: la inserción cae DENTRO del fence de código del template de `DECISIONS.md`
(el bloque ` ``` ` que muestra el formato esperado de un ADR), rompiendo el markdown del
archivo.

Fix: ubicar el anclaje correcto — debe insertar el ADR nuevo DESPUÉS del bloque completo de
template (después del cierre del fence ` ``` ` del ejemplo), no inmediatamente después del
header de sección. Revisar `parseAdrBlocks`/`appendAdr` (mencionados en `system/BACKLOG.md`
S-009) y ajustar el punto de inserción. Agregar un test en `adr.test.ts` que reproduzca este
caso específico (insertar sobre un `DECISIONS.md` que tenga el template con fence) y falle
con el bug actual.

## Verificación antes de terminar

- `npm run build` (o `tsc --noEmit`) sin errores en `orchestrator/`.
- Lint sin errores.
- Todos los tests (`adr.test.ts` + los nuevos) en verde.
- Grep manual de `awaitingPushApproval` en todo `orchestrator/src/` → cero resultados.
- Diff final corto y revisable — no tocar nada fuera de lo descripto en los 8 puntos.

## Entrega

Commit(s) en rama `hardening/loop-s019` (no pushear a `main`). Resumen final con: qué se
tocó por punto, qué tests se agregaron, y cualquier decisión de diseño no trivial tomada
(si hay alguna, anotarla como candidata a ADR para que Augusto la registre manualmente, dado
que esta corrida no pasa por el loop y por lo tanto no dispara el ADR auto-log).
