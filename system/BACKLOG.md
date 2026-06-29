# Backlog — augusto-os

Formato: `P<n>` = prioridad (1 = más urgente) · `[target]` = repo destino · `Ejecutor` = quién ejecuta (ver CONVENTIONS §5)

---

## Sistema (orchestrator / augusto-os)

| ID | P | Descripción | Estado | Ejecutor |
|----|---|-------------|--------|----------|
| S-000 | ✅ | Aislamiento de prod: DB no-prod + guard anti-prod en el loop | done 2026-06-19 | cc |
| S-000b | ✅ | Dev DB de Spensiv = Neon; secreto gitignored; esquema materializado | done 2026-06-19 | cc |
| S-000c | 3 | Seed data de prueba para Spensiv en Neon (no hay seed script — datos vacíos) | pending | cc |
| S-001 | ✅ | **Code Reviewer** — rol independiente (Opus, solo lectura) que revisa el `git diff HEAD` de cada step antes de commitear: scope creep vs spec, reglas de dominio (TNA, mutuo/pagaré, prisma), errores de lógica que tsc/tests no agarran. Insertado entre Verifier/QA y commitStep, mismo tope de 3 reintentos compartido, sin gate humano salvo rechazo persistente | done 2026-06-26 (Claude Code) | cc |
| S-002 | ✅ | **Gating por OPERATOR_STATE** — `operator-state.ts` centraliza lectura de `OPERATOR_STATE.yaml` (fail-safe a PRODUCT). Telegram (`notifyGate`/`notifyDeployed`/`notifyReleaseFailed`) muteado en SLEEP, acortado en OFFICE+short, sin cambios en PRODUCT. El gate humano sigue bloqueando igual en SLEEP, solo no avisa. Base de S-004 | done 2026-06-26 (Claude Code) | cc |
| S-003 | 3 | Fase 3: Multi-target routing (spensiv vs argos por feature) | pending | cc |
| S-007b | ✅ | **Toggle remoto de OPERATOR_STATE** — selector PRODUCT/OFFICE/SLEEP en el dashboard (3 chips arriba del header), `sync.ts` pullea `orch_operator_state` cada 5s y reescribe `OPERATOR_STATE.yaml` local si cambió (dedup por `updated_at`, preserva comentarios de cabecera). Tabla nueva con RLS anon select+update solo en id=1, sin insert/delete. Fast-follow de S-007/S-002 | done 2026-06-26 (Claude Code) | cc |
| S-004 | ✅ | **Loops nocturnos** — `autopilot.ts`, llamado desde `sync.ts` cada tick: en modo SLEEP y con el loop libre, toma la primera item `pending`/P2+/sin keywords de riesgo (dinero/prod/legal/migración) del backlog por orden de prioridad, fuerza el spec vía Architect (target tomado de la sección, no por keyword-detection), spawnea `npm start <featureId>` fire-and-forget. Marca la fila `armado (autopilot)` al elegir y `done (autopilot)` al deployar; si falla el release no se reintenta solo. Cap 5/día, lock con timeout 10min, ADR-log de la decisión. Gates duros (S-002) siguen pausando igual en silencio | done 2026-06-27 (Claude Code) | cc |
| S-005 | 5 | Fase 5: Product Analyst (backlog desde métricas de uso real) | pending | cc |
| S-006 | ✅ | Celu Fase 1: bot de Telegram (AlantORCH) — notifica gates y permite aprobar/idear desde el celu. `telegram.ts`+`bot.ts`+hook en gates+`npm run bot`, sin deps (fetch nativo). Probado- responde y guarda ideas | done 2026-06-25 | cc |
| S-007 | ✅ | **Dashboard web mobile-first** (control plane Supabase) — v1 entregado como HTML estático single-file (`dashboard/index.html`), NO Next.js (decisión real, ver RUNBOOK): tabs Loop/Backlog/Ideas, polling 5s, deploy Vercel auto. Fase A (sync) + Fase B (la web) completas. Fast-follow: agent presence (S-015), realtime, diagramas (S-016) | done 2026-06-26 | cc |
| S-008 | ✅ | **Intake + Architect agent** — split en 2: (a) **Intake barato** (heurística, sin LLM): detecta target, busca ADR/features/backlog relacionados (grep), clasifica bug/feature/arquitectura, resume contexto; (b) **Architect (Opus on-demand)** solo cuando la idea necesita arquitectura → escribe el `features/F-XXXX.md`. CLI `npm run intake`. ADR-0028/0029 | done 2026-06-26 (Claude Code) | cc |
| S-016 | 3 | **Diagramas de flujo de trabajo** — guía visual de qué hacer en cada caso (gate falla, deploy, etc.); candidata a pestaña en el dashboard mobile (S-007). Idea de Augusto | pending | cc |
| S-017 | ✅ | Fix ADR auto-log: inserta los ADR nuevos DENTRO del fence del template (rompe el markdown). Anclar la inserción después del bloque de template, no tras el header | done 2026-06-26 (Claude Code) | cc |
| S-018 | ✅ | Auto-deploy en verde + sin gates por-step + avisos deploy/fallo por Telegram (ADR-0019) | done 2026-06-25 | cc |
| S-019 | ✅ | **Hardening del loop** (review OpenCode): `getNextPendingStep` saltea steps `blocked`; `pushMain` verifica estar en main; dedup `appendProgress` al resumir; remover `awaitingPushApproval` (muerto); centralizar strings de modelo en config (sirve para S-014) | done 2026-06-26 (Claude Code) | cc |
| S-020 | ✅ | **Builder ve restricciones del spec** — pasar "Fuera de alcance" + "Restricciones clave" del F-XXXX.md al prompt del executor (hoy solo ve `step.desc`). Afecta calidad/cumplimiento de reglas de dominio | done 2026-06-26 (Claude Code) | cc |
| S-021 | ✅ | **Tests del core** — `state.ts`, `index.ts` (loop), `gates.ts`. Hoy solo existe `adr.test.ts`; el sistema que deploya a prod es el menos testeado | done 2026-06-26 (Claude Code) | cc |
| S-022 | ✅ | **Dashboard → vista Operaciones** (rediseño de IA: roster honesto de etapas reales, hero "quién tiene la posta", feed de deltas no-logs; preserva ideas/mode/backlog). Fast-follow de S-007/S-015 | done 2026-06-27 (Claude Code) | cc |
| S-025 | ✅ | **Rotación/retención de logs** — `log-cleanup.ts`: disco 30d (`logs/*.log`, `loop-*.log`, `blocked.log`; preserva `orchestrator.log` + run activo), Supabase 7d (`orch_logs` DELETE por `ts`), throttle 1h desde `sync.ts`. ADR-0036 | done 2026-06-28 (Claude Code) | cc |
| S-024 | 3 | **Evaluador de posts de X** — pegás un post guardado y el Architect lo juzga contra tu arquitectura real (lee `system/`): ¿ya implementado? / ¿vale la pena + beneficio concreto? / ¿es bait y por qué? Versión free = un prompt/skill; conecta con S-008 | pending | cc |
| S-023 | 4 | **Closed learning loop** (idea de Hermes) — cuando el loop resuelve un patrón recurrente, auto-generar un spec/template reutilizable para no re-razonar. Evolución del ADR/specs, en NUESTRO sistema (no adoptar Hermes como motor) | pending | cc |
| S-014 | 2 | **Routing multi-modelo** — Builder barato (DeepSeek V4 vía Claude Code Router) con Opus de Planner; el Verifier cubre el riesgo. Pilot en 1 feature, medir reintentos. Eval en `system/MODEL-ROUTING.md` | pending | cc |
| S-015 | ✅ | **Agent team view** — presencia real con heartbeat: tabla `orch_presence` (planner+builder), sync.ts emite cada 5s, staleness >30s→"sin señal" />2min→"posible cuelgue". Dashboard usa presencia como fuente de verdad del roster; `derivePosta` como fallback. Muestra modelo por rol (Opus/Sonnet) | done 2026-06-27 (Claude Code) | cc |
| S-013 | ✅ | Guard anti-reejecución (avisa "ya finalizó" + `--force` antes de gastar tokens) + reintento del aviso de gate por Telegram | done 2026-06-25 | cc |
| S-009 | ✅ | **ADR auto-log** — el loop escribe en DECISIONS.md cada decisión de diseño con su Origen. Helper `appendAdr()` + `parseAdrBlocks` + prompt del executor + idempotencia. 13 tests verdes | done 2026-06-25 (Claude Code) | cc |
| S-010 | 1 | **Migrar Kredy prod: Supabase → Neon** — unificar todo lo Prisma en Neon (prod + dev). Runbook en `system/MIGRATION-kredy-to-neon.md`. Toca dinero real → ejecuta Augusto con OK explícito | waiting | manual |
| S-026 | ✅ | **Reconciliación del backlog** — auditoría de estados reales cruzando BACKLOG/PROGRESS/prompts/git; corrección de S-009 en CONVENTIONS.md (era "spec, no implementado", está implementado); nota de mapeo S-022(old)→S-025; regla append-only de IDs (CONVENTIONS §3); huecos S-011/S-012 documentados | done 2026-06-27 (Claude Code) | cc |
| S-027 | ✅ | **Hardening heartbeat del loop + lock por liveness** — `LOOP_HEARTBEAT.json` desde `index.ts`; `orch_presence` con rol `loop`; `acquireLock` respeta lock si heartbeat fresco (nunca pisa un proceso vivo); `markBacklogState` retorna bool; dashboard usa heartbeat del loop para Builder | done 2026-06-27 (Claude Code) | cc |
| S-028 | ✅ | **Fix: aprobación remota desde Telegram no desbloqueaba el loop** — `pollApprovalOnce()` exportado de `telegram.ts`, embebido en el gate-wait de `runLoop` (~8s latencia máx). `npm run bot` ya no es requisito para que el botón ✅ funcione. ADR-0034 | done 2026-06-28 (Claude Code) | cc |
| S-029 | ✅ | **Fix: 409 Conflict Telegram al correr bot + loop simultáneamente** — `bot-heartbeat.ts`; bot escribe `BOT_HEARTBEAT.json` en cada ciclo; loop chequea `isBotAlive()` antes de `pollApprovalOnce()`: si bot vivo → solo pollea STATE.json, si bot caído → fallback automático en ≤30s. ADR-0035 | done 2026-06-28 (Claude Code) | cc |
| S-030 | ✅ | **Clasificación de ejecutor del backlog (auto/cc/manual) + autopilot por allowlist** — campo `Ejecutor` en BACKLOG.md (fuente de verdad), espejado a `orch_backlog`; autopilot cambia a allowlist primaria (`Ejecutor=auto`), keywords de riesgo como red de seguridad secundaria. ADR-0037 | done 2026-06-28 (Claude Code) | cc |
| S-031 | ✅ | **Fix max-turns en Architect/Planner/Reviewer + visibilidad de errores** — `MAX_TURNS=15` centralizado en `models.ts`; los tres agentes usan `--max-turns 15` en lugar del literal `1` que cortaba el loop cuando claude emitía `tool_use` en turno 1. Error de visibilidad: stdout incluido en el `throw` de los tres. Planner refactorizado con `PlannerOpts.callClaude?` injectable (patrón de Architect/Reviewer). ADR-0038 | done 2026-06-29 (Claude Code) | cc |

