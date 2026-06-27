Implementá S-001: un rol de **Code Reviewer** independiente dentro del loop del orchestrator (`augusto-os/orchestrator`), que revisa el diff de cada step ANTES de que se commitee — no después. Hoy el loop es Planner (Opus) → Builder (Sonnet) → Verifier (tsc+lint+tests) → [QA si es UI] → commit. Falta una pasada de juicio cualitativo sobre el diff que el Verifier no cubre (typecheck/tests pasan pero el código puede tener scope creep, decisiones cuestionables, o violar una regla de dominio que no está en ningún test).

## Contexto del repo (leé antes de tocar nada)
- `orchestrator/src/verifier.ts` — patrón de checks: `run(cmd, args)` con `execa`, devuelve `{ok, errors}`.
- `orchestrator/src/executor.ts` — patrón de invocación a Claude Code como subproceso: `execa('claude', ['--model', MODEL_X, '--output-format', 'text', '--dangerously-skip-permissions', '--allowedTools', '...', '-p', prompt], { cwd: getRepoRoot(), reject: false, all: true })`. Reusá este patrón, no inventes uno nuevo.
- `orchestrator/src/index.ts` — el loop principal, función `runLoop()`. El punto de inserción es DESPUÉS de que `runVerifier()` (y `runQA()` si `step.ui`) pasan, y ANTES de `commitStep()` — línea ~312, `const sha = await commitStep(step.id, step.desc)`.
- `orchestrator/src/models.ts` — agregar `export const MODEL_REVIEWER = 'claude-opus-4-8'`. Usar Opus (no Sonnet) porque el Reviewer necesita criterio más agudo que el Builder que escribió el código — son roles distintos, no el mismo modelo revisándose a sí mismo.
- `orchestrator/src/executor.ts` función `loadSpecSections()` — el Reviewer necesita el mismo contexto de "Fuera de alcance" y "Restricciones clave" del spec del feature para detectar scope creep.

## Qué construir

### 1. `orchestrator/src/reviewer.ts`
```ts
export interface ReviewResult {
  approved: boolean
  feedback: string
}

export async function runReviewer(step: Step, state: OrchestratorState): Promise<ReviewResult>
```

Lógica:
1. Obtené el diff sin commitear: `git diff` (working tree, no staged) en `getRepoRoot()` vía `execa`. Si el diff está vacío, devolvé `{approved: true, feedback: ''}` (nada que revisar — algunos steps no tocan código, ej. solo correr un comando).
2. Si el diff supera ~8000 caracteres, truncalo con una nota explícita ("diff truncado, primeras N líneas") — no mandes diffs gigantes al modelo sin avisar.
3. Armá un prompt para Opus con: la descripción del step (`step.desc`), las secciones "Fuera de alcance"/"Restricciones clave" del spec (reusar `loadSpecSections` de executor.ts, exportala si no lo está), y el diff. Pedile que evalúe:
   - ¿El cambio hace lo que dice el step, ni más ni menos (scope creep)?
   - ¿Viola alguna restricción del spec o regla de dominio conocida (TNA visible a prestatario, columnas camelCase sin @map, no tocar mutuo/pagaré, no prisma migrate/db push)?
   - ¿Hay un error de lógica evidente que typecheck/tests no van a agarrar (ej. condición invertida, off-by-one, manejo de null)?
   - ¿Calidad mínima: nombres, duplicación obvia, dead code dejado por error?
4. Pedile que responda en un formato fijo y parseable:
   ```
   REVIEW: APPROVED
   ```
   o
   ```
   REVIEW: CHANGES_REQUESTED
   - <issue 1>
   - <issue 2>
   ```
5. Parseá la respuesta. Si no matchea ninguno de los dos formatos exactos, tratalo como `CHANGES_REQUESTED` con el output completo como feedback (fail-safe: ante ambigüedad, no aprobar en silencio).
6. Invocación: mismo patrón que `executor.ts`, con `MODEL_REVIEWER`, `--allowedTools` vacío o solo lectura (el Reviewer NO debe escribir archivos — es de solo lectura sobre el diff que le pasás en el prompt, no necesita tocar el repo).

### 2. Wiring en `orchestrator/src/index.ts`
Después de que `runVerifier()` (+ QA si aplica) pasan y ANTES de `commitStep()`:
```ts
const review = await runReviewer(step, state)
if (!review.approved) {
  log(`[reviewer] CHANGES_REQUESTED en step ${step.id}:\n${review.feedback}`)
  step.retries = (step.retries ?? 0) + 1
  if (step.retries >= 3) {
    markStepStatus(state, step.id, 'blocked', { error: review.feedback })
    setHumanGate(state, `Step ${step.id}: Reviewer rechazó el diff 3 veces`)
    await runLoop(state)
    return
  }
  markStepStatus(state, step.id, 'pending', { retries: step.retries })
  const fix = await executeStepWithRetry(step, state, () => review.feedback)
  if (!fix.ok) {
    markStepStatus(state, step.id, 'blocked')
    setHumanGate(state, `Step ${step.id}: no pasa review tras fix`)
    await runLoop(state)
    return
  }
  // re-correr verifier + reviewer sobre el fix antes de commitear
  const verify2 = await runVerifier()
  if (!verify2.ok) { /* mismo manejo que el bloque de verify existente */ }
  const review2 = await runReviewer(step, state)
  if (!review2.approved) { /* block + human gate, no loop infinito */ }
}
```
Adaptá el control de flujo exacto al estilo ya existente en el archivo (mirá cómo está hecho el bloque de `runVerifier()` con su segundo intento `verify2` — el Reviewer debe seguir la misma forma, sin loops infinitos, mismo tope de 3 reintentos compartido con verify/executor, no un contador nuevo separado).

### 3. Logging
En cada step exitoso, loguear `[reviewer] APPROVED` o el detalle de `CHANGES_REQUESTED`, igual que hace `[verifier]`.

### 4. Tests
- `reviewer.test.ts`: mockeá la invocación a `claude` (inyectable, mismo patrón que `architect.ts` con `callClaude` injectable si no existe ya en executor — si executor.ts no tiene esa inyección, agregala mínimamente solo en reviewer.ts, no refactorices executor).
- Casos: diff vacío → approved sin llamar al modelo; respuesta `REVIEW: APPROVED` → approved true; `REVIEW: CHANGES_REQUESTED\n- x` → approved false con feedback parseado; respuesta que no matchea formato → approved false (fail-safe).
- Test de integración liviano en index.ts si hay tests existentes de loop (mirá si existe `index.test.ts`; si no, no lo inventes, alcanza con reviewer.test.ts).

## Restricciones
- NO toques `verifier.ts`, `executor.ts` (salvo exportar `loadSpecSections` si no está exportada — cambio mínimo de visibilidad, no de lógica), `gates.ts`.
- NO le des al Reviewer permisos de escritura — es de solo lectura, su output es texto estructurado, nunca debe tocar archivos.
- El Reviewer corre SIEMPRE (no es opcional ni gatepenable por Augusto) — coherente con ADR-0019, todo el control de calidad es automático, no hay aprobación manual por step.
- No agregues dependencias nuevas.

## Entrega
- Branch `feature/s001-code-reviewer`, sin push ni merge.
- Typecheck + test suite completa en verde.
- Mostrame un resumen: archivos tocados, cómo quedó el flujo de control en `index.ts` (el bloque adaptado), y los casos de test cubiertos.
