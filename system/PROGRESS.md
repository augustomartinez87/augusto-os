# Progress — augusto-os

Log append-only de features y milestones completados.

---

## 2026-06-27 — S-027: Hardening heartbeat del loop + lock por liveness

**Commit:** (ver SHA en git log)

**Qué se hizo:**
- **Tarea 1 — Heartbeat del loop real:** `orchestrator/src/loop-heartbeat.ts` nuevo módulo. `index.ts` emite `LOOP_HEARTBEAT.json` al inicio de cada fase (planning, building:step-N, verifying, merging, deploying). `sync.ts` lee ese archivo y lo empuja como rol `loop` a `orch_presence` con el `last_heartbeat` real de `index.ts` (no de sync.ts). Dashboard usa ese heartbeat para la staleness del slot Builder (con fallback al de sync.ts si no existe).
- **Tarea 2 — Lock por liveness:** `acquireLock` ahora chequea `LOOP_HEARTBEAT.json` antes de decidir si el lock es stale. Si el heartbeat del loop está fresco (< 3 min), el lock NO se pisa aunque tenga >10 min de edad. Si el heartbeat está frío o no existe, cae al timeout habitual con log explícito (pid dueño, antigüedad del heartbeat). Lock file ahora incluye `featureId` para correlación. `updateLockFeatureId()` rellena ese campo luego de que el Architect devuelve el ID.
- **Tarea 3 — Fix markBacklogState:** `markBacklogState` retorna `boolean` (true si encontró y modificó la fila, false con warning si el ID no existe). `tryAutopilotPick` asigna `marked = markBacklogState(...)` — solo intenta revertir si la fila fue realmente marcada.
- **Tests:** 6 tests nuevos (liveness-aware lock, markBacklogState bool, double-spawn prevention). 216/216 verdes.
- **ADR-0033** registra la decisión; supersede la limitación de ADR-0032 sobre liveness del loop.

**Notas:** `⚠ dashboard/index.html` modificado — el push a main dispara Vercel. El cambio es retrocompatible (si no hay fila `loop`, usa el heartbeat de `builder` como antes). El `LOOP_HEARTBEAT.json` se genera solo cuando `index.ts` está corriendo; en reposo el dashboard cae al comportamiento de S-015.

---

## 2026-06-27 — S-015: Presencia real con heartbeat (agent team view)

**Commit:** `3eccc34`

**Qué se hizo:**
- Tabla `orch_presence` en Supabase (RLS anon-read, service_role escribe). Migrar con el SQL de `dashboard/schema.sql`.
- `sync.ts`: `pushPresence()` emite upsert cada 5s con state derivado (idle/planning/building/verifying/deploying/blocked) + model short-name (Opus/Sonnet).
- Dashboard: roster lee `orch_presence` como fuente de verdad. Liveness: >30s→"sin señal", >2min+run activo→"posible cuelgue". Verifier/Deploy se iluminan cuando el builder pasa a verifying/deploying. `derivePosta` queda como fallback si la tabla está vacía (runner pre-S-015).
- ADR-0032: umbrales de staleness documentados (supuesto del agente, auditable).

**Notas:** El runner (sync.ts) necesita reiniciarse para empezar a emitir heartbeats. La tabla `orch_presence` debe crearse en Supabase antes del primer tick (ver SQL en schema.sql al final del archivo).

---

## 2026-06-18 — F-0001: AP score badge en consola [spensiv]

**Feature:** Badge visual que muestra el score del AP (verde ≥70 / amarillo 40-69 / rojo <40 / neutral null) en la cabecera del perfil del AP en `/ap`.

**Pasos completados:**
1. `ap.getScore` query en tRPC router AP → commit `09f86f0`
2. `ApScoreSnapshot` + `computeApScore()` en score service → commit `f0bbd09`
3. `<ApScoreBadge>` componente React con tiers → commit `41f930a`
4. Integración en página `/ap`, consumiendo `ap.getScore` → commit `b00cade`

**Verifier:** typecheck ✅ · lint ✅ · tests ✅ · QA: omitido (sin server)

**Notas:** Primera feature completada por el orquestador autónomo end-to-end. Confirmó que `--strict-mcp-config` bloquea MCP, hook guardrail intacto bajo `--dangerously-skip-permissions`, QA graceful sin server.

---

## 2026-06-18 — Fase 1: augusto-os repo + memoria del sistema [sistema]

**Milestone:** Repo `augusto-os/` creado con estructura `system/`, `orchestrator/`, `targets/`. Orquestador migrado desde `spensiv/orchestrator/`. REPO_ROOT dinámico via `targets.ts`. Loop conectado a OPERATOR_STATE.yaml + ROADMAP.md + BACKLOG.md + PROGRESS.md.

*(Este log se actualiza al completar la fase.)*

## 2026-06-20 — F-0002 completado

## Feature F-0002

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En server/services/ap-score.service.ts, extender el tipo ScoreConfig agregando el campo `minApScore: number` y añadirlo a DEFAULT_CONFIG con valor 40 (alineado con el rojo del badge). Asegurar que loadScoreConfig preserve/parseé el campo desde el JSON persistido y aplique el default 40 cuando falte, sin migración de schema. Typecheck y lint. (f4395d2f)
- [x] Step 2: En server/routers/ap.ts, dentro de preApprove (~línea 340), cargar la config de score (loadScoreConfig) y obtener el score del AP con getLatestApScore(db, agentId). Guardar el umbral (config.minApScore) y el score en variables para el gate del siguiente paso, sin alterar todavía el flujo de decisión. Typecheck y lint. (f731faaf)
- [x] Step 3: En preApprove, agregar el gate de score análogo a checkDebtorLimit: si score != null && score < minApScore, respetar enforcementMode — 'hard' rechaza la pre-aprobación con un error claro (sin exponer TNA ni tasas en el mensaje), 'soft' marca requiresManualReview = true. Si getLatestApScore devuelve null, no bloquear ni penalizar (AP nuevo); documentar este comportamiento con un comentario inline. Typecheck y lint. (bebb4304)
- [x] Step 4: Agregar un test del gate (junto a los tests existentes de ap/preApprove) cubriendo: score bajo + hard → bloquea con error; score bajo + soft → requiresManualReview = true; score null → pasa sin bloquear; score por encima del umbral → pasa. Mockear getLatestApScore y la config según corresponda. Tests, typecheck y lint pasan. (d8636768)

### QA
Screenshots en `orchestrator/qa-artifacts/F-0002/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-06-20 — Rename Kredy/Spensiv: config del orquestador + specs de branding

Aplicado en augusto-os (no destructivo): targets.json (key spensiv→kredy, nuevo target spensiv=tracker),
.env (KREDY_DEV_DATABASE_URL + placeholder tracker), prod-db-hosts (ep-floral-mud), executor/planner
target-aware, frontmatter F-0001/F-0002→kredy. Specs F-0003 (rebrand Kredy) y F-0004 (confirmar Spensiv
tracker) listos para el loop. Decisión Vercel: renombrar + reenviar links. Ver DECISIONS.md y HANDOFF-RENAME.md.

## 2026-06-20 — F-0002 completado

## Feature F-0002

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En server/services/ap-score.service.ts, extender el tipo ScoreConfig agregando el campo `minApScore: number` y añadirlo a DEFAULT_CONFIG con valor 40 (alineado con el rojo del badge). Asegurar que loadScoreConfig preserve/parseé el campo desde el JSON persistido y aplique el default 40 cuando falte, sin migración de schema. Typecheck y lint. (f4395d2f)
- [x] Step 2: En server/routers/ap.ts, dentro de preApprove (~línea 340), cargar la config de score (loadScoreConfig) y obtener el score del AP con getLatestApScore(db, agentId). Guardar el umbral (config.minApScore) y el score en variables para el gate del siguiente paso, sin alterar todavía el flujo de decisión. Typecheck y lint. (f731faaf)
- [x] Step 3: En preApprove, agregar el gate de score análogo a checkDebtorLimit: si score != null && score < minApScore, respetar enforcementMode — 'hard' rechaza la pre-aprobación con un error claro (sin exponer TNA ni tasas en el mensaje), 'soft' marca requiresManualReview = true. Si getLatestApScore devuelve null, no bloquear ni penalizar (AP nuevo); documentar este comportamiento con un comentario inline. Typecheck y lint. (bebb4304)
- [x] Step 4: Agregar un test del gate (junto a los tests existentes de ap/preApprove) cubriendo: score bajo + hard → bloquea con error; score bajo + soft → requiresManualReview = true; score null → pasa sin bloquear; score por encima del umbral → pasa. Mockear getLatestApScore y la config según corresponda. Tests, typecheck y lint pasan. (d8636768)

### QA
Screenshots en `orchestrator/qa-artifacts/F-0002/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-06-20 — F-0003 completado

## Feature F-0003

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En app/layout.tsx, reescribir el bloque metadata/viewport: title y openGraph.title con copy de Kredy (préstamos/crédito/cuotas) sin 'cashflow'/'tarjetas'/'gastos', openGraph.siteName='Kredy', description sobre préstamos/crédito/cuotas, y metadataBase=new URL('https://kredy.vercel.app'). No tocar themeColor. (e1b78719)
- [x] Step 2: Reemplazar strings user-facing 'Spensiv'/'cashflow'/'tu motor de cashflow'/'tarjetas'/'gastos' por copy de Kredy (préstamos) en las vistas AP: app/ap/page.tsx (verificar que el header AP no diga 'Spensiv'; AP_APP_NAME='Portal AP' queda igual) y app/dashboard/ap/page.tsx. Solo strings de UI, sin tocar lógica. (4211cec9)
- [x] Step 3: Reemplazar strings user-facing 'Spensiv'/'cashflow' por copy de Kredy en las vistas de prestatario: app/share/[personId]/page.tsx, app/dashboard/simulator/page.tsx, y rutas app/simular y app/l. Asegurar que el nombre visible sea Kredy y NO introducir TNA/tasa/TEA en ninguna vista de prestatario. (199a732c)
- [x] Step 4: Reemplazar referencias de marca vieja 'Spensiv'/'cashflow' en strings no-UI: app/api/cron/ap-reconcile/route.ts (mensajes/logs/copy). Solo strings, sin tocar lógica. (199a732c)
- [x] Step 5: Detectar y actualizar favicon/manifest/app icon con marca vieja si existen (app/icon.*, app/favicon.ico, app/manifest.ts): cambiar name/short_name/referencias 'Spensiv' a 'Kredy'. Si no existen archivos con marca vieja, no hacer cambios. (199a732c)
- [x] Step 6: Hacer grep final en app/ por 'Spensiv', 'cashflow', 'tu motor de', 'tarjetas', 'gastos' para confirmar que no quedan strings user-facing de la marca vieja, y correr typecheck + lint hasta que pasen sin errores. (199a732c)

