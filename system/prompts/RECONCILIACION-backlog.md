# Reconciliación del backlog — augusto-os

> Prompt para Claude Code. Ejecutor: Sonnet. Repo: `augusto-os`. Autorizado a commitear y pushear a `main`.
> **Tarea de higiene de memoria, NO de implementación de features.** No se toca código de `orchestrator/`.

## Por qué

El backlog está desincronizado de la realidad. Síntomas: la tabla de `BACKLOG.md` llega hasta S-008, pero en `system/prompts/` hay specs de S-009, S-017, S-019, S-020, S-021; `CONVENTIONS.md` dice que S-009 (ADR auto-log) está "spec, no implementado" mientras que el changelog de S-004 ya menciona "ADR-log de la decisión" como si existiera; y al agregar S-022 hubo una colisión de ID que obligó a renumerar otro ítem a S-025. No se puede avanzar (ni dejar que el autopilot nocturno elija) sobre un backlog que no refleja lo que está realmente hecho.

Objetivo: dejar `BACKLOG.md` como un espejo honesto del estado real, con IDs estables, sin perder trazabilidad.

## Tareas

1. **Asigná a esta tarea el próximo ID S-XXX realmente libre** (después de construir el inventario del paso 2, vas a saber cuál es). Usalo en el commit y en la fila de BACKLOG.

2. **Inventario de todos los work-items.** Recolectá cada ID `S-XXX` y `F-XXXX` que aparezca en estas fuentes y armá una tabla de cruce:
   - `system/BACKLOG.md` (la cola)
   - `system/PROGRESS.md` (histórico de done)
   - `system/prompts/*.md` (specs existentes)
   - `system/DECISIONS.md` (ADRs que referencian ítems)
   - historia de git (`git log` — commits y merges que nombran un ID)

3. **Determiná el estado real de cada ID** cruzando las fuentes:
   - `done` → hay commits/merge en git Y entrada en PROGRESS.
   - `pending` → existe spec o fila en BACKLOG pero no hay merge.
   - `dropped` → descartado (documentar por qué si se sabe).
   - `unknown` → marcar explícitamente para que Augusto decida; no inventar.

4. **Resolvé estas dos ambigüedades concretas:**
   - **S-009 (ADR auto-log):** grepeá `orchestrator/src` (p.ej. `appendAdr`, escrituras a `DECISIONS.md`, instrucción de emitir ADR en `planner.ts`/`executor.ts`). Determiná si está implementado o no, y dejá `BACKLOG.md` y `CONVENTIONS.md` consistentes entre sí con la respuesta real.
   - **Colisión S-022/S-025:** verificá que ningún commit ni ADR previo siga referenciando el viejo S-022 ("rotación de logs") esperando el contenido que ahora es S-025. Si hay referencias colgadas, dejá una nota de mapeo `S-022(old)→S-025`.

5. **Reescribí `BACKLOG.md`** con la cola reconciliada: estados reales, IDs sin duplicar, ítems de `prompts/` faltantes agregados con su estado. No borres histórico — los done se reflejan ✅, no se eliminan.

6. **Fijá la regla de IDs en `CONVENTIONS.md`:** los IDs (`S-XXX`/`F-XXXX`) son **append-only**: nunca se reusan ni se renumeran. Un ítem nuevo toma siempre el próximo ID libre. (Esto previene la colisión que ya ocurrió.)

7. **Commit + push a `main`** (conventional: `docs(system): reconciliación del backlog — estados reales + regla de IDs append-only`). Append en PROGRESS si corresponde. Si tomás una decisión no trivial (p.ej. cómo clasificar un ítem ambiguo), ADR con Origen `Supuesto del agente`.

## Salida (veredicto en castellano)

- La **lista de pendientes reales** ordenada por prioridad, con una línea por ítem — para elegir el próximo sprint.
- Los ítems marcados `unknown` que necesitan decisión de Augusto.
- Confirmación de S-009 (implementado o no) y de la colisión S-022/S-025.

## Restricciones

- Solo se modifican archivos de memoria (`BACKLOG.md`, `CONVENTIONS.md`, `PROGRESS.md`, `DECISIONS.md`). **Cero cambios a código del orquestador o al dashboard.**
- No implementar ninguna feature pendiente — esto es solo auditoría + reescritura de memoria.
- Si una fuente se contradice con otra y no hay forma objetiva de resolverlo, marcar `unknown` y reportarlo, no adivinar.