## Kredy [kredy]  (préstamos/crédito — ex "Spensiv", renombrado 2026-06-20)

| ID | P | Descripción | Estado | Ejecutor |
|----|---|-------------|--------|----------|
| SP-001 | 1 | Sprint S-D: Búsqueda unificada por CUIL/DNI en consola (depende migración S-A/B/C aprobada) | blocked | manual |
| SP-002 | 1 | Sprint S-E: Límite de originación por CUIL en frontend | blocked | manual |
| SP-003 | 2 | Migración SA identity backbone — espera OK de Augusto | waiting | manual |
| SP-004 | 2 | Migración AP Commission V2 — espera OK de Augusto | waiting | manual |
| SP-005 | 3 | Refinanciación Fase 2: UI de propuesta de refinanciación | pending | manual |
| SP-006 | 3 | Refinanciación Fase 3: router refinanceLoan + Prisma RefinancingRequest | pending | manual |
| SP-007 | 4 | Refinanciación Fase 4: webhook Stripe / flujo de pago | pending | manual |
| SP-008 | ✅ | AP Score como gate en pre-aprobación | done 2026-06-20 (F-0002, mergeado a main) | cc |
| SP-009 | ✅ | **Gate de límite por vínculo** (conocido 500k / referido 200k+aval / desconocido 0) en preApprove. F-0005 | done 2026-06-25 (deployado) | cc |
| SP-010 | ✅ | **Mutuo + pagaré generados** — pagaré pre-llenado por el total (sin protesto), cláusula TERCERA fija 8% mensual, SEXTA con intimación previa 5 días, selector CABA/Mar del Plata, gate de datos del Person. F-0006, revisión legal cerrada 2026-06-26 | done 2026-06-26 | cc |
| SP-011 | ✅ | **Documentos pendientes del préstamo** — fotos de mutuo firmado + pagaré vía LoanAttachment, badge "pendiente" NO bloqueante. F-0007 | done 2026-06-25 (deployado) | cc |
| SP-012 | 3 | UI para que el AP elija/edite el tier de vínculo y el referente (follow-up de SP-009) | pending | manual |

