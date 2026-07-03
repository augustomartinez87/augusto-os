# Hardening — Heartbeat del loop + lock por liveness (+ fix markBacklogState)

> Prompt para Claude Code. Ejecutor: Sonnet. Repo: `augusto-os`. Autorizado a commitear y pushear a `main`.
> **Diagnosticá sobre `main` actualizado.** Lo de abajo describe síntomas observados y el objetivo de diseño; no asumas que el código es exactamente como se describe — verificá la arquitectura real de procesos antes de tocar.

## Contexto y raíz del problema

S-015 agregó presencia con heartbeat, pero el heartbeat se emite desde `sync.ts` (el proceso del control plane / autopilot), que es **distinto** del proceso que realmente ejecuta una feature (el loop `index.ts`, spawneado por el autopilot como `npm start <featureId>`). Consecuencia: si `sync.ts` sigue vivo pero un loop spawneado se cuelga, el heartbeat queda fresco y el dashboard muestra "trabajando" cuando en realidad el build está colgado. (Documentado en ADR-0032 como trabajo futuro.)

Ese mismo agujero es la raíz del bug `Lock stale (660s), pisando...` que aparece en los logs del autopilot: un loop spawneado que murió sin liberar el lock, detectado por un timeout fijo que se "pisa" en vez de por señal de vida.

**Objetivo:** señal de vida confiable desde el proceso que construye, y manejo de lock basado en esa señal. Verificá primero la arquitectura de procesos real (¿cuántos procesos? ¿quién spawnea qué? ¿dónde vive el lock?) antes de implementar.

## Tarea 1 — Heartbeat del loop de ejecución

- Que el loop principal (`index.ts` / el proceso de `npm start <featureId>`) emita su **propio** heartbeat mientras ejecuta, identificado por `feature_id` y por proceso (pid). Actualizarlo en los puntos de avance: arranque del planner, cada step del builder, verify, deploy.
- Persistirlo donde el dashboard lo pueda leer (extender `orch_presence`, o una fila/recurso de "loop activo" con `feature_id`, `pid`, `last_heartbeat`). Distinguir claramente **dos señales**: "control plane vivo" (sync.ts) vs "loop de build vivo" (index.ts).
- Dashboard (`dashboard/index.html`): el estado "sin señal / posible cuelgue" del roster debe keyear sobre el heartbeat del **loop de build**, no sobre el de sync.ts. Mantener los umbrales de ADR-0032 (ajustá si hace falta y documentá). Sin regresión: si no hay heartbeat de loop, comportarse como hoy.

## Tarea 2 — Lock por liveness (no por timeout fijo)

- Root-cause del `Lock stale (660s), pisando...`. Reemplazar la lógica de "stale por tiempo fijo" por **stale por heartbeat frío**: un lock se considera reclamable solo si el heartbeat del loop dueño está frío más allá del umbral. Si está fresco, se respeta (nunca pisar un loop vivo).
- Al reclamar un lock stale, loguear explícitamente por qué (pid dueño, antigüedad del heartbeat) y limpiar el estado huérfano, sin spawnear sobre un proceso que sigue vivo.
- Evitar el escenario de dos loops pisándose.

## Tarea 3 — Fix `markBacklogState: ID NONEXISTENT-999 no encontrado`

- Root-cause: por qué el autopilot intenta marcar un ID que no existe en `BACKLOG.md`. Asegurar que el picking del autopilot solo seleccione IDs **presentes** en el backlog.
- `markBacklogState` debe fallar de forma segura: si el ID no existe, warning y skip — nunca crashear ni entrar en loop. Test del caso.

## Memoria del sistema

- `DECISIONS.md`: ADR cerrando la limitación de ADR-0032 (ahora hay liveness del loop real). Origen `Supuesto del agente` para umbrales/diseño.
- `BACKLOG.md`: asigná el próximo ID libre a este hardening (regla de IDs append-only) y marcalo ✅ al terminar; cerrar/cruzar el ítem del `Lock stale` si existía suelto.
- `PROGRESS.md`: append con SHA.

## Restricciones

- Diagnóstico sobre main fresco; verificá la arquitectura de procesos antes de cambiarla.
- No introducir personalidad/pixel art ni agentes ficticios (sigue valiendo el alcance de S-015).
- Tests para el lock-por-liveness y para el fix de markBacklogState.
- No redeploy del dashboard sin OK de Augusto; si el push dispara Vercel, avisalo.
- Veredicto en castellano: qué procesos emiten heartbeat ahora, cómo quedó la decisión de lock, y confirmación de que un loop colgado se ve en el dashboard.
