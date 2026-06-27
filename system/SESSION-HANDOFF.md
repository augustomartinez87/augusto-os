# Handoff de sesión — 2026-06-26

> Punto de entrada para un chat nuevo de Cowork. Leé también, en orden: `ARQUITECTURA-ACTUAL.md`,
> `BACKLOG.md`, `CONVENTIONS.md`, `DECISIONS.md` (ADR), `MODEL-ROUTING.md`. Con eso quedás al día.

## Qué es augusto-os
Orquestador autónomo de desarrollo. Opus planifica (Planner), Sonnet ejecuta (Builder), Verifier corre tsc+lint+tests, QA Playwright, y **auto-deploya a prod cuando todo da verde** (ADR-0019, sin gates humanos). Toda la memoria vive en `system/` (esto permite cambiar de modelo sin perder contexto). El coordinador es código determinístico (`index.ts`), NO un LLM.

## Estado vivo (procesos del runner, local)
- **Loop:** `npm start F-XXXX` (en `orchestrator/`). Auto-deploy en verde; si falla, no deploya y avisa el error por Telegram.
- **Bot Telegram (AlantORCH):** `npm run bot`. Avisa deploy ✅ / error ❌ y recibe ideas con `/idea`.
- **Sync a Supabase:** `npm run sync`. Espeja estado/log/backlog/ideas al control plane.
- **Dashboard:** `augusto-os.vercel.app` (repo GitHub `augustomartinez87/augusto-os`, Root Directory `dashboard`, auto-deploy en cada push). Pestañas Loop / Backlog / Ideas.
- **Supabase control plane:** proyecto dedicado `exyhnrynpuflbuprmdto` (tablas `orch_*`). Credenciales en `orchestrator/.env` (gitignored).

## Hecho hoy (2026-06-25/26)
- **F-0005** (gate de originación por vínculo) y **F-0007** (documentos pendientes del préstamo) → deployados a **Kredy prod**.
- **S-009** (ADR auto-log), **S-006** (bot Telegram), **S-018** (auto-deploy en verde), **S-013** (guard anti-reejecución) → hechos.
- **S-007** (dashboard, Fase A control plane + Fase B web v1) → andando.
- Bugfixes del loop: gate infinito por falso positivo `mutuo|pagaré`, memoria `humanApproved`, reintento del aviso de Telegram.

## Pendientes (detalle en `BACKLOG.md`)
- **Recomendado primero — sprint de hardening:** S-019 (bugs del loop: `getNextPendingStep` saltea blocked, `pushMain` verifica branch, dedup `appendProgress`, sacar `awaitingPushApproval` muerto, centralizar strings de modelo), S-020 (el Builder vea "Fuera de alcance"/"Restricciones" del spec, no solo el step.desc), S-021 (tests del core: state/index/gates). Fundamento: review de OpenCode; el sistema que toca prod es el menos testeado.
- **S-017:** el ADR auto-log inserta los ADR DENTRO del fence del template en `DECISIONS.md` → lo está ensuciando. Arreglar el anclaje de inserción.
- **F-0006** (mutuo por el total + pagaré pre-llenado "sin protesto" + gate de descarga). Corre con el código nuevo → auto-deploya. ⚠️ Validar el texto legal del pagaré-por-el-total con un abogado antes de usarlo con un prestatario real.
- **S-008** (Intake barato → Architect Opus on-demand) y **S-014** (Builder barato vía Claude Code Router) → las dos palancas reales de costo.
- **Migración Kredy→Neon:** PAUSADA hasta el domingo. Runbook en `MIGRATION-kredy-to-neon.md`.

## Convenciones que no se rompen
- Specs en `orchestrator/features/F-XXXX.md`; correr con `npm start F-XXXX`.
- Specs SIN migración de schema (es gate humano); preferir config JSON existente.
- Kredy NUNCA muestra TNA/tasa al prestatario; el pagaré va por el total a devolver.
- Modificaciones al orquestador en sí (telegram/sync/index/etc.) las hace Claude Code o este asistente directo; las features de producto van por el loop.

## Acción manual pendiente de Augusto
- Pegar `CLAUDE-global-actualizado.md` en Configuración → Cowork → Instrucciones globales (reemplaza la config vieja que confundía Kredy/Spensiv).