## Spensiv (tracker finanzas personales) [spensiv]

| ID | P | Descripción | Estado | Ejecutor |
|----|---|-------------|--------|----------|
| SPT-001 | 3 | Seed data de prueba en el Neon dev `spensiv-dev` (hoy schema vacío, sin datos) | pending | cc |

## Argos [argos]

| ID | P | Descripción | Estado | Ejecutor |
|----|---|-------------|--------|----------|
| AR-001 | ✅ | Path (`portfolio-tracker`) + stack + cmds de Argos en targets.json | done 2026-06-20 | cc |
| AR-002 | ✅ | DB dev de Argos: NO aplica — `dbModel: none` (Supabase-client, build/test no tocan DB). Guard exime targets no-Prisma | done 2026-06-20 | cc |
| AR-003 | 4 | Polish: prompt del executor condicional por `dbModel` (sacar frases Prisma-céntricas para targets Supabase) | pending | cc |
| AR-004 | 4 | Si en algún momento hace falta QA visual con datos: crear Supabase branch dev de Argos | pending | cc |
| AR-005 | 2 | **Costo de arancel en TNA (informativo, solo lectura)** — calcular el arancel efectivo de las cauciones, anualizarlo a TNA (vía `annualizeNominalTNA`) y mostrarlo en una vista para comparar contra la TNA de arancel pactada (~1,5) y detectar si la ALyC cobra de más. ESTRICTAMENTE solo lectura: NO modificar `calcularSpreadPorCaucion`, ni la anualización canónica, ni el P&L, ni el spread — solo un cálculo nuevo + vista informativa. Diagnóstico primero: dónde viven los cargos de las cauciones y qué campos traen. Archivos probables: `features/financing/`. (= ARCH-002 de PENDIENTES.md de Argos) | failed (autopilot) 2026-06-29T15:02:42.373Z | auto |
