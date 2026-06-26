# Backlog — augusto-os

Formato: `P<n>` = prioridad (1 = más urgente) · `[target]` = repo destino

---

## Sistema (orchestrator / augusto-os)

| ID | P | Descripción | Estado |
|----|---|-------------|--------|
| S-000 | ✅ | Aislamiento de prod: DB no-prod + guard anti-prod en el loop | done 2026-06-19 |
| S-000b | ✅ | Dev DB de Spensiv = Neon; secreto gitignored; esquema materializado | done 2026-06-19 |
| S-000c | 3 | Seed data de prueba para Spensiv en Neon (no hay seed script — datos vacíos) | pending |
| S-001 | 1 | Fase 1b: Code Reviewer — rol independiente que revisa diff antes de commit | pending |
| S-002 | 2 | Fase 2: Gating por OPERATOR_STATE (SLEEP/OFFICE/PRODUCT) | pending |
| S-003 | 3 | Fase 3: Multi-target routing (spensiv vs argos por feature) | pending |
| S-004 | 4 | Fase 4: Loops nocturnos (refactor/docs/tests sin input humano) | pending |
| S-005 | 5 | Fase 5: Product Analyst (backlog desde métricas de uso real) | pending |
| S-006 | ✅ | Celu Fase 1: bot de Telegram (AlantORCH) — notifica gates y permite aprobar/idear desde el celu. `telegram.ts`+`bot.ts`+hook en gates+`npm run bot`, sin deps (fetch nativo). Probado- responde y guarda ideas | done 2026-06-25 |
| S-007 | 3 | Dashboard web mobile-first (control plane Supabase). v1 = monitor + aprobar + ideas. **Fase A** (schema + sync del runner) prompt listo- `system/prompts/S-007A-control-plane-sync.md`. **Fase B** = la web (Next.js). **Fase C** = disparar features / Architect (S-008). Runner local pollea; el loop nunca corre en la nube | active |
| S-008 | 1 | **Intake + Architect agent** — split en 2: (a) **Intake barato** (código + modelo barato): detecta proyecto, busca ADR/features/backlog relacionados (grep/retrieval, sin Opus), clasifica bug/feature/arquitectura, resume contexto; (b) **Architect (Opus on-demand)** solo cuando la idea necesita arquitectura → escribe el `features/F-XXXX.md`. Reduce el 2º centro de gasto de Opus (el front-end conversacional, no solo el Planner). Núcleo del chat del dashboard (S-007) | pending |
| S-016 | 3 | **Diagramas de flujo de trabajo** — guía visual de qué hacer en cada caso (gate falla, deploy, etc.); candidata a pestaña en el dashboard mobile (S-007). Idea de Augusto | pending |
| S-017 | 3 | Fix ADR auto-log: inserta los ADR nuevos DENTRO del fence del template (rompe el markdown). Anclar la inserción después del bloque de template, no tras el header | pending |
| S-018 | ✅ | Auto-deploy en verde + sin gates por-step + avisos deploy/fallo por Telegram (ADR-0019) | done 2026-06-25 |
| S-019 | 1 | **Hardening del loop** (review OpenCode): `getNextPendingStep` saltea steps `blocked`; `pushMain` verifica estar en main; dedup `appendProgress` al resumir; remover `awaitingPushApproval` (muerto); centralizar strings de modelo en config (sirve para S-014) | pending |
| S-020 | 1 | **Builder ve restricciones del spec** — pasar "Fuera de alcance" + "Restricciones clave" del F-XXXX.md al prompt del executor (hoy solo ve `step.desc`). Afecta calidad/cumplimiento de reglas de dominio | pending |
| S-021 | 1 | **Tests del core** — `state.ts`, `index.ts` (loop), `gates.ts`. Hoy solo existe `adr.test.ts`; el sistema que deploya a prod es el menos testeado | pending |
| S-022 | 4 | Rotación/retención de logs (`orchestrator.log`, `blocked.log`, `logs/`, `qa-artifacts/`) — append-only sin límite, riesgo de llenar disco | pending |
| S-024 | 3 | **Evaluador de posts de X** — pegás un post guardado y el Architect lo juzga contra tu arquitectura real (lee `system/`): ¿ya implementado? / ¿vale la pena + beneficio concreto? / ¿es bait y por qué? Versión free = un prompt/skill; conecta con S-008 | pending |
| S-023 | 4 | **Closed learning loop** (idea de Hermes) — cuando el loop resuelve un patrón recurrente, auto-generar un spec/template reutilizable para no re-razonar. Evolución del ADR/specs, en NUESTRO sistema (no adoptar Hermes como motor) | pending |
| S-014 | 2 | **Routing multi-modelo** — Builder barato (DeepSeek V4 vía Claude Code Router) con Opus de Planner; el Verifier cubre el riesgo. Pilot en 1 feature, medir reintentos. Eval en `system/MODEL-ROUTING.md` | pending |
| S-015 | 3 | **Agent team view** — visualizar roles (Arquitecto/Constructor/Inspector/Revisor) con estado en vivo + modelo que corre. Parte de S-007 Fase B; usa `orch_presence`. Eval en `system/MODEL-ROUTING.md` | pending |
| S-013 | ✅ | Guard anti-reejecución (avisa "ya finalizó" + `--force` antes de gastar tokens) + reintento del aviso de gate por Telegram | done 2026-06-25 |
| S-009 | ✅ | **ADR auto-log** — el loop escribe en DECISIONS.md cada decisión de diseño con su Origen. Helper `appendAdr()` + `parseAdrBlocks` + prompt del executor + idempotencia. 13 tests verdes | done 2026-06-25 (Claude Code) |
| S-010 | 1 | **Migrar Kredy prod: Supabase → Neon** — unificar todo lo Prisma en Neon (prod + dev). Runbook en `system/MIGRATION-kredy-to-neon.md`. Toca dinero real → ejecuta Augusto con OK explícito | waiting |

