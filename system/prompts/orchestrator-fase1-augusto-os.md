# Prompt para Claude Code — Fase 1: augusto-os + memoria del sistema

> Pegá esto en Claude Code (Sonnet). Augusto es Product Owner; salida final = veredicto en castellano.
> Objetivo de Fase 1: el sistema deja de vivir dentro de Spensiv y empieza a TENER MEMORIA PROPIA,
> coherente con el "Sistema Operativo de Augusto" (PO, loops, roles≠modelos, estados, economía de tokens).
> NO construir: seam rol↔modelo (Fase 1b), comportamiento por estado operativo (Fase 2), loops nocturnos.
> Principio rector: *¿esto acerca a Augusto a operar como PO o lo devuelve a coordinador técnico?*

## 1. Crear el repo `augusto-os` y mudar el orquestador

Crear `C:\Users\Augusto\Downloads\Proyectos\augusto-os` con esta estructura, y **mover** (no copiar) el orquestador actual desde `spensiv/orchestrator/` a `augusto-os/orchestrator/`:

```
augusto-os/
  system/
    VISION.md
    OPERATING_MODEL.md
    OPERATOR_STATE.yaml
    ROADMAP.md
    BACKLOG.md
    DECISIONS.md
    PROGRESS.md
  orchestrator/        # el loop, movido desde spensiv/orchestrator
  targets/
    targets.json       # punteros (rutas absolutas) a los repos target, NO copias
```

`targets/targets.json`:
```json
{
  "spensiv": { "path": "C:\\Users\\Augusto\\Downloads\\Proyectos\\spensiv", "stack": "Next.js/tRPC/Prisma" },
  "argos":   { "path": "<COMPLETAR: ruta local de Argos>", "stack": "React/Vite/Supabase" }
}
```
Dejá la ruta de Argos como `<COMPLETAR>` para que Augusto la cargue; no la inventes.

El orquestador debe leer `targets.json` para saber sobre qué repo trabaja (el feature declara su `target`). Ajustá los paths internos del orquestador a la nueva ubicación. Inicializá git en `augusto-os`.

## 2. Documentos de visión (fuente de verdad del sistema)

- **`VISION.md`** (estratégico): Augusto opera como Product Owner / Director de Producto, no como coordinador técnico. Argos y Spensiv son los primeros laboratorios; el objetivo real es un sistema que cree y opere productos de forma cada vez más autónoma. El activo estratégico es el sistema (memoria/loops/procesos), no los modelos.
- **`OPERATING_MODEL.md`** (operativo): filosofía de loops; roles ≠ modelos (Planner/Builder/Reviewer/Tester/Docs/Product Analyst son responsabilidades intercambiables); validación por evidencia objetiva (tests/lint/build); memoria persistente fuera del modelo; estados PRODUCT/OFFICE/SLEEP; economía de tokens (valor por token, reserva estratégica). Basate fielmente en los documentos "Sistema Operativo de Augusto" y "Cambio de Dirección" — no agregues doctrina nueva.
- **`OPERATOR_STATE.yaml`**: estado dinámico que Augusto cambia desde el celular. Default:
  ```yaml
  mode: PRODUCT        # PRODUCT | OFFICE | SLEEP
  available_for_questions: true
  response_style: normal   # normal | short
  ```
  En Fase 1 solo se CREA y el loop lo LEE y lo loguea. El comportamiento por estado (gating de preguntas, no-bloquear en SLEEP) se implementa en Fase 2 — no lo construyas ahora.

## 3. Memoria de trabajo (los artefactos que el loop lee y actualiza)

- **`ROADMAP.md`**: las fases del Sistema Operativo (0–5) con su estado. Fase 0 ✅ (copy/paste eliminado), Fase 1 🔄 (este trabajo).
- **`BACKLOG.md`**: sembralo con estos 3 ítems ya identificados (prioridad indicada):
  1. **[Alta]** Restaurar segunda capa de guardrail: git pre-push hook en cada repo target como backstop independiente del hook del orquestador (hoy quedamos en una sola capa bajo `--dangerously-skip-permissions`).
  2. **[Alta]** Correr el loop con un `DATABASE_URL` NO-producción, para que ningún camino pueda tocar datos reales (raíz del riesgo: el dev DB de Spensiv apunta a prod).
  3. **[Media]** QA gate debe levantar el server (`next dev` efímero o preview) en features de UI, o el invariante "el prestatario nunca ve la TNA" pasa en falso.
- **`DECISIONS.md`**: registrá las decisiones ya tomadas (repo separado augusto-os; Fase 0 antes que estructura; executor con `--strict-mcp-config --dangerously-skip-permissions`; hook = capa de seguridad load-bearing y se re-testea ante cualquier cambio de invocación).
- **`PROGRESS.md`**: log append-only de lo que hace el sistema. Cada corrida del loop agrega una entrada con fecha, feature, resultado.

## 4. Wiring mínimo del loop a la memoria

- Al **iniciar** una corrida: leer `OPERATOR_STATE.yaml`, `ROADMAP.md`, `BACKLOG.md` y loguear el contexto.
- Al **terminar** un feature: append a `PROGRESS.md` (qué se hizo, commits, verde/rojo) y, si hubo una decisión de diseño relevante, a `DECISIONS.md`.
- No más que eso en Fase 1.

## 5. Verificación

1. El orquestador corre desde `augusto-os/orchestrator/` (paths actualizados).
2. Re-correr F-0001 apuntando al target `spensiv`: debe completar como antes y dejar una entrada nueva en `PROGRESS.md`.
3. Confirmar que el hook anti-prod sigue disparando desde la nueva ubicación (un comando peligroso simulado → BLOCKED en blocked.log).
4. `spensiv/orchestrator/` ya no existe (mudado, no duplicado).

## Salida (castellano, PM-readable)

Cerrá con UNA línea:
- **"✅ Fase 1 lista. augusto-os creado, orquestador mudado, memoria del sistema activa. F-0001 re-corrió verde desde la nueva ubicación."**
- **"⛔ Trabado en: <causa>. Sugerencia: <una línea>."**

Y listá en 1 renglón qué quedó en `<COMPLETAR>` para que Augusto lo cargue (la ruta de Argos).
