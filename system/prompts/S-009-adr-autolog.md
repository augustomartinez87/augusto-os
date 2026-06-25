# Prompt para Claude Code — S-009: ADR auto-log

> Pegá este documento en Claude Code (Sonnet) corriendo dentro de `augusto-os/orchestrator/`.
> Augusto es Product Owner; tu salida final = un **veredicto en castellano** con la tabla PASÓ/FALLÓ, no un volcado técnico.
> Alcance ÚNICO de este sprint: que el loop **escriba sus decisiones de diseño solo** en `system/DECISIONS.md`.
> NO construir: Code Reviewer (S-001), gating por estado (S-002), Telegram (S-006), dashboard (S-007), Architect (S-008).

## Objetivo

Hoy el orquestador implementa features pero **no documenta las decisiones de diseño que toma durante cada step**. Queremos que lo haga automáticamente, en formato ADR, declarando el **Origen** de cada decisión (`Instrucción de Augusto` vs `Supuesto del agente`). Esto hace la memoria **portable entre modelos**: si mañana el Builder es otro modelo (Llama, etc.), el ADR sigue siendo legible y el contexto no se reconstruye desde cero.

Spec de referencia (leela antes de empezar): `../system/CONVENTIONS.md` §2 ("ADR automático") y el template en `../system/DECISIONS.md` (encabezado).

## Diseño (respetar estos puntos de integración)

### 1. Módulo nuevo `src/adr.ts`

Responsable de escribir en `system/DECISIONS.md`. Funciones:

- `parseAdrBlocks(output: string): AdrDraft[]` — extrae de la salida del executor todos los bloques con el formato:
  ```
  ===ADR===
  target: kredy
  origen: Supuesto del agente
  titulo: <título corto>
  decision: <1-2 frases>
  contexto: <por qué surgió>
  alternativas: <qué se descartó, o "ninguna">
  consecuencias: <qué queda abierto, o "ninguna">
  ===END ADR===
  ```
  Si no hay bloques, devuelve `[]`. Tolerá campos faltantes (default string vacío) y espacios.

- `appendAdr(draft: AdrDraft, featureId: string, stepId: number): number` —
  1. Lee `system/DECISIONS.md` (path relativo a `orchestrator/`: `../system/DECISIONS.md`, resolvé con `import.meta.url` igual que `SYSTEM_DIR` en `index.ts`).
  2. Calcula el próximo ID: regex global `/ADR-(\d+)/g`, tomá el máximo, +1, zero-pad a 4 (`ADR-0011`).
  3. Formatea la entrada con el template canónico (Estado: `aceptada`; fecha = hoy `YYYY-MM-DD`; agregá una línea de traza `> Generado por el loop · feature ${featureId} · step ${stepId}`).
  4. **Inserta la entrada nueva como la más reciente** (el archivo es newest-first): después del bloque de header/template, antes del primer `## ADR-` existente. NO reescribas las entradas previas.
  5. Devuelve el número de ID asignado.

  Validá `origen`: debe ser uno de `Instrucción de Augusto | Supuesto del agente | Derivada`; si viene otra cosa, normalizá a `Supuesto del agente` y dejá el valor crudo entre paréntesis.

### 2. `src/executor.ts` — pedir el ADR en el prompt y devolverlo

- En `buildPrompt`, agregá una sección al final del prompt del agente:
  > Si durante este step tomaste una **decisión de diseño no trivial** (elegiste entre enfoques, introdujiste o rompiste una convención, o **asumiste algo que el spec no especifica** y que cambiaría el resultado si fuera distinto), emití al final de tu respuesta un bloque ADR con el formato `===ADR=== ... ===END ADR===` (campos: target, origen, titulo, decision, contexto, alternativas, consecuencias). Clasificá `origen`: `Instrucción de Augusto` si la decisión deriva del spec del feature o de una orden explícita; `Supuesto del agente` si la elegiste por criterio propio. Steps mecánicos (rename de copy, fix de typecheck, cambios obvios) **no** generan ADR — en ese caso no emitas ningún bloque.

- Extendé `ExecutorResult` (y el tipo que devuelve `executeStepWithRetry`) con `adrBlocks: AdrDraft[]`, parseando `output` con `parseAdrBlocks`. Que se propague hasta `index.ts`.

### 3. `src/state.ts` — idempotencia

- Agregá `adrIds: z.array(z.number()).default([])` a `StepSchema`. Sirve para no re-escribir ADRs si el loop se reanuda. Default `[]` para compatibilidad con STATE viejos.

### 4. `src/index.ts` — escribir el ADR al cerrar el step

- En `runLoop`, **justo después** de `const sha = await commitStep(step.id, step.desc)` y antes/junto a `markStepStatus(... 'done' ...)`:
  - Si `execResult.adrBlocks?.length`, por cada bloque llamá `appendAdr(block, state.featureId, step.id)`; juntá los IDs.
  - Guardá esos IDs en el step: `markStepStatus(state, step.id, 'done', { commit: sha, sessionId, adrIds })`.
  - Logueá `[adr] ADR-00XX registrado (origen: ...)`.
  - **Idempotencia:** si `step.adrIds` ya tiene elementos (reanudación), no vuelvas a escribir.
- En `buildPRBody` (lo que va a `PROGRESS.md`): si la feature generó ADRs, agregá una sección `### Decisiones (ADR)` listando `ADR-00XX — <título> [origen]`, **resaltando los `Supuesto del agente`** para review rápida de Augusto.
- En el veredicto final en castellano que imprime el loop, incluí la línea de ADRs nuevos con su origen.

## Restricciones

- Cambio mínimo. NO toques `db-guard.ts`, `qa.ts`, la fase de release ni los gates.
- NO corras `prisma`, NO deployés, NO toques `main`.
- `appendAdr` escribe **solo** en `system/DECISIONS.md`. No persiste nada en otro lado.
- Debe seguir funcionando con STATE.json viejos (sin `adrIds`).

## Verificación (lo que tenés que dejar pasando)

1. `npx tsc --noEmit` limpio.
2. Lint (si hay script) limpio.
3. **Test nuevo** (vitest) para `adr.ts`:
   - `parseAdrBlocks` extrae 0, 1 y N bloques correctamente y tolera campos faltantes.
   - `appendAdr` sobre un `DECISIONS.md` de fixture: asigna el ID correcto (max+1), inserta como más reciente, no rompe las entradas previas, normaliza un `origen` inválido.
4. Los 123+ tests existentes siguen verdes.
5. Prueba manual sugerida (documentala, no la ejecutes contra prod): un dry-run donde el executor devuelve un output con un bloque ADR de ejemplo y se verifica que `DECISIONS.md` recibe `ADR-0011`.

## Salida final (para Augusto)

Una tabla en castellano:

| Ítem | Estado | Nota |
|------|--------|------|
| `adr.ts` (parse + append) | PASÓ/FALLÓ | … |
| Prompt del executor pide ADR | PASÓ/FALLÓ | … |
| `index.ts` escribe ADR al cerrar step | PASÓ/FALLÓ | … |
| Idempotencia en reanudación | PASÓ/FALLÓ | … |
| Tests nuevos + suite existente | PASÓ/FALLÓ | … |

Y una frase: ¿queda listo para que el próximo feature genere sus ADR solo? Si algo quedó pendiente, decilo explícito.
