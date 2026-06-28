# S-025 — Rotación / retención de logs

> Prompt para Claude Code. Ejecutor: Sonnet. Repo: `augusto-os`. Autorizado a commitear y pushear a `main`.
> Diagnosticá sobre `main` actualizado antes de tocar.

## Contexto

Los logs crecen sin techo. Dos fuentes:

1. **`orch_logs` (Supabase):** el dashboard solo lee los últimos 60 por `ts`; el resto se acumula para siempre. (Un solo throwaway dejó 18 filas — escala feo con uso real.)
2. **Logs en disco:** `orchestrator/logs/*.log` (F-XXXX-stepN.log), más `loop-F-XXXX.log`, `orchestrator.log`, `blocked.log` en la raíz del orchestrator. Se acumulan por feature/step sin límite.

Objetivo: retención simple y segura para ambas, sin tocar la lógica de build y sin romper el dashboard.

## Tareas

1. **Diagnóstico:** confirmá qué logs existen hoy (la tabla `orch_logs` + los `.log` en `orchestrator/logs` y en la raíz) y el volumen actual.
2. **`orch_logs` (Supabase):** cleanup periódico desde `sync.ts` (que ya tiene el tick cada 5s). **Throttlealo** — NO en cada tick: una vez cada N minutos, o una vez al startup del sync. Política: borrar filas más viejas que X (recomiendo **por antigüedad, ej. 7 días**; alternativa: mantener las últimas K, ej. 2000). El dashboard lee 60, así que cualquier umbral generoso es seguro. Nunca borrar logs de un run activo (la retención por antigüedad ya lo cubre).
3. **Logs en disco:** un sweep que borra archivos `.log` más viejos que X días (mismo criterio). No borrar el del run en curso.
4. **Umbrales como constantes con comentario**, y un ADR documentando la elección (Origen: `Supuesto del agente`, auditable — igual que los umbrales de staleness de ADR-0032). Augusto los podrá ajustar.
5. **Tests:** que el cleanup borre lo viejo y preserve lo reciente; que sea idempotente; que no corra en cada tick (throttle verificado).

## Restricciones

- No tocar planner/executor/verifier ni el path de aprobación.
- No romper el dashboard (sigue leyendo los últimos 60 de `orch_logs`).
- Cleanup throttleado, idempotente y no destructivo sobre runs activos.
- Asigná el próximo ID libre si difiere (regla append-only); marcá `S-025` ✅ al terminar.
- Commit + push a `main`. Veredicto: qué umbrales quedaron (Supabase y disco), dónde corre el cleanup, y confirmación de que el dashboard no se ve afectado.
