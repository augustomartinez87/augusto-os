# Roadmap — augusto-os

Estado: `[done]` = completo · `[active]` = en curso · `[next]` = siguiente · `[pending]` = sin fecha

---

## Fase 0 — Orchestrator scaffold [done]

- Planner (Opus) → Executor (Sonnet headless) → Verifier (tsc + lint + test) → QA (Playwright) → commit atómico
- Guardrails: `permissions.deny` + hook `pre-tool-use.sh`
- Feature prueba: F-0001 (AP score badge en consola) — completada 2026-06-18, 4 pasos, 4 commits

## Fase 1 — augusto-os: repo + memoria del sistema [active]

- Repo `augusto-os` separado de los targets
- `system/` con VISION, OPERATING_MODEL, OPERATOR_STATE, ROADMAP, BACKLOG, DECISIONS, PROGRESS
- `targets/targets.json` — map de repos (spensiv, argos)
- `REPO_ROOT` dinámico desde `targets.json` (via `src/targets.ts`)
- Loop lee OPERATOR_STATE.yaml al inicio + appenda PROGRESS.md al final
- Hook actualizado al nuevo path
- Git init + primer commit en augusto-os

## Fase 1b — Code Reviewer [next]

- Rol Reviewer independiente del Builder
- Lee el diff post-executor, reporta issues antes del commit
- Puede rechazar paso y devolver feedback al Builder (reintento)
- Objetivo: reducir ruido de "pasos que pasan typecheck pero son frágiles"

## Fase 2 — Gating por OPERATOR_STATE [pending]

- Si `mode: SLEEP` → no interrumpir al PO, continuar o registrar blocker
- Si `mode: OFFICE` → solo preguntas Sí/No
- Si `mode: PRODUCT` → preguntas abiertas permitidas
- Nota (ADR-0019): ya NO hay human-gate de deploy ni de steps — el loop auto-deploya en verde y avisa por Telegram (o avisa el error si falla). Este gating por estado aplicaría a interrupciones/preguntas, no a aprobar deploys.

## Fase 3 — Multi-target & feature routing [pending]

- Features se asignan a un target (`spensiv`, `argos`)
- Verifier usa el toolchain del target (Next.js/tsc vs Vite/tsc)
- QA_BASE_URL se resuelve desde targets.json por target

## Fase 4 — Loops nocturnos [pending]

- Modo `SLEEP`: refactor, docs, tests — sin input humano
- Economía de tokens: reserva estratégica para emergencias del PO
- Backlog auto-generado desde issues detectados en los repos

## Fase 5 — Product Analyst [pending]

- Agente que lee métricas de uso real (Vercel Analytics, logs)
- Propone ítems de backlog basados en evidencia
- El PO prioriza, el sistema ejecuta

## Fase 6 — Interacción desde el celu [pending]

- 6a) Bot de Telegram (AlantORCH) — HECHO: el loop **avisa el deploy a prod** o el **error si falla** (ya no aprueba gates: el deploy es automático en verde, ADR-0019); canal para mandar ideas con `/idea`. (S-006)
- 6b) Dashboard web mobile-first como control plane (Supabase): features/steps/logs en vivo, "presencia" de agentes, cola de ideas, aprobar. El runner local pollea y ejecuta; el loop NO corre en la nube (repos + credenciales se quedan local). (S-007)
- Habilita el salto a multi-target en paralelo (ver varios agentes trabajando a la vez).
