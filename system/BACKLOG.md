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
| S-006 | 2 | Celu Fase 1: bot de Telegram — notifica gates y permite aprobar/idear desde el celu (reemplaza `npm run approve`) | pending |
| S-007 | 3 | Celu Fase 2: dashboard web mobile-first (control plane Supabase) — ver roadmap/backlog/WIP por proyecto, logs en vivo, findings de loops nocturnos, cola de ideas, aprobar decisiones. Runner local pollea; no corre el loop en la nube | pending |
| S-008 | 1 | **Architect agent** — el "chat como Claude" dentro de augusto-os: recibís una idea, te hace el intake (FEATURE-INTAKE.md), refina, escribe el `features/F-XXXX.md` y lo suma al backlog/roadmap. Lee `system/` para continuidad. Es lo que saca la fricción "yo de intermediario". Núcleo del chat del dashboard (S-007) | pending |

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