### QA
Screenshots en `orchestrator/qa-artifacts/F-0003/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-06-20 — F-0003 completado

## Feature F-0003

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Reescribir el bloque metadata/viewport de app/layout.tsx: title y openGraph.title con copy de Kredy (préstamos/crédito/cuotas) sin 'cashflow'/'tarjetas'/'gastos'; openGraph.siteName = 'Kredy'; description sobre préstamos/crédito/cuotas; metadataBase = new URL('https://kredy-ap.vercel.app'). No tocar themeColor ni lógica. (e95806ce)
- [x] Step 2: Grep en app/ por 'Spensiv', 'cashflow', 'tu motor de', 'tarjetas', 'gastos' para inventariar todas las ocurrencias user-facing y de metadata; producir la lista de archivos/líneas a modificar sin editar todavía. (e95806ce)
- [x] Step 3: Reemplazar los strings user-facing 'Spensiv'/'cashflow' por copy de Kredy en app/ap/page.tsx, verificando que el header del Portal AP muestre Kredy y que AP_APP_NAME ('Portal AP') quede intacto. Solo strings, no lógica. (02d3117b)
- [x] Step 4: Reemplazar los strings user-facing 'Spensiv'/'cashflow' por copy de Kredy en app/dashboard/ap/page.tsx. Solo strings de UI. (9942a285)
- [x] Step 5: Reemplazar los strings user-facing 'Spensiv'/'cashflow' por copy de Kredy en vistas de prestatario: app/share/[personId]/page.tsx, app/simular (y/o app/l) según existan. Verificar que NO se introduzca TNA/tasa/TEA en ninguna vista de prestatario. (3e2b97eb)
- [x] Step 6: Reemplazar los strings 'Spensiv'/'cashflow' por copy de Kredy en app/dashboard/simulator/page.tsx (vista del simulador). Solo strings de UI, sin exponer TNA/tasa. (3a7e86ab)
- [x] Step 7: Reemplazar referencias 'Spensiv'/'cashflow' en strings no visuales de app/api/cron/ap-reconcile/route.ts (logs/mensajes) por lenguaje de Kredy. Solo strings, no lógica. (eab67ab6)
- [x] Step 8: Detectar app/icon.*, app/favicon.ico y app/manifest.ts; si existen y referencian 'Spensiv', actualizar name/short_name/description a Kredy. Si no existen o no tienen marca vieja, no-op documentado. (eab67ab6)
- [x] Step 9: Ejecutar typecheck y lint del proyecto y corregir cualquier error introducido por los reemplazos de copy. (eab67ab6)

### QA
Screenshots en `orchestrator/qa-artifacts/F-0003/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-06-21 — F-0004 completado

## Feature F-0004

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En app/layout.tsx confirmar/ajustar metadata: title con 'Spensiv', openGraph.siteName: 'Spensiv', y metadataBase: new URL('https://spensiv-tracker.vercel.app'). Mantener description/branding de cashflow. (51a00920)
- [x] Step 2: Grep en todo el repo por términos heredados de Kredy/AP ('préstamo', 'crédito', 'Portal AP', 'Kredy', 'AP_APP_NAME', '/l/') para inventariar coincidencias y clasificar cuáles no aplican al tracker. (51a00920)
- [x] Step 3: Remover/reemplazar las referencias cruzadas a préstamos/crédito/Portal AP/Kredy encontradas en copy, constantes y strings de configuración no-UI, dejando solo el branding de cashflow del tracker. (c77ce2de)
- [x] Step 4: Asegurar que el nombre visible 'Spensiv' aparezca correctamente en el header/navbar y demás componentes de UI, ajustando cualquier label residual. (c77ce2de)
- [x] Step 5: Correr typecheck (tsc/next typecheck) y lint, y corregir cualquier error resultante de los cambios. (c77ce2de)

### QA
Screenshots en `orchestrator/qa-artifacts/F-0004/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-06-25 — F-0005 completado

## Feature F-0005

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear el servicio de límites por vínculo en server (p.ej. server/services/relationshipLimit.ts) con DEFAULT_RELATIONSHIP_LIMITS (conocido y amigo → 500000, amigo_de_amigo → 200000, desconocido → 0) y un loadRelationshipLimits() que parsea overrides persistidos del JSON de RiskConfig si existen y cae al default por tier cuando falten, replicando el patrón loadScoreConfig/minApScore de F-0002, sin migración. Typecheck y lint. (161dc5ff)
- [x] Step 2: Implementar checkRelationshipLimit({ relationship, referrer, capital, enforcementMode }) en el mismo servicio, que devuelva { blocked, requiresManualReview, reason? }. Tratar relationship ausente/'desconocido' como límite 0; en hard marcar blocked=true sobre el límite, en soft marcar requiresManualReview=true; el reason NUNCA expone TNA/tasa. Typecheck y lint. (7a16a72a)
- [x] Step 3: Agregar la regla del referido dentro de checkRelationshipLimit: si relationship === 'amigo_de_amigo' y referrer está vacío/null, forzar requiresManualReview = true (no se permite referido sin referente registrado). Typecheck y lint. (0018458f)
- [x] Step 4: En preApprove (server/routers/ap.ts, ~línea 340, junto a checkDebtorLimit y el gate de score de F-0002), cargar la Person vinculada si existe, obtener relationship/referrer y aplicar checkRelationshipLimit con el enforcementMode de RiskConfig: hard rechaza la pre-aprobación con error claro sin tasa, soft setea requiresManualReview=true. Documentar con comentario la degradación segura cuando no hay Person vinculada (cae al tier por defecto sin romper). Typecheck y lint. (23b86b0e)
- [x] Step 5: Agregar tests del gate junto a los de preApprove, mockeando la config de límites y la Person: monto bajo el límite pasa; sobre el límite hard bloquea y soft flaggea; desconocido/sin vínculo bloquea (hard) o flaggea (soft); referido sin referrer flaggea; referido con referrer y monto OK pasa; verificar que ningún mensaje expone tasa. Tests, typecheck y lint pasan. (9080ea7e)

### Decisiones (ADR)
- ADR-0014 — JSON de overrides como campo futuro en RiskConfig, no en tabla dedicada [Supuesto del agente] **⚠ REVISAR**
- ADR-0015 — checkRelationshipLimit es síncrona y acepta limits precargados [Supuesto del agente] **⚠ REVISAR**
- ADR-0016 — La regla del referido no override blocked=true en hard mode [Supuesto del agente] **⚠ REVISAR**
- ADR-0017 — Carga de RiskConfig dentro del gate de vínculo vs. reutilización del check de deudor [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0005/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-06-25 — F-0005 completado

## Feature F-0005

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear el servicio de límites por vínculo en server (p.ej. server/services/relationshipLimits.ts) con DEFAULT_RELATIONSHIP_LIMITS (conocido y amigo → 500000, amigo_de_amigo → 200000, desconocido → 0) y loadRelationshipLimits() que aplique overrides persistidos del JSON de config si existen y caiga al default cuando falten, sin migración, replicando el patrón loadScoreConfig/minApScore de F-0002. Typecheck y lint. (9080ea7e)
- [x] Step 2: Implementar checkRelationshipLimit({ relationship, referrer, capital, enforcementMode }) en el mismo servicio, que devuelva { blocked: boolean, requiresManualReview: boolean, reason?: string }. Trata relationship ausente/no reconocido como 'desconocido' (límite 0): hard → blocked=true, soft → requiresManualReview=true. El reason nunca expone TNA/tasa. Typecheck y lint. (9080ea7e)
- [x] Step 3: Agregar la regla del referido dentro de checkRelationshipLimit: si relationship === 'amigo_de_amigo' y referrer está vacío/null → requiresManualReview = true (no se permite referido sin referente/aval registrado), independientemente de si el monto entra en el límite. Typecheck y lint. (9080ea7e)
- [x] Step 4: En preApprove (server/routers/ap.ts, ~línea 340, junto a checkDebtorLimit y el gate de score de F-0002), cargar la Person vinculada al préstamo si existe, leer su relationship/referrer, y aplicar checkRelationshipLimit con el enforcementMode del RiskConfig: hard rechaza la pre-aprobación con error claro (sin tasa), soft setea requiresManualReview. Documentar con comentario la degradación segura cuando no hay Person vinculada (se usa el tier por defecto sin romper). Typecheck y lint. (9080ea7e)
- [x] Step 5: Agregar tests del gate junto a los de preApprove, mockeando la config de límites y la Person: monto bajo el límite pasa; sobre el límite hard bloquea y soft flaggea (requiresManualReview); relationship desconocido bloquea (hard) y flaggea (soft); amigo_de_amigo sin referrer flaggea; amigo_de_amigo con referrer y monto OK pasa. Tests, typecheck y lint pasan. (9080ea7e)

### QA
Screenshots en `orchestrator/qa-artifacts/F-0005/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-06-25 — F-0007 completado

## Feature F-0007

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Agregar un helper puro `getLoanDocumentStatus(attachments: LoanAttachment[])` (en lib/server) que devuelva `{ status: "pendiente" | "completo", missing: ("mutual"|"pagare")[] }`: requiere al menos un attachment type "mutual" y uno "pagare"; si falta alguno status="pendiente" con `missing` listando los faltantes, si están ambos status="completo" y missing=[]. Typecheck y lint. (f8858a78)
- [x] Step 2: Exponer `documentStatus` en la query de detalle del préstamo del router de loans (server/routers), computándolo con el helper a partir de los `LoanAttachment` del préstamo, sin alterar el resto del payload existente. Typecheck y lint. (4ff3b418)
- [x] Step 3: En la vista de detalle del préstamo activo, renderizar un badge/checklist de pendientes cuando `documentStatus.status = "pendiente"` con el texto "Pendiente: subir contrato firmado y pagaré", indicando según `missing` cuál de los dos falta (mutuo firmado y/o pagaré). Si está "completo" no se muestra. Typecheck y lint. (19e1e779)
- [x] Step 4: Conectar la subida de las dos fotos (mutuo firmado y pagaré) en la vista del préstamo reusando el flujo de upload existente de `LoanAttachment` (el mismo de `transfer_receipt`, sin storage nuevo), pasando `type` "mutual" y "pagare" respectivamente y refrescando la query para recomputar `documentStatus`. Typecheck y lint. (1c4c03f2)
- [x] Step 5: Agregar tests del helper `getLoanDocumentStatus`: con 0 attachments → pendiente/missing=[mutual,pagare]; con solo "mutual" → pendiente/missing=[pagare]; con solo "pagare" → pendiente/missing=[mutual]; con ambos → completo/missing=[]. Tests, typecheck y lint pasan. (edb28782)
- [x] Step 6: Agregar un test de integración del router de loans verificando que `documentStatus` se expone correctamente y que subir una foto actualiza el estado de pendiente a completo, y que el `documentStatus` es informativo: no bloquea ni altera el flujo de pre-aprobar/aprobar/activar. Tests, typecheck y lint pasan. (775ac34c)