## Kredy [kredy]  (préstamos/crédito — ex "Spensiv", renombrado 2026-06-20)

| ID | P | Descripción | Estado |
|----|---|-------------|--------|
| SP-001 | 1 | Sprint S-D: Búsqueda unificada por CUIL/DNI en consola (depende migración S-A/B/C aprobada) | blocked |
| SP-002 | 1 | Sprint S-E: Límite de originación por CUIL en frontend | blocked |
| SP-003 | 2 | Migración SA identity backbone — espera OK de Augusto | waiting |
| SP-004 | 2 | Migración AP Commission V2 — espera OK de Augusto | waiting |
| SP-005 | 3 | Refinanciación Fase 2: UI de propuesta de refinanciación | pending |
| SP-006 | 3 | Refinanciación Fase 3: router refinanceLoan + Prisma RefinancingRequest | pending |
| SP-007 | 4 | Refinanciación Fase 4: webhook Stripe / flujo de pago | pending |
| SP-008 | ✅ | AP Score como gate en pre-aprobación | done 2026-06-20 (F-0002, mergeado a main) |
| SP-009 | ✅ | **Gate de límite por vínculo** (conocido 500k / referido 200k+aval / desconocido 0) en preApprove. F-0005 | done 2026-06-25 (deployado) |
| SP-010 | 1 | **Mutuo + pagaré generados** — PDF del mutuo y del pagaré (uno por el total, "sin protesto", A4, monto en números y letras) desde inputs, templates únicos versionados + guía de lo manuscrito. Spec `features/F-0006.md`. Contenido legal del mutuo lo aprueba Augusto | backlog |
| SP-011 | ✅ | **Documentos pendientes del préstamo** — fotos de mutuo firmado + pagaré vía LoanAttachment, badge "pendiente" NO bloqueante. F-0007 | done 2026-06-25 (deployado) |
| SP-012 | 3 | UI para que el AP elija/edite el tier de vínculo y el referente (follow-up de SP-009) | pending |

## Spensiv (tracker finanzas personales) [spensiv]

| ID | P | Descripción | Estado |
|----|---|-------------|--------|
| SPT-001 | 3 | Seed data de prueba en el Neon dev `spensiv-dev` (hoy schema vacío, sin datos) | pending |

## Argos [argos]

| ID | P | Descripción | Estado |
|----|---|-------------|--------|
| AR-001 | ✅ | Path (`portfolio-tracker`) + stack + cmds de Argos en targets.json | done 2026-06-20 |
| AR-002 | ✅ | DB dev de Argos: NO aplica — `dbModel: none` (Supabase-client, build/test no tocan DB). Guard exime targets no-Prisma | done 2026-06-20 |
| AR-003 | 4 | Polish: prompt del executor condicional por `dbModel` (sacar frases Prisma-céntricas para targets Supabase) | pending |
| AR-004 | 4 | Si en algún momento hace falta QA visual con datos: crear Supabase branch dev de Argos | pending |
