# Backlog — augusto-os

Formato: `P<n>` = prioridad (1 = más urgente) · `[target]` = repo destino

---

## Sistema (orchestrator / augusto-os)

| ID | P | Descripción | Estado |
|----|---|-------------|--------|
| S-001 | 1 | Fase 1b: Code Reviewer — rol independiente que revisa diff antes de commit | pending |
| S-002 | 2 | Fase 2: Gating por OPERATOR_STATE (SLEEP/OFFICE/PRODUCT) | pending |
| S-003 | 3 | Fase 3: Multi-target routing (spensiv vs argos por feature) | pending |
| S-004 | 4 | Fase 4: Loops nocturnos (refactor/docs/tests sin input humano) | pending |
| S-005 | 5 | Fase 5: Product Analyst (backlog desde métricas de uso real) | pending |

## Spensiv [spensiv]

| ID | P | Descripción | Estado |
|----|---|-------------|--------|
| SP-001 | 1 | Sprint S-D: Búsqueda unificada por CUIL/DNI en consola (depende migración S-A/B/C aprobada) | blocked |
| SP-002 | 1 | Sprint S-E: Límite de originación por CUIL en frontend | blocked |
| SP-003 | 2 | Migración SA identity backbone — espera OK de Augusto | waiting |
| SP-004 | 2 | Migración AP Commission V2 — espera OK de Augusto | waiting |
| SP-005 | 3 | Refinanciación Fase 2: UI de propuesta de refinanciación | pending |
| SP-006 | 3 | Refinanciación Fase 3: router refinanceLoan + Prisma RefinancingRequest | pending |
| SP-007 | 4 | Refinanciación Fase 4: webhook Stripe / flujo de pago | pending |
| SP-008 | 4 | AP Score: integrarlo como gate en pre-aprobación (score < umbral → rechaza) | pending |

## Argos [argos]

| ID | P | Descripción | Estado |
|----|---|-------------|--------|
| AR-001 | — | Definir path local + stack exacto de Argos | waiting |