### Decisiones (ADR)
- ADR-0018 — Banner de pendientes se muestra solo en préstamos activos [Supuesto del agente] **⚠ REVISAR**
- ADR-0020 — Botones inline en el banner vs. navegación a pestaña Documentos [Supuesto del agente] **⚠ REVISAR**
- ADR-0021 — Estrategia de mocking: userCache pre-poblado vs mock de prisma.user [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0007/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-06-26 — F-0006 completado

## Feature F-0006

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `lib/contract-generator.ts`, cláusula SÉPTIMA de `generateContract`: reemplazar `capital`/`capitalLetras` por el TOTAL a devolver (suma de cuotas = `loan.installments.reduce((s,i)=>s+i.amount,0)`) en números y en letras vía `amountToLegalText`/`numberToWords`. Ajustar la redacción para que siga siendo coherente ("librará un pagaré por la suma de [total]..."). Typecheck y lint. (9605455f)
- [x] Step 2: Crear `generatePagare(loan)` en `lib/contract-generator.ts`: documento `.docx` A4 reutilizando helpers (`text/paragraph/clauseTitle`, `amountToLegalText`/`numberToWords`, `MUTUANTE`, `Packer`) y la estructura de `generatePagareGuide` como base. Incluir la palabra "pagaré", cláusula "sin protesto", "Debo/emos y pagaré sin protesto a [MUTUANTE.nombre] o a su orden la cantidad de [TOTAL en letras] ([cur][total])", vencimiento = fecha de la última cuota, lugar de pago = CABA, fecha/lugar de emisión, beneficiario = MUTUANTE. Dejar líneas en blanco SOLO para firma, aclaración y DNI de la mutuaria. No exponer capital ni TNA/tasa. Mantener advertencia de no dejar espacios en blanco. Typecheck y lint. (ac4f3d0d)
- [x] Step 3: Agregar `downloadPagare(loan)` análogo a `downloadPagareGuide` (con `Packer`/`saveAs`) y actualizar el dropdown de `components/loans/generate-contract-button.tsx` para ofrecer "Pagaré" pre-llenado, reemplazando la "Guía de Pagaré" (dejar Contrato / Pagaré / Ambos). Typecheck y lint. (28b64eb2)
- [x] Step 4: En `components/loans/generate-contract-button.tsx`, gate de descarga del CONTRATO: validar que `loan.person` tenga nombre, DNI y CUIL/CUIT; si falta alguno, deshabilitar la opción de Contrato y mostrar el motivo concreto ("Falta CUIL", "Falta DNI", etc.) sin descargar. Agregar un aviso visible cerca del botón/carga indicando que los datos se usan en el contrato y deben coincidir exactamente con el DNI. Typecheck y lint. (47a1757c)
- [x] Step 5: Agregar tests: `generatePagare` incluye "sin protesto", el TOTAL a devolver en números y letras (no el capital), beneficiario = MUTUANTE y no expone TNA/tasa; la cláusula SÉPTIMA del contrato cita exactamente el mismo total; el gate bloquea la descarga del contrato si falta DNI/CUIL. Tests, typecheck y lint pasan. (c0053ba3)
- [x] Step 6: En `lib/contract-generator.ts`, cláusula TERCERA: reemplazar los placeholders `[X%]`/`[X EN LETRAS]` por la tasa fija "OCHO POR CIENTO (8%)" mensual, en letras y en número. NO tocar `lib/loan-calculator.ts` ni la lógica de mora de refinanciación. Typecheck y lint. (6c25d741)
- [x] Step 7: En `lib/contract-generator.ts`, cláusula SEXTA: incorporar la intimación previa de 5 (cinco) días corridos para regularizar antes de poder dar por caídos todos los plazos y exigir el total, manteniendo la redacción de aceleración total una vez vencido ese plazo. Typecheck y lint. (846b6b9c)
- [x] Step 8: Agregar a `generateContract`/`generatePagare` un parámetro de ciudad (no campo de Prisma; en memoria, default CABA) que ajuste cláusula DÉCIMA (jurisdicción), lugar de pago del pagaré y la línea de cierre "Se firman... en la Ciudad de [ciudad]" para CABA vs Mar del Plata. Exponer un selector de ciudad (CABA / Mar del Plata, default CABA) en `components/loans/generate-contract-button.tsx` y pasarlo a las funciones generadoras. Typecheck y lint. (051e9e60)
- [x] Step 9: Agregar tests: TERCERA cita "8%" fijo (sin placeholder); SEXTA incluye los 5 días de intimación; con selector "Mar del Plata" la cláusula DÉCIMA y el lugar de pago del pagaré dicen Mar del Plata y NO CABA; con default (sin elegir) todo sigue diciendo CABA. Tests, typecheck y lint pasan. (c0ef0d8d)

### Decisiones (ADR)
- ADR-0022 — Agregar cláusula "sin protesto" al texto de SÉPTIMA [Supuesto del agente] **⚠ REVISAR**
- ADR-0023 — Fecha de emisión del pagaré = loan.startDate [Supuesto del agente] **⚠ REVISAR**
- ADR-0024 — "Ambos documentos" también bloqueado cuando faltan datos del contrato [Supuesto del agente] **⚠ REVISAR**
- ADR-0025 — Extraer getMissingContractFields a lib/contract-gate.ts para testabilidad [Supuesto del agente] **⚠ REVISAR**
- ADR-0026 — Intimación mediante "notificación fehaciente" sin especificar el canal [Supuesto del agente] **⚠ REVISAR**
- ADR-0027 — El selector de ciudad va encima del botón "Generar contrato", no dentro del dropdown [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0006/`

> Revisar con Claude in Chrome para validación de UX.

---

## 2026-06-27 — S-022: Dashboard → vista Operaciones [sistema]

**Commit:** `e79e7ee`

Rediseño del dashboard (`dashboard/index.html`) de tabs co-iguales a vista Operaciones orientada a supervisión del equipo de agentes.

- Roster honesto: Planner (Opus) + Builder (Sonnet) como agentes LLM; Verifier + Deploy marcados "auto". Researcher no aparece (no existe).
- Hero "quién tiene la posta" via `derivePosta(run, allSteps)`.
- Feed de deltas (pasos done + features): log crudo en panel colapsable.
- Preservado: mode-bar PRODUCT/OFFICE/SLEEP, ideas, backlog, polling 5s.
- ADR-0031 documentado en DECISIONS.md.

---

## 2026-06-27 — S-026: Reconciliación del backlog [sistema]

Auditoría de higiene del backlog. Sin cambios a código del orquestador.

- **Inventario:** cruzadas fuentes BACKLOG/PROGRESS/system/prompts/DECISIONS/git. Todos los S-XXX identificados y su estado real verificado.
- **S-009 corregido en CONVENTIONS.md:** la sección "ADR automático" decía "spec, no implementado" — es incorrecto. `appendAdr()` + `parseAdrBlocks()` están en `orchestrator/src/adr.ts`, llamados desde `executor.ts` e `index.ts` desde 2026-06-25. Texto actualizado a "implementado".
- **Colisión S-022/S-025 resuelta:** S-022 fue reasignado de "rotación de logs" a "Dashboard Operaciones" en commit `e79e7ee`. El BACKLOG ya refleja S-025 = log rotation. Se agrega nota de mapeo `S-022(old)→S-025` en S-025 y en CONVENTIONS §3.
- **Regla append-only documentada:** nueva sección CONVENTIONS §3 — los IDs son inmutables, nunca se reusan ni renumeran, el próximo ítem toma max(IDs)+1.
- **Huecos S-011/S-012:** documentados en CONVENTIONS §3 como huecos históricos (la secuencia saltó S-010→S-013 sin asignarlos).
- **IDs ausentes de cualquier fuente:** ninguno — todos los S-XXX en BACKLOG tienen confirmación de estado real.

## 2026-06-29 — F-0009 completado

## Feature F-0009

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear `src/lib/finance/arancelTNA.ts` con la función pura `arancelTNA({ capital, dias, arancelMonto?, arancelPct? })` que calcule el costo total del arancel (monto fijo + arancelPct × capital) y lo anualice con la convención nominal del motor `costo / (capital × dias) × 365` usando `decimal.js` (`Decimal`), reutilizando el patrón de `caucionTNA` (efectiva_periodo / `annualizeNominalTNA`). Devuelve un decimal (0.05 = 5%) sin compounding/TEA. Bordes: capital 0 o dias ≤ 0 → 0 (nunca NaN/Infinity). Exporta tipos de input. Debe typechequear. (7523f1d7)
- [x] Step 2: Agregar `src/lib/finance/__tests__/arancelTNA.test.ts` (vitest, siguiendo el patrón de `carryCalculations.test.ts`) cubriendo: caso monto fijo, caso porcentaje, caso combinado (monto + pct sumados) y los bordes (capital 0, dias 0), comparando contra valores de TNA calculados a mano. Tests + typecheck pasan. (85ced375)
- [x] Step 3: Definir la tasa/monto de arancel como constante o input client-side en memoria (sin persistir ni escribir contra Supabase) accesible desde la vista de carry/operaciones, e integrar la llamada a `arancelTNA(...)` con el capital y días de cada caución para obtener el costo del arancel en TNA. Typecheck y lint. (c5793e09)
- [x] Step 4: Surfacing en la vista de carry/operaciones: mostrar el valor 'Arancel (TNA)' junto al costo de caución y al spread existentes, formateado como porcentaje es-AR usando los formatters de `src/utils/formatters.ts` (mismo estilo que la TNA de caución), con etiqueta clara. Typecheck y lint. (c5793e09)
- [x] Step 5: Exponer de forma aditiva el arancel en TNA dentro del resultado por caución para poder mostrar un 'spread neto de arancel' (spreadPorcentaje − arancelTNA) como campo nuevo, sin alterar ni reescribir los campos/lógica existentes de `calcularSpreadPorCaucion`/`calcularSpreadsTodasCauciones`. Typecheck, lint y tests. (95fa706a)

### Decisiones (ADR)
- ADR-0039 — arancelPct se interpreta como fracción decimal, no como porcentaje [Supuesto del agente] **⚠ REVISAR**
- ADR-0040 — arancelCostoTNA é informativo — não subtrai do spread [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0009/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-03 — F-0010 completado

## Feature F-0010

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear `prisma/seed-guard.ts` exportando una función pura `assertNotProdDatabaseUrl(url?: string): void` que lance un Error claro si `url` es falsy/vacía o contiene el patrón de prod `ep-floral-mud`, y no haga nada si la URL es válida de dev. Sin I/O ni imports de DB; debe typechequear solo. (5d39ca07)
- [x] Step 2: Crear `prisma/seed-data.ts` con builders puros (sin I/O) tipados contra `@prisma/client`, que devuelvan los objetos a insertar usando los nombres de campo reales del schema: usuario demo (email `demo@spensiv.dev`, clerkId `seed_demo_user`), su `UserPreferences`, ≥3 `Category` cada una con ≥1 `SubCategory`, 2 `CreditCard` con `closingDay`/`dueDay` en rango 1-28 y `holderType`, ≥10 `Transaction` cada una con `id` explícito determinista (p. ej. `seed-tx-01`) y montos como `Decimal` (decimal.js) compatibles con `@db.Decimal(12,2)`` y `categoryId`/`cardId` coherentes, e ≥3 `Income`. Usar `date-fns` para fechas coherentes. Typechea solo. (966b2a91)
- [x] Step 3: Crear `prisma/seed.ts` que (a) llame a `assertNotProdDatabaseUrl(process.env.DATABASE_URL)` antes de tocar nada, (b) dentro de una transacción Prisma inserte los datos de los builders de forma idempotente vía `upsert` con claves deterministas (`User` por email/clerkId, `Category` por `@@unique([userId,name])`, `SubCategory`, `CreditCard`/`Transaction`/`Income` por `id` fijo) —o borrando primero los datos del usuario demo y recreándolos—, (c) loguee un resumen de registros creados y cierre la conexión. Reusar el singleton de `lib/prisma.ts` o instanciar `PrismaClient`. Typechea solo. (e9d9368b)
- [x] Step 4: Actualizar `package.json` agregando el bloque `"prisma": { "seed": "tsx prisma/seed.ts" }`, un script `"db:seed": "prisma db seed"`, y `tsx` como devDependency, sin modificar ni romper los scripts existentes (`dev`, `build`, `db:push`, etc.). Typecheck y lint. (9dee3a81)
- [x] Step 5: Agregar `prisma/__tests__/seed.test.ts` (vitest) que verifique, SIN tocar la DB: (a) el guard rechaza URLs con `ep-floral-mud` y las falsy/vacías, y acepta una URL de dev válida; (b) los builders de `seed-data.ts` producen registros con los campos requeridos por el schema — `Transaction.id` no vacío, `closingDay`/`dueDay` en rango 1-28, montos parseables como `Decimal`, y `name` de `Category` único por usuario. Tests + typecheck. (c044968a)

### QA
Screenshots en `orchestrator/qa-artifacts/F-0010/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-07 — F-0012 completado

## Feature F-0012

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear orchestrator/src/evaluate.ts con readSystemContext(): lee system/ARQUITECTURA-ACTUAL.md y system/BACKLOG.md con existsSync/readFileSync (rutas relativas a REPO_ROOT como en architect.ts), recorta cada archivo a un máximo de chars y devuelve un string; si falta alguno, inserta un marcador [no disponible] en vez de crashear. (4777d030)
- [x] Step 2: En orchestrator/src/evaluate.ts definir buildEvaluatePrompt(postText, systemContext) como función pura calcada de buildArchitectPrompt: arma el prompt de evaluación pidiendo prosa corta (¿ya implementado y dónde? ¿vale la pena y qué beneficio? ¿es bait y por qué?) y la etiqueta de conjunto cerrado devuelta en un campo JSON (etiqueta, resumen). (4c896931)
- [x] Step 3: En orchestrator/src/evaluate.ts definir con zod EvaluateResultSchema { etiqueta: enum['YA-EXISTE','IMPLEMENTAR','BAIT','IGNORAR'], resumen: string } y normalizeLabel() que mapea cualquier valor fuera del set a IGNORAR. (c24493ac)
- [x] Step 4: En orchestrator/src/evaluate.ts definir EvaluateOpts con callClaude inyectable y defaultCallClaude (execa a claude con las mismas flags que architect.ts: --model MODEL_ARCHITECT, --max-turns MAX_TURNS, --output-format json, --dangerously-skip-permissions, --strict-mcp-config, -p prompt), y runEvaluate(postText, opts) que lee contexto, construye el prompt, invoca callClaude, parsea con parseClaudeJson, valida con EvaluateResultSchema aplicando normalizeLabel, y llama recordInvocation({ role: 'evaluator', ... }) dentro de un try/catch que nunca tumba el flujo. (788a77a1)
- [x] Step 5: Crear orchestrator/src/evaluate-cli.ts calcado de intake-cli.ts: toma el texto del post desde process.argv[2] (o stdin si no hay arg), invoca runEvaluate, imprime la etiqueta destacada + resumen, y usa exit code distinto de 0 solo ante error real. (d17e8f1b)
- [x] Step 6: Agregar el script "evaluar": "tsx --env-file=.env src/evaluate-cli.ts" a scripts en orchestrator/package.json. (1058b8a7)
- [x] Step 7: Crear orchestrator/src/evaluate.test.ts con vitest: ejercita runEvaluate con un callClaude mockeado (sin red) para una salida con etiqueta válida y otra con etiqueta inválida, y verifica que runEvaluate siempre devuelve una etiqueta dentro del set cerrado y no realiza llamadas de red. (1058b8a7)

### QA
Screenshots en `orchestrator/qa-artifacts/F-0012/`

> Revisar con Claude in Chrome para validación de UX.

---

## 2026-07-07 — S-010: Migración Kredy prod Supabase→Neon, paso 0 (backup) [sistema/kredy]

**Ejecutor:** Augusto (manual, con guía de Claude en Cowork — el sandbox no tiene red/credenciales a la DB de Kredy).

**Qué se hizo:**
- Backup pre-migración de Kredy prod (Supabase `jymdblurkpadupdqzfzo`) vía `pg_dump` contra el **Session Pooler** (`aws-0-us-west-2.pooler.supabase.com:5432`, no la conexión directa — Supabase fuerza IPv6 para directa y esta máquina no lo tiene).
- Archivo: `kredy/backups/kredy-prod-pre-neon.dump` — formato custom, 167.155 bytes, 227 TOC entries, 27 tablas de `public` (`users`, `persons`, `loans`, `loan_installments`, `loan_payments`, `agent_configs`, `ap_commissions`, `ap_withdrawals`, `pre_approvals`, `opportunities`, `risk_configs`, etc.). Verificado con `pg_restore -l`.
- **Conteos de referencia (origen, para comparar contra Neon en el paso 4 del runbook):** users=4, persons=18, loans=36, loan_installments=192, loan_payments=63, agent_configs=3, ap_commissions=27, ap_withdrawals=0, pre_approvals=1, opportunities=27. Obtenidos vía Supabase MCP (`execute_sql`, solo lectura).

**Notas:** Volumen de datos chico (producto en etapa temprana) — explica el tamaño del dump, no es una dump parcial/rota. Password de Kredy prod quedó expuesta en el chat de la sesión (Augusto decidió no rotarla por ahora). Siguiente paso: crear proyecto Neon `kredy` (prod) — paso 1 del runbook.

---

## 2026-07-08 — S-010: Migración Kredy prod Supabase→Neon, pasos 1-4 (schema + datos) [sistema/kredy]

**Ejecutor:** Augusto (manual, guiado por Claude en Cowork — sin red/credenciales a Neon/Supabase desde el sandbox; acceso de solo lectura a Supabase vía MCP para verificación).

**Qué se hizo:**
- Proyecto Neon `kredy` creado (prod, `AWS US East 1`, Postgres 17), separado de `kredy-dev`.
- **Drift de schema encontrado y corregido:** `ap_commissions` en prod tenía 6 columnas ausentes de `prisma/schema.prisma` (`rateSnapshot` numeric(8,6), `consolidatedAmount` numeric(12,2), `estimatedAt`/`consolidatedAt`/`releasedAt`/`paidAt` timestamp, todas nullable). Se agregaron al schema con comentario de procedencia y se pusheó a Neon antes de restaurar datos, para no dejar el schema del repo desincronizado de la realidad de prod.
- `prisma db push` materializó el schema completo en Neon.
- Datos restaurados vía `pg_restore --data-only` sobre el dump de `kredy-prod-pre-neon.dump`. Complicaciones resueltas en el camino: `--disable-triggers` no funciona en Neon (no hay superusuario) → se dropearon los 39 FK constraints manualmente (`drop-fks.sql`, incluye 1 con nombre distinto al esperado por convención de Prisma — `ap_score_snapshots_agentConfigId_fkey` en vez de `..._agent_config_id_fkey`) + `TRUNCATE` de las 28 tablas para limpiar un intento parcial previo; luego restore limpio; luego `db push` de nuevo para recrear los FKs (que de paso valida integridad referencial de todo lo restaurado — sin errores).
- **Paridad verificada 1:1 contra el origen** (users=4, persons=18, loans=36, loan_installments=192, loan_payments=63, agent_configs=3, ap_commissions=27, ap_withdrawals=0, pre_approvals=1, opportunities=27).

**Notas:** `ap_commissions.loanId` ya no es una relación FK real en el schema actual (quedó como `String @unique` suelto) — drift menor, no bloqueante, documentado por si se retoma esa relación a futuro.

---

## 2026-07-08 — S-010: Migración Kredy prod Supabase→Neon, resync final (28/28 tablas) [sistema/kredy]

**Ejecutor:** Augusto (manual, guiado por Claude en Cowork).

**Qué se hizo:**
- Detectado que prod siguió recibiendo escritura entre el backup inicial y este punto (`loans` 36→37, `loan_payments` 63→65) — normal, es una app en uso real. Se repitió el pipeline completo (dump fresco `kredy-prod-final-sync.dump` → drop de 39 FKs + `TRUNCATE` de las 28 tablas vía `drop-fks.sql` corregido → `pg_restore --data-only` → `prisma db push` para recrear FKs) para capturar el estado más reciente antes de cortar tráfico.
- `drop-fks.sql` corregido de forma permanente: se sacó la línea de `ap_commissions_loanId_fkey` (no existe, no es FK real en el schema actual) y se corrigió el nombre de `ap_score_snapshots_..._fkey` a la convención camelCase que usa Prisma. Corrida limpia: 44 drops sin error, 1 solo error esperado en el restore (`_prisma_migrations`, tabla que no aplica).
- **Paridad verificada 1:1 en las 28 tablas reales** (no solo la muestra de 10 anterior): agent_configs=3, alerts=0, ap_commissions=27, ap_ledger_events=0, ap_links=3, ap_score_configs=1, ap_score_snapshots=6, ap_settlements=0, ap_withdrawals=0, borrower_types=4, consulta_360_cache=55, consultas_360=28, contacts=28, duration_adjustments=12, loan_accruals_monthly=201, loan_activity_logs=15, loan_attachments=0, loan_installments=192, loan_payments=65, loan_real_cashflows=148, loans=37, opportunities=27, opportunity_events=57, persons=18, pre_approvals=1, public_simulator_configs=1, risk_configs=0, users=4.

**Notas:** Migración de datos/schema **cerrada por completo**. Siguiente paso: **paso 5 del runbook — cortar tráfico** (cambiar `DATABASE_URL`/`DIRECT_URL` en Vercel `kredy-ap` de Supabase a Neon + redeploy). Confirmado con Augusto que se avanza ahora.

## 2026-07-08 — S-010: Migración Kredy prod Supabase→Neon, corte de tráfico (pasos 5-7) [sistema/kredy]

**Ejecutor:** Claude en Cowork (Chrome MCP sobre Vercel dashboard, con confirmación explícita de Augusto antes de escribir la env var y antes del redeploy).

**Qué se hizo:**
- Backup del `DATABASE_URL` viejo (Supabase, pooler `aws-0-us-west-2.pooler.supabase.com`) leído y entregado a Augusto en el chat para que lo guarde en su gestor de contraseñas.
- Detectado que `DATABASE_URL` en `kredy-ap` estaba scopeado como **"All Environments"** (no solo Production) — matiz no contemplado en el runbook original. Augusto confirmó pasar Production+Preview+Development a Neon en un solo movimiento (no hay builds de preview dependientes de Supabase en este momento).
- Editado `DATABASE_URL` (All Environments) al pooled de Neon (`ep-patient-art-atxooul0-pooler...`). `DIRECT_URL` no se tocó (confirmado en la sesión anterior que el runtime no lo usa).
- Redeploy de producción disparado desde el mismo dialog de Vercel tras guardar la env var (deployment `dpl_2cFJGPpvkcdqdEJNRrNTBAKyHYrP`, mismo commit `main`/`feebac58`). Build OK, `READY` en ~2 min.
- Smoke test: `/dashboard/loans` carga con datos reales (19 préstamos activos, mora, cobranza), detalle de un préstamo (Fernando, cuotas/capital/TIR) abre correcto, y navegación por `/dashboard/ap`, `/dashboard/risk`, `/dashboard/persons`, etc. — todo 200 en logs de runtime de Vercel, sin errores Prisma/conexión.
- `augusto-os/targets/targets.json`: agregado el host de Neon (con y sin `-pooler`) a `prodDbPatterns` de `kredy`, sin borrar el patrón viejo de Supabase (paso 7 del runbook).

**Estado:** Kredy corre 100% sobre Neon en prod. Supabase sigue existiendo pero ya no recibe tráfico de la app — **no pausar/eliminar todavía** (paso 8 del runbook, recién después de unos días estables). Pendiente: retirar el patrón de Supabase de `targets.json` cuando se llegue a ese paso.

---

## 2026-07-08 — Reconciliación de BACKLOG.md: 4 filas stale de Kredy (SP-001/002/003/004) [sistema/kredy]

**Ejecutor:** Claude en Cowork (retomado desde `HANDOFF-backlog-reconciliation.md`, sesión nueva por pedido de Augusto).

**Qué se hizo:**
- Verificadas contra código real las 4 filas con nomenclatura vieja ("Sprint S-A/B/C/D/E") que estaban `blocked`/`waiting` en la sección Kredy — las 4 ya estaban shippeadas y nunca se marcaron `done`:
  - **SP-001** (búsqueda unificada CUIL/DNI): `app/dashboard/persons/page.tsx` filtra por `p.cuit.includes(search)`; como el DNI son las posiciones 2-9 del CUIL, un DNI suelto matchea por substring sin lógica adicional. Confirmado también que Consulta 360° (candidato inicial del handoff) NO sirve para esto — `consulta-360.ts` exige CUIT/CUIL de 11 dígitos con dígito verificador, rechaza un DNI de 7-8 dígitos.
  - **SP-002** (límite de originación por CUIL en frontend): `lib/risk/debtorLimit.ts` + banners en `components/loans/pre-approved-loan-card.tsx`.
  - **SP-003** (identity backbone): `lib/identity/resolvePerson.ts` (CUIL→DNI→nombre→crear) + campos `dni`/`identityStatus` en `Person`.
  - **SP-004** (AP Commission V2): `docs/migration-ap-commission-v2.sql` aplicada en prod, `server/services/commission.service.ts` (`realizeCommissionsForPayment`); confirmado en vivo porque el cron `/api/cron/ap-reconcile` (activo en prod) usa exactamente esos conceptos y las tablas `ap_withdrawals`/`ap_ledger_events` tienen datos reales en Neon. Sin spec `F-XXXX` formal — se hizo fuera del loop, a mano (commits `5988972`/`9c40c03`, 2026-06-16).
- Fechas confirmadas por git log: SP-002/SP-003 → commit `32f2bc7` (2026-06-11); SP-003 también tiene un commit previo `6ee650a` (2026-06-10); SP-001 → mismo `32f2bc7`.
- Las 4 filas actualizadas en `system/BACKLOG.md` a `done`, con evidencia y manteniendo exactamente 5 columnas (el bug de parseo que motivó esta reconciliación era justamente una fila con una columna de más).
- **Barrido del resto del backlog** (Sistema/Argos) con el mismo criterio: `S-005`, `S-014`, `S-023` (Sistema) y `AR-003`, `AR-004`, `AR-006` (Argos) se verificaron contra código — ninguno tiene evidencia de implementación (`dbModel` no existe en `executor.ts`, distribución de estrategia en Argos sigue en `localStorage` sin persistencia DB, sin rastro de "Product Analyst"/"routing multi-modelo"/"closed learning loop" en `orchestrator/src`). Se dejan como están, no son stale.

**Notas:** `npm test` en `orchestrator/` no se corrió en este sandbox (mismatch de plataforma con `node_modules` — rollup/esbuild compilados para Windows, según el handoff). Falta correrlo en la máquina de Augusto para confirmar que `sync.test.ts` sigue en verde contra el `BACKLOG.md` editado.

---

## 2026-07-08 — Limpieza de backlog viejo de Augusto (notas sueltas Kredy/Argos) [sistema/kredy/argos]

**Ejecutor:** Claude en Cowork.

**Qué se hizo:** Augusto pegó una lista de notas viejas (mezcla de ideas/bugs) para Kredy y Argos, sospechando que varias ya estaban resueltas. Se verificó cada ítem contra el código real antes de tocar `BACKLOG.md`:

**Ya hecho (no se agregó al backlog, solo se le confirmó a Augusto):**
- TNA promedio ponderado prestado → `computeWeightedTNA` (`lib/loan-yield-metrics.ts`) ya surfaceado en `app/dashboard/ap/page.tsx` como `grossTNA`/`netTNA` por moneda.
- "1 link con 3 pestañas" para el AP → `/ap` ya tiene 4 tabs (`originar`/`cartera`/`comision`/`produccion`), con comisión devengada + retirable en `ComisionTab`. Excede el pedido original.

**Nuevas filas agregadas a `BACKLOG.md` (verificadas contra código, no solo por nombre):**
- **Kredy:** SP-015 (nav mobile solo expone 4/10 destinos, sin "más"), SP-016 (plazo personalizado en `/ap` — backend ya soporta 1-360m, falta el input), SP-017 (falta confirmación+redirect tras crear/pre-aprobar préstamo), SP-018 (límite de originación es por-AP hoy, no global por CUIL — requiere decisión de Augusto).
- **Argos:** AR-008 (bug real confirmado: `last_sign_in_at` nunca se escribe desde la app, solo se lee — "usuarios activos" en Admin probablemente sub-cuenta), AR-009 (sparkline en `MobilePositionsList.jsx:271` va junto a `resultPct` acumulado en vez de `dailyPct`, que ya existe en el mismo archivo), AR-010 (parser de cauciones no separa arancel como campo propio, distinto del cálculo informativo de AR-005), AR-011 (conciliación de "lugares" contra el portfolio real de la ALyC — feature nueva), AR-012 (revisión UX/UI mobile por Sonnet, pedido explícito).
- AR-007 enriquecido con el detalle que dio Augusto (alerta prioritaria = rescate/suscripción, UI candidata = campanita, scope solo Alycbur) — no se duplicó como ítem nuevo.

**Descartado (no entra al backlog):**
- Filtro por tipo/estrategia en Argos "no funciona" — Augusto aclaró que le parece bien así (evita quedar muy espaciado). Sin acción.
- "Skill sobre el tema/diseño" para Spensiv y Argos — pedido meta (crear un skill), no un ítem de producto. Queda pendiente de decidir con Augusto, no es backlog de features.
- Recordatorio masivo de cobranza — ya existía como SP-014 pending, no se duplicó.
- Pregunta sobre crecimiento de la DB de FCI (`fci_prices`, 1 fila por fondo/día) — respondida directo, no requiere backlog: con el puñado de fondos que califican (CAFCI 2/3/5), son ~2-4k filas/año: irrelevante para Postgres, no hace falta Opus ni acción.

## 2026-07-09 — F-0013 completado

## Feature F-0013

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Implementar la mutation `compra.create` en src/server/api/routers/compra.ts usando publicProcedure con input Zod (insumoId, cantidad, precioTotal, proveedor opcional, fecha). Dentro de una transacción Prisma ($transaction / interactive): crear el registro de Compra y actualizar el Insumo asociado recalculando costoUnitarioActual = precioTotal / cantidad y sumando cantidad a stockActual. Usar ctx.db. (b1992985)
- [x] Step 2: Implementar la query `compra.list` en src/server/api/routers/compra.ts que devuelva las compras ordenadas por fecha descendente, incluyendo la relación con Insumo (include) para mostrar el nombre del insumo en la UI. (b9bc87cc)
- [x] Step 3: Configurar el cliente tRPC del lado React: crear el helper createTRPCReact (por ej. src/trpc/react.tsx) con superjson como transformer y httpBatchLink apuntando a /api/trpc, y montar el TRPCProvider (junto con QueryClientProvider de TanStack) en src/app/layout.tsx envolviendo a los children. (399f70d8)
- [x] Step 4: Construir el formulario de carga en src/app/compras/page.tsx (Client Component, mobile-first con Tailwind): selección de insumo, cantidad, precio total, proveedor y fecha; usar el hook useMutation de compra.create e invalidar la query de historial al guardar. Usar exclusivamente el lenguaje 'Compras' (nunca 'Egresos' ni jerga contable). (89ab324c)
- [x] Step 5: Agregar en la página de compras la lista/historial de compras cargadas usando el hook useQuery de compra.list, mostrando insumo, cantidad, precio total, proveedor y fecha, ordenadas por fecha descendente. (89ab324c)
- [x] Step 6: Escribir tests unitarios (Vitest) que validen el cálculo de costoUnitarioActual = precioTotal / cantidad y el incremento de stockActual en `cantidad`, extrayendo la lógica de cálculo a una función pura testeable si hace falta. No e2e. (1b5540d8)

### Decisiones (ADR)
- ADR-0045 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0046 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0047 —  [Supuesto del agente ()] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0013/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-11 — F-0014 completado

## Feature F-0014

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En src/server/api/routers/insumo.ts, expandir el procedure `list` para que el select incluya stockActual, stockMinimo y costoUnitarioActual además de id, nombre y unidad. Ordenar por nombre asc. Verificar que src/app/compras/page.tsx siga typecheckeando (agregar campos es backward-compatible). IMPORTANTE: NO toques src/middleware.ts bajo ninguna circunstancia — ya fue rechazado 3 veces por scope creep (cambio de auth global fuera de este step). Si insumo.list necesita protección de auth por exponer costoUnitarioActual, eso se decide en un step de auth aparte, no acá. (316fd3a1)
- [x] Step 2: En src/server/api/routers/insumo.ts, agregar el procedure `updateStockMinimo` como publicProcedure.mutation con input Zod z.object({ id: z.string(), stockMinimo: z.number().min(0) }) que ejecuta ctx.db.insumo.update({ where: { id }, data: { stockMinimo } }) y devuelve el insumo actualizado. Seguir el patrón de validación de compraRouter. (f510b2c2)
- [x] Step 3: Crear src/lib/insumos.ts con la función pura `tieneStockBajo(stockActual: number, stockMinimo: number): boolean` que devuelve true si stockMinimo > 0 && stockActual < stockMinimo (si stockMinimo es 0 no hay alerta). Exportarla para uso en UI y tests. (769a83d4)
- [x] Step 4: Implementar la UI de src/app/insumos/page.tsx: componente client ('use client') que consume trpc.insumo.list.useQuery() y renderiza una lista mobile-first (cards apiladas, no tabla) con nombre, stockActual + unidad, y costoUnitarioActual formateado en pesos. Manejar estados de loading y lista vacía. Sin jerga contable: usar etiquetas como 'Stock actual' y 'Último precio por unidad'. (5c8551b5)
- [x] Step 5: Agregar el badge de alerta en src/app/insumos/page.tsx: usando tieneStockBajo de src/lib/insumos.ts, marcar visualmente los insumos con stock bajo el mínimo (borde/fondo de alerta en la card + badge con texto 'Stock bajo'). Mostrar también el stockMinimo actual de cada insumo. (ab5dd217)
- [x] Step 6: Agregar la edición de stockMinimo en src/app/insumos/page.tsx: por cada insumo, un input numérico + botón que dispara trpc.insumo.updateStockMinimo.useMutation(), con estado de pending deshabilitando el botón, e invalidación con utils.insumo.list.invalidate() en onSuccess para refrescar stock y alertas. (6c953c6c)
- [x] Step 7: Crear src/__tests__/insumos.test.ts con Vitest: tests unitarios de tieneStockBajo (stock sobre el mínimo, bajo el mínimo, igual al mínimo, stockMinimo=0) y test del procedure insumo.updateStockMinimo con mock de Prisma (siguiendo el patrón de src/__tests__/compras.test.ts) verificando que llama a db.insumo.update con los argumentos correctos. (513d2c54)

### Decisiones (ADR)
- ADR-0048 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0049 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0050 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0051 —  [Supuesto del agente ()] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0014/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-11 — f-0015 completado

## Feature f-0015

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear src/lib/lotes.ts con funciones puras: calcularCostoMateriaPrima(recetaItems con costoUnitarioActual) que retorna el costo unitario Σ(cantidadPorUnidad × costoUnitarioActual), calcularCostoLote(costoUnitario, cantidadProducida) que retorna { costoMateriaPrimaTotal, costoMateriaPrimaUnitario }, y verificarStockSuficiente(recetaItems, cantidadProducida) que retorna los insumos con stock insuficiente. Manejar la conversión de unidades gramos↔kg de forma consistente. Sin dependencias de Prisma ni UI. (1d5d3093)
- [x] Step 2: Implementar el procedure lote.create en src/server/api/routers/lote.ts siguiendo el patrón de compraRouter.create: input Zod { productoId, cantidadProducida (int positivo), fecha }, consulta RecetaItems del producto con sus Insumos, valida stock suficiente (lanza TRPCError si no alcanza), y dentro de ctx.db.$transaction descuenta stockActual de cada insumo con { increment: -cantidad } y crea el Lote con costoMateriaPrimaTotal/Unitario calculados usando las funciones de src/lib/lotes.ts. Usar publicProcedure (sin auth). (0d74a47a)
- [x] Step 3: Implementar el procedure lote.list en src/server/api/routers/lote.ts: publicProcedure.query() que devuelve los lotes ordenados por fecha descendente con include del producto relacionado. (449a3109)
- [x] Step 4: Implementar la UI de carga en src/app/produccion/page.tsx: convertir a 'use client', formulario mobile-first (max-w-lg, cards bg-white) con selector de producto, input de cantidadProducida, input de fecha (usar parseLocalDate para evitar bug de timezone), y trpc.lote.create.useMutation con onSuccess que invalida lote.list e insumo.list vía useUtils. Mostrar el aviso de stock insuficiente que devuelve el server antes de guardar. Manejar el estado de costo $0 cuando aún no hay compras cargadas. (21daa13e)
- [x] Step 5: Agregar la sección de historial de lotes en src/app/produccion/page.tsx: usar trpc.lote.list.useQuery para listar los lotes con producto, fecha, cantidadProducida y costoMateriaPrimaTotal/Unitario, con manejo de estado vacío. No usar useEffect+setState para sincronizar; si hace falta remount usar key={...}. (21daa13e)
- [x] Step 6: Crear src/__tests__/lote.test.ts siguiendo el patrón de compras.test.ts con createCallerFactory + buildMockDb: testear el cálculo de costoMateriaPrimaTotal/Unitario, el descuento de stock vía Prisma increment con valores negativos, y el caso de stock insuficiente que rechaza la creación sin tocar la base. (77402632)

### Decisiones (ADR)
- ADR-0052 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0053 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0054 —  [Supuesto del agente ()] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/f-0015/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-11 — f-0016 completado

## Feature f-0016

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Implementar el procedure `venta.create` en src/server/api/routers/venta.ts siguiendo el patrón de compraRouter/loteRouter: mutation con validación Zod v4 (productoId, fecha, cantidadVendida, precioUnitario con default 1500), que calcule ingresoTotal = cantidadVendida × precioUnitario server-side y persista con ctx.db.venta.create. No hardcodear el precio en la lógica. (65fc03f3)
- [x] Step 2: Implementar el procedure `venta.list` en src/server/api/routers/venta.ts como query que retorna las ventas con include del producto y orderBy fecha desc, siguiendo el patrón de lote.list/compra.list. (74129c0f)
- [x] Step 3: Implementar la UI de carga de ventas en src/app/ventas/page.tsx (mobile-first): formulario con useState para cantidadVendida, precioUnitario (prellenado en 1500 y editable) y fecha, usando parseLocalDate para el input type='date', y trpc.venta.create.useMutation con invalidación de venta.list en onSuccess y reseteo del formulario, siguiendo el patrón de compras/page.tsx. (a3ae46f3)
- [x] Step 4: Agregar en src/app/ventas/page.tsx la sección de historial de ventas usando trpc.venta.list.useQuery, mostrando fecha, cantidad, precio unitario e ingresoTotal por venta. (a3ae46f3)
- [x] Step 5: Crear src/__tests__/venta.test.ts siguiendo el patrón de compras.test.ts/lote.test.ts (createCallerFactory + mock de db), validando que venta.create calcula ingresoTotal = cantidadVendida × precioUnitario, respeta el precioUnitario provisto (no hardcodea 1500) y que venta.list retorna las ventas ordenadas. (bfbea563)

### Decisiones (ADR)
- ADR-0055 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0056 —  [Supuesto del agente ()] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/f-0016/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-11 — f-0017 completado

## Feature f-0017

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear helpers puros de costeo en src/lib/costeo.ts siguiendo el patrón de src/lib/lotes.ts: calcularCostoMOD(sueldoObjetivoSemanal, empanadasEstimadasSemana) que retorne 0 si empanadasEstimadasSemana es 0 (evitar división por cero); prorratearCostoOperativo(totalGastosPeriodo, unidadesVendidasPeriodo) que retorne 0 si no hay unidades o gastos; calcularCostoTotalEmpanada({costoMateriaPrima, costoMOD, costoOperativo}); y calcularMargen(precioVenta, costoTotal) que devuelva {margenUnitario, margenPct} manejando precioVenta 0. Exportar funciones puras tipadas, siguiendo exactamente la fórmula de SPEC-MVP.md §5. (9b3e0ebe)
- [x] Step 2: Implementar el gastoRouter vacío en src/server/api/routers/gasto.ts con procedures publicProcedure siguiendo el patrón de loteRouter: `list` (todos los gastos) y `byPeriod` (input Zod con desde/hasta como fechas) que sume montos de GastoOperativo filtrando por createdAt/fecha dentro del rango. Debe retornar total 0 sin error cuando no hay gastos cargados en el período. (ecf10b33)
- [x] Step 3: Agregar un procedure de lectura de ConfigManoDeObra: crear src/server/api/routers/config.ts con un configRouter que exponga `get` (publicProcedure) leyendo el registro con id fijo 'config-mod' y retornando sueldoObjetivoSemanal y empanadasEstimadasSemana. Montar configRouter en src/server/api/root.ts. (d6204331)
- [x] Step 4: Crear src/lib/produccion.ts con la función pura calcularEmpanadasProducibles(recetaItems, stocksInsumos) que calcule el mínimo, sobre cada insumo de la receta, de stockActual_insumo / cantidadPorUnidad_insumo, reutilizando toUnidadNativa de src/lib/lotes.ts para convertir unidades. Retornar 0 si algún insumo tiene stock 0 o si la receta está vacía, sin dividir por cero. (c5e3d218)
- [x] Step 5: Crear src/server/api/routers/dashboard.ts con un dashboardRouter (publicProcedure) `resumenPorPeriodo` que reciba un input Zod {periodo: 'hoy'|'semana'|'mes'} y compute, con queries agregadas sobre Venta (unidades y ingresos), Lote/insumos (costoMateriaPrima vía calcularCostoMateriaPrima), GastoOperativo (gasto.byPeriod) y ConfigManoDeObra: costoMOD, costoOperativo prorrateado, costoTotalEmpanada, margenUnitario, margenPct y empanadasProducibles, usando los helpers de src/lib/costeo.ts y src/lib/produccion.ts. Incluir flag sinGastosCargados cuando el gasto del período es 0. Montar dashboardRouter en src/server/api/root.ts. Calcular los rangos de fecha respetando hora local argentina (patrón parseLocalDate). (70b02a1d)
- [x] Step 6: Implementar la UI del dashboard en src/app/page.tsx ('use client'): selector o secciones para hoy / esta semana / este mes usando trpc.dashboard.resumenPorPeriodo.useQuery, mostrando unidades vendidas, ingresos, costo por empanada, margen unitario, margen %, y empanadas producibles con stock actual. Mostrar la nota 'sin gastos cargados este período' cuando el flag sinGastosCargados sea true. Usar exclusivamente el lenguaje de SPEC-MVP.md §6 (nunca 'costos fijos/variables') y mostrar solo datos reales, nunca proyecciones. (b69357f7)
- [x] Step 7: Crear src/__tests__/costeo.test.ts y src/__tests__/dashboard.test.ts siguiendo el patrón de venta.test.ts (createCallerFactory + mock de db): tests unitarios de las fórmulas de src/lib/costeo.ts y src/lib/produccion.ts (incluyendo casos borde: empanadasEstimadasSemana 0, sin gastos, stock 0, receta vacía) y test del procedure resumenPorPeriodo verificando la agregación por período con datos mockeados. (6aee821a)

### Decisiones (ADR)
- ADR-0057 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0058 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0059 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0060 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0061 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0062 —  [Supuesto del agente ()] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/f-0017/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-11 — f-0018 completado

## Feature f-0018

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Agregar la mutation `create` a gastoRouter (src/server/api/routers/gasto.ts): input Zod con categoria z.enum(['packaging','delivery','otro']), descripcion opcional, monto positivo y fecha; persiste con ctx.db.gastoOperativo.create. Mantener list y byPeriod intactos. (57a41884)
- [x] Step 2: Implementar retiroRouter desde cero (src/server/api/routers/retiro.ts) siguiendo el patrón de gasto.ts: procedure `create` (input Zod monto positivo, nota opcional, fecha), `list` (findMany orderBy fecha desc) y `byPeriod` (aggregate _sum:monto con filtro fecha gte/lte). Ya está montado en root.ts. (aefebe79)
- [x] Step 3: Crear función pura `calcularSaldoNegocio` en src/lib/costeo.ts que reciba ingresos, compras, gastos y retiros y retorne saldo = ingresos − compras − gastos − retiros (derivado, nunca persistido). Agregar un procedure `saldoNegocio` (acumulado) en dashboardRouter que consulte ventas, compras, gastoOperativo.aggregate y retiro.aggregate y devuelva ingresos, compras, gastos, retiros y saldo usando esa función. (14e0a244)
- [x] Step 4: Ajustar el prorrateo de costoOperativo del dashboard para usar unidades PRODUCIDAS del período en lugar de unidades vendidas (SPEC §5): actualizar la llamada en dashboardRouter.resumenPorPeriodo y adaptar prorratearCostoOperativo si hace falta, actualizando los tests existentes en src/__tests__/costeo.test.ts y src/__tests__/dashboard.test.ts para que sigan pasando. (01093a5a)
- [x] Step 5: Crear la página de carga de Gastos operativos en src/app/gastos/page.tsx ('use client'): formulario con selector de categoría fija (packaging/delivery/otro), descripción, monto y fecha, usando trpc.gasto.create.useMutation con invalidación de trpc.gasto.list tras crear, más listado de gastos recientes. Reusar el layout mobile-first (max-w-lg mx-auto p-4) y formateo ARS con Intl.NumberFormat. (f11e359e)
- [x] Step 6: Crear la página de carga de Retiros en src/app/retiros/page.tsx ('use client'): formulario con monto, nota y fecha usando trpc.retiro.create.useMutation con invalidación de trpc.retiro.list tras crear, más listado de retiros recientes. Mismo layout y formateo ARS que la página de gastos. (24b76bc4)
- [x] Step 7: Crear la vista 'Mi plata' en src/app/mi-plata/page.tsx ('use client') que consuma dashboard.saldoNegocio y muestre el desglose (ingresos − compras − gastos − retiros) y el saldo del negocio acumulado como KPIs, con banner cuando no haya datos, siguiendo el patrón de KpiCards del dashboard. (4bce0ca2)
- [x] Step 8: Agregar tests con vitest y buildMockDb para gasto.create, retiroRouter (create/list/byPeriod), calcularSaldoNegocio y el procedure saldoNegocio del dashboard, cubriendo casos borde (montos cero, sin retiros, sin gastos), en src/__tests__. (8fd9a8c1)

### Decisiones (ADR)
- ADR-0063 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0064 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0065 —  [Supuesto del agente ()] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/f-0018/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-11 — F-0019 completado

## Feature F-0019

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/features/portfolio/components/PortfolioHeroChart.jsx`, parametrizar `renderChart(gradId, { minimal } = {})` para que en modo minimal omita `CartesianGrid`, `XAxis` e `YAxis`, use `margin={{ top: 4, right: 0, left: 0, bottom: 0 }}`, `strokeWidth={2.5}` en el área y un gradiente con stops 0%→0.35, 55%→0.08, 100%→0. Mantener `isAnimationActive={false}`. Usar `minimal: true` únicamente en la invocación dentro de `mobileEl` y subir la altura del contenedor mobile del chart de 140px a 200px. No tocar la invocación de `desktopEl`. (0212d476)
- [x] Step 2: En `mobileEl` de `PortfolioHeroChart.jsx`, reordenar el bloque superior a: label "VALOR DEL PORTFOLIO" (sin `· {period}`) → valor `text-[34px] tracking-tight` → P&L nominal + badge % → `LiveDot` centrado debajo del P&L → chart. Eliminar la fila superior actual "LiveDot … ojo" y mover el botón del ojo a posición absoluta top-right del hero, conservando el uso de `useBalanceVisibility`/`toggleBalance` sin romper la censura. (5553ed0c)
- [x] Step 3: Rediseñar los period chips de `mobileEl` en `PortfolioHeroChart.jsx`: fila `justify-between` a lo ancho sin `overflow-x-auto`/scroll horizontal, cada botón `text-[13px]` y `min-h-[44px]`; inactivo solo con `color: var(--ink-faint)` (sin fondo ni borde), activo como pill `rgba(47,212,205,0.15)` + color teal. Mantener los 7 períodos de `PERIODS` visibles en viewport 375–430px y dejar los chips XIRR / vs SPY debajo sin cambios. (ed486305)
- [x] Step 4: Ajustar el skeleton de loading de `mobileEl` en `PortfolioHeroChart.jsx` para que coincida con el nuevo tamaño del valor (34px) y del chart (200px de alto), evitando el salto visual al pasar de loading a datos. (01699c1e)

### Decisiones (ADR)
- ADR-0066 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0067 —  [Supuesto del agente ()] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0019/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-11 — F-0020 completado

## Feature F-0020

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/components/common/MobileHeader.jsx`, reemplazar el spacer derecho (`w-8`) de la row 1 por un grupo derecho con el botón ojo: importar `Eye`/`EyeOff` de lucide-react y `useBalanceVisibility` de `src/hooks/`, renderizar un botón toggle (Eye si visible, EyeOff si oculto) con target táctil ≥44px que llame al toggle del hook. Ajustar el ancho del grupo para que el logo (absolute left-1/2) siga centrado sin overlap en 320–375px. (77b05258)
- [x] Step 2: En `MobileHeader.jsx`, agregar dentro del grupo derecho el botón settings: importar `Settings` de lucide-react y `useNavigate` de react-router-dom, navegar a `/sistema/administracion` al click, con target táctil ≥44px. Gatear su renderizado con el mismo criterio de permisos que la navegación (isAdmin desde `useAuth`); si el usuario no tiene acceso, no renderizar el botón (no deshabilitarlo). (fce611ac)
- [x] Step 3: En `src/features/portfolio/components/PortfolioHeroChart.jsx`, eliminar del bloque mobile el botón ojo en posición absoluta y su handler `toggleBalance`; remover los imports/estado que queden huérfanos (`Eye`/`EyeOff` y `toggleBalance`), manteniendo la lectura de `balanceHidden` de `useBalanceVisibility` que el hero sigue usando para renderizar los montos censurados. (206a318f)

### Decisiones (ADR)
- ADR-0068 —  [Supuesto del agente ()] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0020/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-11 — F-0021 completado

## Feature F-0021

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/features/portfolio/components/AllocationPanel.jsx`, reestructurar el body del card en un layout de dos columnas: donut a la izquierda (~96–110px de lado) y leyenda en columna a la derecha ocupando el resto del ancho, sin tocar el header (título + toggle) ni el cálculo de `pieData`/`posCount`. Verificar que no rompa el ancho del panel en desktop (~35% del grid). (e4921ed2)
- [x] Step 2: Ajustar las props del `Pie`/`PieChart` en AllocationPanel: `innerRadius` ≈ 68% del `outerRadius`, `paddingAngle: 3`, `cornerRadius: 4`, manteniendo `startAngle=90`/`endAngle=-270` e `isAnimationActive={false}`. Superponer el contador central con el número grande (~18px, clase `num`) + "pos." (10px, ink-faint) usando `<text>` SVG centrado o div absolute con `pointer-events-none`, reusando `posCount`. (0dba99f2)
- [x] Step 3: Rediseñar la leyenda de AllocationPanel para que cada slice se muestre como "• Label … XX,X%": dot del color del slice, label en `--ink-mute` `text-[13px]`, y el porcentaje en clase `num` con el color del slice, formateando con `formatNumber`. Mantener el orden de `sliceDefs` y usar exclusivamente los colores de `TYPE_SLICES`/`STRATEGY_SLICES`. Los % quedan visibles con censura activa (comportamiento actual). (3ff88fdb)
- [x] Step 4: Verificar y conservar sin regresión el header con el toggle Por tipo / Por estrategia (que re-renderiza donut + leyenda + contador) y la `StatBar` de objetivo USD debajo cuando `targetUsd > 0`, validando el render en ambos escenarios (con y sin StatBar), con un solo slice y con cartera vacía (fallback `empty` de `chartData`). Confirmar que typecheck y lint pasan. (3ff88fdb)

### Decisiones (ADR)
- ADR-0069 —  [Supuesto del agente ()] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0021/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-12 — F-0022 completado

## Feature F-0022

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/features/portfolio/components/MobilePositionsList.jsx`, convertir el componente `MiniSpark` de `<LineChart>`/`<Line>` (48×20) a `<AreaChart>`/`<Area>` con gradiente (siguiendo el patrón de `renderChart` en `PortfolioHeroChart.jsx`: `<linearGradient>` con stops de opacity 0.3→0, `fill=url(#id)`, `strokeWidth 2.5`). Parametrizar tamaño vía props (`width`/`height` con defaults ~72×28) para no romper el uso actual, mantener el color por signo del período (primer vs último punto usando TEAL/CORAL) y `isAnimationActive={false}`. Cada instancia debe usar un id de gradiente único para evitar colisiones SVG. (4290c0f8)
- [x] Step 2: En `MobilePositionsList.jsx`, agregar soporte para `variant="featured"`: cuando esté activa, aplanar las posiciones (excluyendo CASH igual que hoy), ordenar desc por `valuation`/`valuationUSD` según la moneda activa (`currency`) reutilizando los helpers ya exportados por `GroupedPositionsTable`, y hacer `slice(0,5)` sin agrupación, sin group headers y sin el toggle tipo/estrategia. No alterar el comportamiento de la variante agrupada existente. (e860f3df)
- [x] Step 3: En `MobilePositionsList.jsx`, renderizar el header de la sección featured: título "Posiciones Destacadas" y un link/botón "Ver todas ›" (con `ChevronRight` de lucide-react) que invoque la prop `onViewAll`. Cada fila del top-5 debe usar `AssetLogo` (36px), ticker + assetClass, la nueva `MiniSpark` de área (~72×28), valuación censurable vía `MoneyValue`/`maskMoney`/`useBalanceVisibility` y el % coloreado; tap abre el `PositionDetailSheet` existente. Touch targets ≥ 44px por fila. (ff1f0ff8)
- [x] Step 4: En `src/features/portfolio/components/DashboardOverview.jsx`, cambiar el call-site mobile de la variante `full` para pasar `variant="featured"` a `MobilePositionsList`, manteniendo el `sparklineFor` y el `onViewAll={() => navigate('/portfolio/posiciones')}` ya existentes. Verificar que la variante `positions` (página /portfolio/posiciones) siga usando la lista agrupada completa sin regresión. (ff1f0ff8)

### Decisiones (ADR)
- ADR-0070 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0071 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0072 —  [Supuesto del agente ()] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0022/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-12 — F-0024 completado

## Feature F-0024

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/features/portfolio/components/DashboardOverview.jsx`, dentro del bloque `md:hidden` de la variante `full`, reordenar los bloques JSX existentes al orden: hero → AllocationPanel → Posiciones Destacadas (MobilePositionsList variant='featured') → KPI carousel (kpiItems) → FAB. Mover el bloque del KPI carousel tal cual (sin tocar props, hooks ni data flow) desde su posición actual entre hero y AllocationPanel hacia abajo de la sección de destacadas. No modificar el layout desktop (`hidden md:`) ni la variante `positions`. (4a3903c5)
- [x] Step 2: En el mismo bloque mobile `full` de `DashboardOverview.jsx`, normalizar el spacing entre secciones a un único criterio de gap: revisar y unificar los `px-4`/`pt-4`/`pb-2` de cada sección para evitar padding duplicado, y eliminar el divider `mx-4` si quedó redundante tras el reorden. Sin cambios de lógica. (2fa5754c)
- [x] Step 3: En el contenedor del bloque mobile `full` de `DashboardOverview.jsx`, asegurar el padding-bottom suficiente para que el FAB (offset `--safe-bottom` + 56px + 16px sobre el bottom nav) no tape el último KPI del carousel ahora que quedó al final del scroll. Verificar en viewport 390×844 que above the fold queden el valor, el chart, los períodos y el inicio del card de Asignación. (aad14661)

### Decisiones (ADR)
- ADR-0073 —  [Supuesto del agente ()] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0024/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-12 — F-0023 completado

## Feature F-0023

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/components/common/MobileNav.jsx`, extraer el markup interno de cada ítem (icono + label) a un contenedor pill reutilizable, sin cambiar aún el estilo: mantener el `Link` con `flex-1`, `min-h-[44px]` y el hit area completo, envolviendo icono+label en un `<span>` interno que servirá de pill. Conservar intactos `PINNED`, `isActive(path)`, `pinnedVisible` y el filtrado por permisos. El render de los 4 pinned y del botón 'Más' debe usar la misma estructura de pill interno. (6c83c045)
- [x] Step 2: En el mismo `MobileNav.jsx`, aplicar el estilo pill condicionado por estado activo en el contenedor interno: cuando el ítem está activo (`isActive(item.path)`), setear `background: var(--teal-dim)`, `rounded-full`, padding horizontal e icono+label en `var(--teal)`; cuando inactivo, sin fondo con icono+label en `var(--ink-faint)`. Agregar `transition-all duration-200`. El pill vive dentro del ítem sin alterar el ancho de columna (flex-1) ni el alto total de 56px + safe-area. Usar solo los tokens existentes (`--teal-dim`, `--teal`, `--ink-faint`), sin colores nuevos. (b766a73b)
- [x] Step 3: En `MobileNav.jsx`, aplicar el mismo estado pill al botón 'Más' cuando su bottom sheet está abierto (`moreOpen`): usar la misma condición visual (`background: var(--teal-dim)`, `rounded-full`, icono en `var(--teal)`) que los ítems pinned activos, reutilizando el contenedor pill del paso anterior. No modificar la lógica de apertura/cierre del BottomSheet ni su contenido. (b766a73b)

### Decisiones (ADR)
- ADR-0074 —  [Supuesto del agente ()] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0023/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-12 — F-0025 completado

## Feature F-0025

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/pages/Dashboard.jsx` (~línea 356), envolver el `<PageHeader title="Overview" subtitle="Portfolio" />` de la tab overview en un contenedor con `className="hidden md:block"` (o condicionar su render) para que NO se muestre en mobile solo en la tab overview. No tocar el PageHeader de las demás tabs ni el layout desktop. (0fe9c884)
- [x] Step 2: En `src/features/portfolio/components/PortfolioSelector.jsx`, agregar una prop `variant="compact"` (default el actual) que renderice el trigger como pill con icono `ChevronDown` de lucide-react en lugar del `⋮` actual, sin cambiar la lógica del selector ni romper los call-sites existentes desktop. (262d4350)
- [x] Step 3: En `src/components/common/MobileHeader.jsx`, pasar `variant="compact"` al `PortfolioSelector` de la row 2 y reducir la altura de esa row (hoy `h-9`) para compactar el header, recalculando si corresponde el offset `mobile-body-offset` en `src/index.css` para evitar solapamiento con el contenido. Mantener touch targets ≥44px y la censura intacta. (cbc6cd56)
- [x] Step 4: En `src/features/portfolio/components/PortfolioHeroChart.jsx`, reforzar los stops del gradiente del área en modo minimal/mobile (de 0%→0.35, 55%→0.08, 100%→0 a ~0%→0.5, 50%→0.18, 100%→0.03) manteniendo `isAnimationActive={false}` y sin alterar el render desktop no-minimal; además reducir el gap vertical entre el bloque del valor ("En vivo") y el contenedor del chart para eliminar el aire muerto. (e0fb2a2f)

### Decisiones (ADR)
- ADR-0075 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0076 —  [Supuesto del agente ()] **⚠ REVISAR**
- ADR-0077 —  [Supuesto del agente ()] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0025/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-13 — F-0026 completado

## Feature F-0026

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/components/common/MobileNav.jsx`, subir la presencia del span pill del ítem activo: aumentar el fondo teal (ej. `rgba(47,212,205,0.18)`) y/o agregar un borde sutil `1px solid rgba(47,212,205,0.25)`, ampliar el padding a `px-4 py-2` manteniendo `rounded-full` y `transition-all duration-200`. Los inactivos quedan sin fondo/borde (ink-faint). Solo estilos condicionados por `active`, sin tocar estructura ni lógica de F-0023. (784c6d5b)
- [x] Step 2: En el mismo `MobileNav.jsx`, diferenciar el peso visual del icono activo pasando `strokeWidth={2.5}` al icono lucide cuando el ítem está activo y `strokeWidth={2}` (default) cuando está inactivo, para que el activo se distinga por peso además de color. (b417435a)
- [x] Step 3: Verificar que el botón "Más" aplique el mismo pill prominente (fondo/borde/padding e icono con strokeWidth mayor) cuando su bottom sheet está abierto (`moreOpen === true`), reutilizando exactamente el mismo tratamiento visual que los ítems pinned activos; ajustar sólo si el markup del "Más" no comparte el estilo del pill. (b417435a)

### Decisiones (ADR)
- ADR-0078 —  [Supuesto del agente ()] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0026/`

> Revisar con Claude in Chrome para validación de UX.
