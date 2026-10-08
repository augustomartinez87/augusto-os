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

## 2026-07-14 — F-0028 completado

## Feature F-0028

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En state.ts, hacer saveState atómico: escribir el JSON a STATE.json.tmp con writeFileSync y luego renameSync(STATE.json.tmp, STATE.json) para reemplazar el archivo real (usar el renameSync ya importado). Eliminar todo writeFileSync directo sobre STATE.json. (ee2b1481)
- [x] Step 2: En state.ts, hacer loadState tolerante a basura trailing: extraer el primer valor JSON válido del contenido (estilo raw_decode), y si había basura post-JSON, loguear un warning y reescribir el archivo limpio vía saveState. STATE sano nunca debe reescribirse perdiendo steps/commits; mantener compatibilidad con STATE.*.archived.json. (18b86706)
- [x] Step 3: Agregar tests en state.test.ts: (a) saveState escribe atómicamente y no deja .tmp; (b) loadState con un fixture corrupto real (JSON válido + null bytes/texto trailing) lo parsea, loguea warning y reescribe versión limpia; (c) un STATE sano se lee/escribe sin pérdida de datos. (099927c2)
- [x] Step 4: En limits.ts, agregar la constante exportada PROBE_INTERVAL_MS (15 min) y el helper probeAvailability() inyectable (patrón callClaude? de architect/planner/reviewer) que invoca el CLI de claude con MODEL_INTAKE, --max-turns 1 y prompt trivial ('ok'), devolviendo boolean según exit/status. Costo mínimo, nunca en paralelo. (154c1247)
- [x] Step 5: En limits.ts, modificar handleUsageLimit: cuando NO hay hora de reset parseable (evitando el fallback ciego de +5h), entrar en loop de poll cada PROBE_INTERVAL_MS con probeAvailability() y reanudar apenas un probe pasa; cuando SÍ hay hora real, mantener sleepUntil + un probe de confirmación al despertar. Conservar parseResetTime. (0dc450e7)
- [x] Step 6: En index.ts, al arrancar con pausedUntil futuro en STATE.json, ejecutar probeAvailability() ANTES de dormir: si hay disponibilidad, limpiar la pausa (pausedUntil) y continuar el loop; si no, mantener el sleep. Respetar el gating por OPERATOR_STATE existente. (6d8e75e6)
- [x] Step 7: Agregar tests en limits.test.ts para la reanudación temprana: probe inyectable que falla N veces y luego pasa, verificando que handleUsageLimit reanuda tras el probe exitoso sin dormir el bloque fijo. Actualizar los tests existentes de parseResetTime/fallback que asuman el sleep de 5h. (2ef2d174)

### Decisiones (ADR)
- ADR-0079 — Disponibilidad del probe por detección de límite, no por exit code [Instrucción de Augusto]

### QA
Screenshots en `orchestrator/qa-artifacts/F-0028/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-23 — F-0029 completado

## Feature F-0029

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear el componente client `src/components/NavBar.tsx`: tira horizontal de pills con `overflow-x-auto`, contenedor `max-w-lg mx-auto`, sticky arriba. Usa `usePathname()` de next/navigation para resaltar la pill activa (mismo patrón de contraste que el selector PERIODOS en src/app/page.tsx). Links a Dashboard (/), Ventas (/ventas), Compras (/compras), Producción (/produccion), Insumos (/insumos), Gastos (/gastos), Retiros (/retiros), Mi Plata (/mi-plata) y Recetas (/recetas) usando next/link. Mobile-first (~375px) sin cortar contenido. (c09db816)
- [x] Step 2: Integrar NavBar en `src/app/layout.tsx`: renderizarlo envuelto en `<SignedIn>` de @clerk/nextjs, antes de children, para que aparezca en todas las páginas de contenido con sesión activa y NO en /sign-in ni /sign-up. No modificar el orden de ClerkProvider > TRPCProvider. (fee94f8a)
- [x] Step 3: Crear `src/app/sign-up/[[...sign-up]]/page.tsx` con el componente `<SignUp/>` de @clerk/nextjs, replicando el mismo layout/estilo que sign-in existente (centrado, `min-h-screen`). (e202c781)
- [x] Step 4: Agregar cross-links: en la página de sign-in un link a /sign-up y en la página de sign-up un link a /sign-in (usando next/link), para navegar entre ambas sin escribir la URL a mano. (92688668)

### Decisiones (ADR)
- ADR-0085 — Uso de `<Show when="signed-in">` en lugar de `<SignedIn>` (Clerk v7) [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0029/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-23 — F-0030 completado

## Feature F-0030

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/middleware.ts`: importar `clerkMiddleware` y `createRouteMatcher` de `@clerk/nextjs/server`, definir `const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"])` y dentro del callback `clerkMiddleware(async (auth, req) => { if (!isPublicRoute(req)) await auth.protect() })`. Verificar contra los tipos del paquete instalado (@clerk/nextjs ^7.5.14) la firma exacta de `auth.protect()` en v7 antes de escribir el código (no asumir sintaxis de v5/v6). Mantener el `config.matcher` actual sin cambios. (10fcf392)
- [x] Step 2: En `src/server/api/trpc.ts`: cambiar la firma de `createTRPCContext` para que sea `async (opts: { headers: Headers }) => ...` (o el shape que consuma el route handler) y dentro llamar a `auth()` de `@clerk/nextjs/server` para obtener `userId`, retornando `{ db, userId }`. Envolver la llamada de forma que no rompa el typecheck. No tocar todavía `publicProcedure` ni los routers. (2cc5b9c8)
- [x] Step 3: En `src/app/api/trpc/[trpc]/route.ts`: ajustar la invocación de `createTRPCContext` dentro de `fetchRequestHandler` para pasarle el objeto con `req`/`headers` que ahora exige la nueva firma (ej. `createContext: () => createTRPCContext({ headers: req.headers })`), de modo que el handler siga typecheckeando. (55ef418e)
- [x] Step 4: En `src/server/api/trpc.ts`: agregar `protectedProcedure` usando `t.procedure.use(t.middleware(...))` que verifique `ctx.userId` y lance `new TRPCError({ code: "UNAUTHORIZED" })` si es null/undefined; en caso contrario hacer `next({ ctx: { ...ctx, userId: ctx.userId } })` para que el tipo quede como `string` (non-nullable) aguas abajo. Exportar `protectedProcedure` junto a `publicProcedure` (todavía sin migrar routers). (848b2984)
- [x] Step 5: Migrar a `protectedProcedure` los routers de operaciones: `src/server/api/routers/compra.ts`, `insumo.ts`, `lote.ts` y `producto.ts` — reemplazar cada uso de `publicProcedure` por `protectedProcedure` y actualizar el import desde `~/server/api/trpc`. No cambiar inputs, outputs ni lógica de negocio. (edb4debf)
- [x] Step 6: Migrar a `protectedProcedure` los routers restantes: `src/server/api/routers/venta.ts`, `gasto.ts`, `retiro.ts`, `config.ts` y `dashboard.ts` — reemplazar cada uso de `publicProcedure` por `protectedProcedure` y actualizar imports. Verificar con un grep final que no quede ningún `publicProcedure` en uso bajo `src/server/api/routers/`. (7379c697)
- [x] Step 7: Actualizar los 7 archivos de tests (`src/__tests__/compras.test.ts`, `lote.test.ts`, `venta.test.ts`, `gasto.test.ts`, `retiro.test.ts`, `insumos.test.ts`, `dashboard.test.ts`): en cada `createCaller({ db } as any)` pasar también un `userId` de prueba (ej. `createCaller({ db, userId: "test-user" } as any)`), de modo que el middleware de `protectedProcedure` no lance UNAUTHORIZED y todos los tests existentes sigan pasando sin cambiar sus asserts. (7379c697)
- [x] Step 8: Agregar un test nuevo (ej. `src/__tests__/auth.test.ts`) que cree un caller con contexto sin `userId` (`{ db, userId: null } as any`) y verifique que al menos un procedure representativo de query y uno de mutation rechazan con `TRPCError` de código `UNAUTHORIZED`, cubriendo el criterio de aceptación de tRPC. (964877d5)
- [x] Step 9: Correr `npm run typecheck`, `npm run lint` y `npm test` (o los scripts equivalentes definidos en `package.json`) y corregir cualquier error residual de tipos o lint derivado del cambio de firma de `createTRPCContext` y de la migración a `protectedProcedure`, sin alterar lógica de negocio. (fa618c07)

### Decisiones (ADR)
- ADR-0086 — Firma de opts usa `{ req: Request }` en lugar de `{ headers: Headers }` [Supuesto del agente] **⚠ REVISAR**
- ADR-0087 — Los tests de lógica de negocio stubean un contexto autenticado [Supuesto del agente] **⚠ REVISAR**
- ADR-0088 — Los tests de tRPC inyectan userId en el contexto en vez de relajar enforceAuth [Supuesto del agente] **⚠ REVISAR**
- ADR-0089 — Reusar dbTrampa para el segundo describe en lugar de `{} as any` [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0030/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-24 — F-0031 completado

## Feature F-0031

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `orchestrator/src/targets.ts`, exportar una función pura `resolveQaBaseUrl(envUrl: string | undefined, targetQaBaseUrl: string | undefined): string` que devuelva, en orden de prioridad: `envUrl` si es un string no vacío (trim), luego `targetQaBaseUrl` si es un string no vacío (trim), y como último fallback el literal `'http://localhost:3000'`. Usar chequeo de string vacío (no `??` a secas) porque el target 'sistema' tiene `qaBaseUrl: ""` en `targets/targets.json` y `??` no captura el string vacío, lo que rompería el fallback exigido por el acceptance criteria. No modificar la interfaz `Target` ni `getTargetConfig()`. (e5d58552)
- [x] Step 2: En `orchestrator/src/index.ts` línea ~447, reemplazar `const baseUrl = process.env.QA_BASE_URL ?? 'http://localhost:3000'` por una llamada a `resolveQaBaseUrl(process.env.QA_BASE_URL, getTargetConfig().qaBaseUrl)`, agregando `resolveQaBaseUrl` al import ya existente de `'./targets.js'` (línea 21). No cambiar la firma ni la lógica interna de `runQA()` en `qa.ts` — solo el valor que se le pasa como `baseUrl`. (a267630e)
- [x] Step 3: Crear `orchestrator/src/targets.test.ts` con tests unitarios de `resolveQaBaseUrl` que cubran: (a) sin QA_BASE_URL y target con `qaBaseUrl: 'http://localhost:5173'` → devuelve 5173 (caso argos); (b) con QA_BASE_URL seteada → esa gana sobre el valor del target; (c) target con `qaBaseUrl: ''` (caso 'sistema') → fallback a `'http://localhost:3000'`; (d) target con `qaBaseUrl` undefined → mismo fallback; (e) QA_BASE_URL vacía o solo espacios → no gana, se usa el target. Usar vitest siguiendo el estilo de los tests existentes en `orchestrator/src/`. (89f210fc)
- [x] Step 4: Revisar los mocks de `getTargetConfig` existentes en `orchestrator/src/planner.test.ts` (línea ~6) y cualquier otro test que mockee `./targets.js`, y agregarles la propiedad `qaBaseUrl` para que el objeto mockeado sea consistente con la interfaz `Target`. Verificar además que ningún test ni mensaje de log/error de `orchestrator/src/qa.ts` asuma el literal `http://localhost:3000` como valor fijo; el hint de `qa.ts` sobre `QA_BASE_URL=<url>` debe mantenerse porque el env var sigue siendo override válido. (9b157b1c)
- [x] Step 5: Correr typecheck (`npx tsc --noEmit` o el script equivalente del package.json del orchestrator) y `npm test`, y corregir cualquier error de tipos, import o test roto que surja del cambio. No tocar `targets/targets.json`, no agregar dependencias nuevas. (9b157b1c)

### Decisiones (ADR)
- ADR-0090 — Uso de trim() en lugar de ?? para detectar strings vacíos en resolveQaBaseUrl [Instrucción de Augusto]
- ADR-0091 — Step 5 sin commit + separación del commit ajeno por contención de working tree [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0031/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-24 — F-0032 completado

## Feature F-0032

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear `orchestrator/src/check-repo-health.ts` con el esqueleto del CLI standalone: leer `<target>` de `process.argv[2]`, validar que se haya pasado (si no, `console.error` con uso y `process.exit(1)`), llamar `setActiveTarget(target)` y `getRepoRoot()` importados de `./targets.js` (mismo patrón que `intake-cli.ts:47-79`). Copiar localmente el helper `run(cmd: string, args: string[], cwd: string): Promise<{ ok: boolean; output: string }>` basado en `verifier.ts:13-21` (execa con `reject: false`, `all: true`, `cwd`) OMITIENDO `getDbEnvOverride()` — no importar nada de `verifier.ts`. Definir el tipo `CheckResult { name: string; ok: boolean; detail: string }` que usarán los chequeos siguientes. Por ahora `main()` solo imprime el repo root resuelto y sale con 0. No modificar `targets.ts`, `verifier.ts`, `git.ts` ni `index.ts`. (ad794fc4)
- [x] Step 2: En `check-repo-health.ts`, agregar el chequeo de working tree: función exportada `parseGitStatus(porcelainOutput: string): string[]` que parsea la salida de `git status --porcelain` en una lista de archivos sucios (ignorando líneas vacías y trimeando el prefijo de status), y función exportada `checkWorkingTree(cwd: string, runFn = run): Promise<CheckResult>` que invoca `run('git', ['status', '--porcelain'], cwd)` y devuelve `ok: true` si no hay archivos, o `ok: false` con el listado formateado. Recibir `runFn` como parámetro inyectable con default (mismo patrón de inyección que `escalation.test.ts:38-40` / `limits.test.ts:44-50`) para poder testear sin mockear execa. Cablearlo en `main()`. (afe7ef34)
- [x] Step 3: En `check-repo-health.ts`, agregar el chequeo de lock: función exportada `checkIndexLock(cwd: string, fsDeps = { existsSync, statSync }, now = () => Date.now()): CheckResult` que verifica `existsSync(path.join(cwd, '.git', 'index.lock'))`; si no existe devuelve `ok: true`; si existe, lee `statSync(...).mtime` y reporta la antigüedad en formato legible (ej. "hace 12m 30s") con `ok: false`, SIN matar procesos ni asumir que hay un proceso vivo. Manejar el caso de que el target no sea un repo git válido (no exista `.git/`) devolviendo una advertencia informativa. Dependencias de fs y reloj inyectables por parámetro para testeo determinista. Cablearlo en `main()`. (01cda65d)
- [x] Step 4: En `check-repo-health.ts`, agregar el chequeo de typecheck: función exportada `checkTypecheck(cwd: string, runFn = run): Promise<CheckResult>` que invoca `run('npx', ['tsc', '--noEmit'], cwd)` (mismo comando y cwd que `verifier.ts:23-29`) y devuelve `ok: true` con detalle "typecheck OK" o `ok: false` incluyendo el output de error (truncado a las últimas ~40 líneas para que el resumen siga siendo legible). Cablearlo en `main()`. (5182dbd8)
- [x] Step 5: En `check-repo-health.ts`, implementar el reporte final y el exit code: `main()` corre los tres chequeos en orden, imprime cada uno con prefijo ✅/⚠️ y su detalle, y al final un resumen legible (cantidad de chequeos OK vs. con issues). `process.exit(0)` si todos los chequeos son `ok`, `process.exit(1)` si alguno falla. Envolver la ejecución en un catch que imprima el error con `console.error` y salga con código 1 (mismo manejo que `intake-cli.ts` / `evaluate-cli.ts`), incluyendo el caso de target inexistente que lanza `setActiveTarget`. (b7600d05)
- [x] Step 6: Agregar el script `"check-repo-health": "tsx --env-file=.env src/check-repo-health.ts"` en la sección `scripts` de `orchestrator/package.json`, siguiendo el mismo patrón que los scripts existentes (`intake`, `evaluar`). No agregar dependencias nuevas — `execa` y `tsx` ya están declaradas. (b7600d05)
- [x] Step 7: Crear `orchestrator/src/check-repo-health.test.ts` con tests unitarios en vitest usando `vi.mock('./targets.js', ...)` (patrón de `planner.test.ts:4-10`) e inyección de dependencias (sin mockear execa directamente): (a) `parseGitStatus` con salida vacía → lista vacía, y con varias líneas → lista de archivos correcta; (b) `checkWorkingTree` con `runFn` mockeado devolviendo output vacío → `ok: true`, y con cambios → `ok: false` listando los archivos; (c) `checkIndexLock` con `existsSync` mockeado en false → `ok: true`, y en true con un `mtime` fijo y un `now` fijo → `ok: false` reportando la antigüedad esperada; (d) `checkTypecheck` con `runFn` mockeado OK → `ok: true`, y con fallo → `ok: false` incluyendo el output. Verificar que typecheck, lint y toda la suite del orchestrator pasen. (e7ec168a)

### Decisiones (ADR)
- ADR-0092 — run() recibe cwd como parámetro en lugar de llamar getRepoRoot() internamente [Supuesto del agente] **⚠ REVISAR**
- ADR-0093 — check-repo-health separa stdout de stderr y no auto-ejecuta main() al importarse [Supuesto del agente] **⚠ REVISAR**
- ADR-0094 — Caso "no es repo git" retorna ok: true en lugar de ok: false [Supuesto del agente] **⚠ REVISAR**
- ADR-0095 — Combinar stdout+stderr para el output de error de tsc [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0032/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-24 — F-0033 completado

## Feature F-0033

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Contraste: agregar una clase de color de texto explícita con contraste AA (`text-gray-900`) a TODOS los `<input>` (`type="number"`, `type="text"`, `type="date"`) de las 6 páginas de formulario en `src/app/{ventas,compras,produccion,insumos,gastos,retiros}/page.tsx`, para que el texto tipeado deje de heredar el `rgb(237,237,237)` del tema oscuro sobre la card blanca. No cambiar ningún otro estilo ni lógica. (5d79a113)
- [x] Step 2: Validación por-campo garantizada en `/ventas`: agregar `noValidate` al `<form>` de `src/app/ventas/page.tsx`, un estado de errores por campo con useState, y validación manual en `handleSubmit` antes de llamar a `createMutation.mutate(...)`. Al fallar, resaltar el/los campo(s) con `border-red-500` (en vez de `border-gray-300`) y mostrar mensaje de texto en rojo debajo del campo. No tocar el router de venta. (b2eabff5)
- [x] Step 3: Confirmación de valores atípicos en `/ventas`: antes de `createMutation.mutate(...)` en `src/app/ventas/page.tsx`, si `precioUnitario` es >= 10x el valor por defecto/último valor esperado (o cantidad >= 100), mostrar un `window.confirm` con el valor formateado tal como quedaría guardado; sólo continuar si Dani confirma. Umbrales hardcodeados en el archivo. Verificar que una venta válida normal sigue guardándose sin fricción. (4d196714)
- [x] Step 4: Aplicar el mismo patrón de validación por-campo (`noValidate` + errores por campo + `border-red-500` + mensaje inline) y de confirmación de valores atípicos (`window.confirm` sobre `monto`, umbral >= 10x) a `/retiros` en `src/app/retiros/page.tsx`, sin tocar el router de retiro. (d19d6d37)
- [x] Step 5: Replicar el patrón de validación por-campo con feedback visual (`noValidate` + errores por campo + `border-red-500` + mensaje inline) en los formularios restantes: `src/app/{compras,produccion,insumos,gastos}/page.tsx`, sin modificar la lógica de negocio de sus routers. Confirmar que cargas válidas siguen funcionando igual. (965056aa)
- [x] Step 6: Correr `npm run typecheck`, `npm run lint` y `npm test`; corregir cualquier error introducido por los cambios de formulario (respetando la regla `react-hooks/set-state-in-effect` de eslint-config-next 16) hasta que las tres tareas pasen sin errores. (965056aa)

### Decisiones (ADR)
- ADR-0096 — Umbral de precio basado en 10× DEFAULT, no en último valor guardado [Supuesto del agente] **⚠ REVISAR**
- ADR-0097 — Umbral de retiro atípico: $50.000 hardcodeado [Supuesto del agente] **⚠ REVISAR**
- ADR-0098 — Umbrales de valores atípicos hardcodeados por dominio [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0033/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-27 — F-0034 completado

## Feature F-0034

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/server/api/routers/retiro.ts` `create`: antes de crear, calcular el saldo actual del negocio con la misma fórmula que usa `/mi-plata`/`dashboard.saldoNegocio` (ingresos - compras - gastos - retiros), reusando/extrayendo la lógica a un helper compartido en `src/lib/` (p.ej. junto a `calcularSaldoNegocio` en `costeo.ts`) para no duplicarla. Si `saldoActual - monto < 0`, rechazar con `TRPCError({code: 'BAD_REQUEST', message: 'Saldo insuficiente — disponible $X, se pidió retirar $Y'})` usando `toFixed(2)`. No tocar UI en este paso. (76a8f8f5)
- [x] Step 2: En `src/app/retiros/page.tsx`: agregar detección del error de saldo por prefijo del mensaje (mismo patrón que `isStockError` en `produccion/page.tsx:43-44`) y mostrarlo en una card ámbar igual de visible que en Producción cuando la mutation falla con 'Saldo insuficiente'. (93e6a609)
- [x] Step 3: Agregar mutation `delete` (input `{ id: z.string() }`, `protectedProcedure`) que hace `ctx.db.<modelo>.delete({ where: { id } })` en `venta.ts`, `retiro.ts` y el router de gastos (`gasto.ts`). Son deletes simples sin efecto en stock. No tocar UI en este paso. (044194e4)
- [x] Step 4: En las páginas `ventas`, `retiros` y `gastos`: agregar en cada item del historial un botón de borrar (tap target ~44x44px mínimo) que dispara `window.confirm('¿Borrar este registro?')` antes de llamar al mutation `delete`, e invalida en `onSuccess` el query de `list` correspondiente más `dashboard`/`mi-plata`. (97c6cd67)
- [x] Step 5: Agregar mutation `delete` en `src/server/api/routers/compra.ts` dentro de un `ctx.db.$transaction`: (a) leer la compra, (b) `insumo.update` con `stockActual: { decrement: compra.cantidad }`, (c) buscar la compra más reciente restante de ese insumo (excluyendo la borrada) y setear `costoUnitarioActual` con `calcularCostoUnitario` de `src/lib/compras.ts`, o `0` si no queda ninguna, (d) `compra.delete`. No tocar UI en este paso. (e9b4278a)
- [x] Step 6: En `src/app/compras/page.tsx`: agregar el botón de borrar por item (tap target ~44x44px) con `window.confirm` previo, llamando al nuevo `compra.delete` e invalidando en `onSuccess` los queries de compras, insumos, `dashboard` y `mi-plata`. (5e2cdaa0)
- [x] Step 7: Agregar mutation `delete` en `src/server/api/routers/lote.ts` dentro de un `ctx.db.$transaction`: (a) leer el lote con `producto.recetaItems` (mismo query que `create`), (b) por cada `recetaItem` hacer `insumo.update` con `stockActual: { increment: <cantidad consumida> }` reusando `toUnidadNativa` de `src/lib/lotes.ts` con la misma fórmula que `create`, (c) `lote.delete`. No tocar UI en este paso. (ad18658b)
- [x] Step 8: En `src/app/produccion/page.tsx`: agregar el botón de borrar por lote en el historial (tap target ~44x44px) con `window.confirm` previo, llamando a `lote.delete` e invalidando en `onSuccess` los queries de lotes, insumos, `dashboard` y `mi-plata`. (da7d5f04)
- [x] Step 9: Agregar tests (siguiendo el estilo de `compras.test.ts` y los tests de lote existentes, extendiendo los mocks de DB para incluir `delete`): un test que verifica que borrar una Compra deja el `stockActual` y `costoUnitarioActual` del insumo exactamente como antes de crearla, y un test que verifica que borrar un Lote devuelve exactamente el stock consumido a cada insumo de la receta. Correr también los tests existentes para no romper cálculos de costeo. (fa713d0e)

### Decisiones (ADR)
- ADR-0099 — Helper de saldo devuelve el desglose completo, no solo el número [Instrucción de Augusto]
- ADR-0100 — Stock y costo se actualizan en un único `insumo.update` dentro de la transacción [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0034/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-27 — F-0035 completado

## Feature F-0035

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/server/api/routers/insumo.ts`: agregar la mutation `create` como `protectedProcedure` con input Zod `{ nombre: z.string().min(1), unidad: z.enum(["kg","unidad"]), stockActual: z.number().min(0).default(0) }`. En el handler, verificar duplicado con `ctx.db.insumo.findFirst({ where: { nombre: input.nombre } })` y lanzar `TRPCError({ code: "BAD_REQUEST", message: "Ya existe un insumo con ese nombre." })` si existe; si no, `ctx.db.insumo.create({ data: input })`. Importar `TRPCError` de `@trpc/server` si no está importado. Mantener el estilo del resto del router. (54877098)
- [x] Step 2: En `src/app/insumos/page.tsx`: agregar una sección/card "Nuevo insumo" (mismo patrón visual `bg-white rounded-xl border border-gray-200 p-4`, mobile-first max-w-lg) con campos nombre (text), unidad (select "kg"/"unidad") y stock inicial (number, opcional, default 0). Manejar el estado con useState + validación local (nombre no vacío) sin useEffect (usar reset con setForm inicial). Usar `trpc.insumo.create.useMutation` invalidando `utils.insumo.list.invalidate()` en onSuccess y limpiando el form; mostrar el error del server (nombre duplicado) inline. Usar color de texto explícito en los inputs para evitar el bug de contraste. (8c9c0bc1)
- [x] Step 3: En `src/__tests__/insumos.test.ts`: agregar tests unitarios para `insumoRouter.create` siguiendo el patrón `buildMockDb` + `createCallerFactory`/`createCaller` usado en el archivo (y en `gasto.test.ts`): (a) crea el insumo llamando a `db.insumo.create` con los datos correctos cuando el nombre no existe (`findFirst` devuelve null), (b) lanza error `BAD_REQUEST` cuando `findFirst` devuelve un insumo existente con el mismo nombre. (b79d7511)
- [x] Step 4: En `src/__tests__/auth.test.ts`: agregar `insumo.create` a la lista explícita de procedimientos protegidos verificados, para confirmar que la nueva mutation rechaza llamadas sin autenticación y mantener la cobertura de auth. (554687c2)

### QA
Screenshots en `orchestrator/qa-artifacts/F-0035/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-28 — F-0036 completado

## Feature F-0036

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/app/recetas/page.tsx`: reemplazar el texto placeholder actual (que menciona "F-0013..F-0018" y "augusto-os") por un copy neutral orientado a la usuaria final, ej. "Esta sección todavía no está lista. Por ahora, las recetas se manejan aparte — ¡ya la vas a poder usar acá pronto!". No construir el módulo de Recetas ni tocar routers/Prisma, es solo copy. (94045191)
- [x] Step 2: En `src/components/NavBar.tsx`: envolver el contenedor con `overflow-x-auto` en un wrapper `relative` y agregar un elemento decorativo `pointer-events-none absolute` posicionado sobre el borde derecho con un gradiente `bg-gradient-to-l from-white` que señale visualmente que hay más pestañas fuera de pantalla en viewport angosto. Versión simple (mostrarlo siempre) es aceptable; no agregar dependencias nuevas ni rediseñar el nav. (a019eb87)

### Decisiones (ADR)
- ADR-0101 — Gradiente siempre visible en lugar de gradiente condicional por scroll position [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0036/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-28 — F-0037 completado

## Feature F-0037

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `app/ap/page.tsx`, dentro del render de préstamos ACTIVOS de `CarteraTab` (~línea 1104-1157), agregar un bloque nuevo —renderizado solo si `loan.commissionExpected > 0`— que muestre 'Comisión total' (`formatCurrency(loan.commissionExpected, curr)`) y 'Por cuota' (`formatCurrency(loan.commissionExpected / loan.termMonths, curr)` con guarda contra `termMonths` null/0 para no dividir por cero, ocultando la fila 'Por cuota' si no hay término válido). Reusar el mismo estilo del bloque 'Comisión cobrada' existente (`text-emerald-500`/`text-emerald-300`, `tabular-nums`, `border-t border-white/5 pt-2`), sin introducir un patrón visual nuevo ni mostrar tasa/TNA/ratio. No tocar el bloque `commissionRealized > 0` existente. (7f31a6e4)
- [x] Step 2: Verificar en el tipo inferido de `trpc.ap.apMyPortfolio.useQuery` que `commissionExpected` y `termMonths` ya viajan tipados en cada item de la cartera (sin tocar `server/routers/ap.ts`), y ajustar el consumo en `CarteraTab` si el tipo requiere manejo de nullable para no romper el typecheck. (7f31a6e4)
- [x] Step 3: Agregar/actualizar tests de render de `CarteraTab` (o del loan card) cubriendo: (a) `commissionExpected > 0` muestra 'Comisión total' y 'Por cuota' con los montos formateados por `formatCurrency`; (b) `commissionExpected = 0/null` no renderiza el bloque nuevo (sin '$0' ni 'NaN'); (c) el bloque `commissionRealized > 0` sigue mostrándose como hoy. (acdad3ae)
- [x] Step 4: Correr typecheck, lint y la suite de tests, y corregir cualquier error resultante de los cambios. (acdad3ae)

### Decisiones (ADR)
- ADR-0102 — Estructura del bloque commissionExpected como contenedor con space-y-1 en lugar de dos divs independientes [Supuesto del agente] **⚠ REVISAR**
- ADR-0103 — Tests de render sin jsdom — helper espejo en lugar de render real [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0037/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-07-28 — F-0038 completado

## Feature F-0038

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `server/routers/ap.ts`, dentro de `apMyPortfolio` (~línea 2153-2167), extender el `select` de `ctx.prisma.loan.findMany` para incluir `apCommissionRatio: true` y asegurar que se traigan las cuotas del préstamo (`loanInstallments` con su `amount`) necesarias para la suma. Solo cambios en la query, sin alterar el mapeo aún. (5cfd2044)
- [x] Step 2: En el mapeo final de `apMyPortfolio` (~línea 2171-2196), calcular el fallback de `commissionExpected`: cuando `comm.expectedCommission` sea null/undefined Y `loan.apCommissionRatio` sea > 0, computar `Number(loan.apCommissionRatio) × Σ(installments.amount)` sobre todas las cuotas (pagadas o no), reusando `decimal.js` si el router ya lo importa. Si `expectedCommission` existe, usarlo tal cual (prioritario). Si `apCommissionRatio` es null/0, dejar `commissionExpected` en 0 como hoy. No exponer el ratio, solo montos absolutos. (e9f83c65)
- [x] Step 3: Extender los tests del router para `apMyPortfolio` cubriendo: (a) préstamo con `expectedCommission` guardado → se usa ese valor, no el fallback; (b) préstamo con `expectedCommission` null y `apCommissionRatio > 0` → se calcula el fallback correcto contra una suma de cuotas conocida; (c) préstamo con `apCommissionRatio` null/0 → `commissionExpected` queda en 0 sin NaN ni excepción. (ddfa555f)
- [x] Step 4: Correr typecheck, lint y la suite de tests; corregir cualquier error residual introducido por los cambios anteriores. (ddfa555f)

### Decisiones (ADR)
- ADR-0104 — Aritmética nativa en lugar de decimal.js para el fallback de commissionExpected [Supuesto del agente] **⚠ REVISAR**
- ADR-0105 — Tests del router como nuevo archivo, no extendiendo cartera-tab-commission [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0038/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-08-28 — F-0039 completado

## Feature F-0039

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En src/features/portfolio/components/MobilePositionsList.jsx, bloque de featuredPositions (~línea 208-213): agregar el cálculo `const dailyPct = currency === 'ARS' ? pos.dailyResultPct : pos.dailyResultPctUSD;` siguiendo exactamente el patrón de la línea 50. No borrar `result` ni `resultPct` (siguen en uso en otros lugares del botón). (32c6a69d)
- [x] Step 2: En el render de featuredPositions (~línea 241-247), cambiar el <span> pegado al MiniSpark para que use `dailyPct` como número Y como signo del color (TEAL/CORAL). Cuando `dailyPct == null` (null/undefined), mostrar '—' con la clase de texto atenuado ya usada en el archivo (ej. text-ink-faint), sin +0,0% ni colores nuevos. (655ae89c)
- [x] Step 3: En el bloque de la lista agrupada `group.visibleItems` (~línea 336-341), agregar el mismo cálculo de `dailyPct` con idéntico patrón que en featuredPositions. (655ae89c)
- [x] Step 4: En el render de group.visibleItems (~línea 371-377), aplicar exactamente el mismo cambio de <span> que en featuredPositions (dailyPct como número y signo del color; '—' + texto atenuado cuando es null/undefined). Verificar que ambos bloques queden visualmente idénticos entre sí. (655ae89c)
- [x] Step 5: Revisar en ambos bloques si `result` o `resultPct` quedaron sin uso tras el cambio; eliminar cualquier variable muerta para dejar el lint limpio, sin tocar PositionDetailSheet ni el resto de vistas fuera de alcance. (adccc233)
- [x] Step 6: Correr typecheck, lint y tests; corregir cualquier error que rompa el cambio. (adccc233)

### QA
Screenshots en `orchestrator/qa-artifacts/F-0039/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-08-31 — F-0042 completado

## Feature F-0042

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En orchestrator/src/executor.ts, reemplazar la constante RESTRICCIONES_ABSOLUTAS por una función pura exportada `buildRestriccionesAbsolutas(dbModel: 'prisma' | 'none' | undefined): string`. Las cuatro líneas comunes (no correr SQL destructivo, no deployar a Vercel, no tocar main/mutuo/pagaré, TNA nunca visible al prestatario) van fijas y en el mismo orden actual; el bloque de DB se elige según el modelo: caso 'prisma' (y undefined vía default 'prisma') byte a byte idéntico al texto de hoy (camelCase sin @map, leer prisma/schema.prisma, no consultar DB en vivo), caso 'none' con el equivalente Supabase (nunca aplicar SQL de supabase/migrations/ a mano, leer esos .sql para conocer el schema en vez de consultar la base en vivo). (f8f4b9c5)
- [x] Step 2: Migrar el call site del builder en buildPrompt (executor.ts): reemplazar la interpolación de RESTRICCIONES_ABSOLUTAS por una llamada a buildRestriccionesAbsolutas(getTargetConfig().dbModel), reusando el getTargetConfig() que la función ya invoca, sin threadear parámetros nuevos. (f8f4b9c5)
- [x] Step 3: Migrar el fixer de escalación en orchestrator/src/escalation.ts: reemplazar el import y la interpolación de RESTRICCIONES_ABSOLUTAS en buildFixerPrompt por buildRestriccionesAbsolutas resolviendo el dbModel del target activo con getTargetConfig(), de modo que la escalación reciba exactamente las mismas restricciones que el builder para el mismo target. (f8f4b9c5)
- [x] Step 4: Migrar el bloque inline 'RESTRICCIONES ABSOLUTAS DEL DOMINIO' de orchestrator/src/reviewer.ts (~líneas 62-64) para que reuse buildRestriccionesAbsolutas con el dbModel del target activo (getTargetConfig()), eliminando el texto duplicado y sus menciones a Prisma hardcodeadas. (bc9143da)
- [x] Step 5: Crear tests unitarios vitest para buildRestriccionesAbsolutas: caso 'prisma' comparado contra el string esperado fijado como fixture (idéntico al actual), caso 'none' verificando que no aparecen menciones a Prisma y sí las de Supabase, caso undefined igual al de 'prisma', y una aserción de que las cuatro líneas comunes están presentes en los tres casos. (bc9143da)
- [x] Step 6: Correr typecheck, lint y la suite completa de vitest de orchestrator/ (incluyendo escalation.test.ts y reviewer.test.ts que capturan el prompt), y corregir cualquier fixture o aserción que rompa por el cambio de constante a función. (bc9143da)

### QA
Screenshots en `orchestrator/qa-artifacts/F-0042/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-03 — F-0041 completado

## Feature F-0041

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En app/dashboard/simulator/page.tsx importar useToast (o toast) desde @/hooks/use-toast y useRouter desde next/navigation, revisando primero para no duplicar imports existentes. Instanciar el hook de toast y const router = useRouter() en el componente. Sin cambios de comportamiento todavía, solo dejar las utilidades disponibles. (179e4bc4)
- [x] Step 2: Modificar createLoanMutation.onSuccess: capturar el nombre del prestatario ANTES de limpiarlo (usando el argumento variables del callback o una const previa a setBorrowerName('')), disparar un toast de creación que mencione qué se creó y para quién (sin TNA ni tasa), cerrar el modal, limpiar el nombre y navegar a /dashboard/loans con router.push. Mantener el disabled del submit que incluye isSuccess. (8278175d)
- [x] Step 3: Modificar preApproveMutation.onSuccess: mismo patrón que creación pero con un texto de toast explícito y distinto que indique que el préstamo quedó PREAPROBADO (incluyendo el nombre del prestatario, sin tasa), cerrar el modal, limpiar el nombre, mantener setIsPreApprove(false) y navegar a /dashboard/loans con router.push. (41cf5117)
- [x] Step 4: Eliminar el bloque de mensaje de éxito inline (createLoanMutation.isSuccess || preApproveMutation.isSuccess) que quedó inalcanzable dentro del form, dejando intacto el bloque de error inline que sí se ve cuando la mutation falla. Verificar que en caso de error no haya redirect ni toast de éxito y que el modal quede abierto con los datos. (0b7aaa03)
- [x] Step 5: Agregar/extender los tests del simulador siguiendo el patrón del proyecto para mockear next/navigation y el hook de toast: (a) éxito de creación dispara toast y navegación a /dashboard/loans; (b) éxito de preaprobación dispara el toast con texto distinto de preaprobado y navega; (c) error no navega ni muestra toast de éxito y el modal permanece abierto. Correr typecheck, lint y tests y corregir lo que rompa. (69f844c8)

### Decisiones (ADR)
- ADR-0106 — Orden de operaciones en onSuccess: cerrar → limpiar → toast → push [Supuesto del agente] **⚠ REVISAR**
- ADR-0107 — Texto del toast de preaprobación menciona instrucción de confirmación futura [Supuesto del agente] **⚠ REVISAR**
- ADR-0108 — Testear el contrato de error sobre las opciones de mutation, no renderizando el componente [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0041/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-03 — F-0040 completado

## Feature F-0040

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En app/ap/page.tsx agregar estado local para el modo de plazo custom: un booleano `useCustomTerm` y el valor crudo del input `customTermMonths` (string, para distinguir vacío de 0), siguiendo exactamente el patrón/nomenclatura ya usado para la tasa custom (`useCustomRate` / `customGrossTna` ~línea 426). Sin cambios de render todavía. (e61bd505)
- [x] Step 2: En app/ap/page.tsx derivar el plazo efectivo: cuando `useCustomTerm` está activo, parsear `customTermMonths` y validar entero entre 1 y 360; si es válido usarlo como `selectedTermMonths`, si es inválido o vacío no actualizar el plazo efectivo. Asegurar que `grossTnaForTerm(selectedTermMonths)` y `simulateMut.mutateAsync({ termMonths: selectedTermMonths, ... })` sigan recibiendo el plazo efectivo por el camino normal, sin ninguna rama especial para el custom. (bda4f45c)
- [x] Step 3: En app/ap/page.tsx agregar el botón "Otro" al final de la grilla de plazos (después del map de config.terms), respetando las clases visuales existentes (bg-blue-600/20, border-blue-500/50 para activo; bg-white/3, border-white/8 para inactivo). El botón se ve seleccionado cuando `useCustomTerm` está activo. Al tocarlo activa el modo custom y revela debajo de la grilla un input numérico con el mismo sistema visual de la pantalla. (bda4f45c)
- [x] Step 4: En app/ap/page.tsx cablear las transiciones de estado: tocar cualquier preset sale del modo custom y limpia `customTermMonths`; tocar "Otro" entra al modo custom. Deshabilitar el botón de simular mientras el plazo custom sea inválido/vacío y mostrar un mensaje corto del motivo, con el mismo tono y estilo de los mensajes de error ya presentes; garantizar que no se dispare ninguna mutation con un valor fuera de rango. (e933be23)
- [x] Step 5: Agregar tests de la lógica de validación del plazo custom (entero, rango 1-360, string vacío, valores fuera de rango que deshabilitan simular) siguiendo el estilo de los tests existentes del router/UI de AP, y correr typecheck, lint y tests corrigiendo lo que rompa. (ac29ce6f)

### Decisiones (ADR)
- ADR-0109 — Incluir UI del input de plazo custom en step 2 [Supuesto del agente] **⚠ REVISAR**
- ADR-0110 — Visibilidad derivada del resultado en modo plazo custom en lugar de nulear simulation [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0040/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-04 — F-0044 completado

## Feature F-0044

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En components/loans/loans-table-view.tsx, dentro del map de la tabla principal (donde ya se calculan status, isOverdue, etc.), derivar `const canDelete = loan.status !== 'defaulted' && loan.status !== 'completed' && loan.paidCount === 0`. Sin cambios visuales todavía, solo la variable derivada por fila. (aa2b4048)
- [x] Step 2: En components/loans/loans-table-view.tsx, agregar un estado local de confirmación de borrado por fila (patrón `showDeleteConfirm` con useState, copiado de pre-approved-loan-card.tsx) que permita alternar entre el ícono Trash2 y el par de botones confirmar/cancelar, sin cablear todavía la mutation. (38e8f315)
- [x] Step 3: En la celda 'Acciones' de components/loans/loans-table-view.tsx, cuando `canDelete` sea true, renderizar la acción de borrar (ícono Trash2 → confirmar/cancelar inline) junto al botón 'Registrar cobro' existente, usando el mismo estilo/tokens que pre-approved-loan-card.tsx y aplicando e.stopPropagation() en los clicks para no disparar el onSelect del TableRow. (a9984817)
- [x] Step 4: En components/loans/loans-table-view.tsx, al confirmar el borrado cablear la acción a la `deleteMutation` ya existente (línea ~130, reusar la misma instancia) pasando el `id` del préstamo; que la lista se refresque/invalide sin recargar la página siguiendo el patrón ya usado por PreApprovedLoanCard. (a9984817)
- [x] Step 5: En components/loans/loans-table-view.tsx, mostrar el error de deleteMutation cuando falle, reusando el mismo estilo de texto de error ya presente en el archivo o en pre-approved-loan-card.tsx, asegurando que la fila NO desaparezca ante un error. No introducir texto que muestre TNA/tasa en los mensajes. (54235257)
- [x] Step 6: Agregar/extender tests del componente loans-table-view: la acción de borrar aparece solo cuando paidCount === 0 y status no es 'defaulted' ni 'completed'; al confirmar dispara loans.delete con el id correcto; y un error de la mutation no elimina la fila. Seguir el patrón de tests existentes para este componente. (02abc9d0)
- [x] Step 7: Correr typecheck, lint y la suite de tests, y corregir cualquier error que surja de los cambios. (02abc9d0)

### Decisiones (ADR)
- ADR-0111 — Un solo `deleteConfirmId` compartido vs. Set<string> por fila [Supuesto del agente] **⚠ REVISAR**
- ADR-0112 — Extracción de lógica de borrado para testabilidad en entorno node [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0044/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-04 — F-0043 completado

## Feature F-0043

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear un servicio o helper de acceso a datos para la tabla `user_strategy_targets` (p.ej. `src/features/portfolio/services/strategyTargetsService.js`) con dos funciones usando el cliente `supabase` de `@/lib/supabase`: `getStrategyTargets(userId)` que hace `supabase.from('user_strategy_targets').select('targets').eq('user_id', userId).maybeSingle()` y devuelve `DEFAULT_TARGETS` ({core1:50, core2:30}) si no hay fila o falla; y `saveStrategyTargets(userId, targets)` que hace `upsert` de `{ user_id, targets }`. Exportar tambien la constante DEFAULT_TARGETS desde aca. No tocar la forma del objeto ({core1, core2}). (75fc8a38)
- [x] Step 2: Agregar soporte de `user_strategy_targets` al `mockClient` de desarrollo en `src/lib/supabase.ts` (o `.js`) para que en modo bypass_auth/dev las llamadas a `select`/`upsert`/`maybeSingle` sobre esa tabla no caigan al fallback vacio y no rompan la pantalla; devolver DEFAULT_TARGETS como fila mockeada. (f53a29f9)
- [x] Step 3: Crear el hook `src/features/portfolio/hooks/useStrategyTargets.js` que use `useAuth()` de `@/features/auth/contexts/AuthContext` para obtener `user.id`. Al montar (si hay user.id) hace fetch via `getStrategyTargets`; expone `{ targets, setTargets, loading, saveError }`. `setTargets` actualiza el estado local de inmediato (UI optimista) y dispara `saveStrategyTargets`; si falla, setea `saveError` sin revertir el valor local. Manejar el caso sin sesion (user null): no disparar fetch/upsert, usar DEFAULT_TARGETS y no loguear errores no controlados. (a2d5915a)
- [x] Step 4: Reemplazar en `src/features/portfolio/components/strategy/StrategyTab.jsx` el `useState`/`useEffect` basados en localStorage (lineas 7-21, incluyendo `TARGETS_KEY` y `localStorage.getItem/setItem`) por el hook `useStrategyTargets`. Pasar `targets` y `setTargets` (como `onChangeTargets`) a `<TargetAllocation>` sin cambiar su interfaz. No dejar los dos mecanismos conviviendo. (0d161c96)
- [x] Step 5: En `StrategyTab.jsx`, mostrar el estado `loading` inicial mientras se resuelve el fetch desde DB, reutilizando un `Skeleton`/spinner ya existente en `src/components/ui` (buscar antes de crear uno nuevo), para evitar el parpadeo default→valor real. (fc603b4f)
- [x] Step 6: En `StrategyTab.jsx`, cuando `saveError` este seteado, mostrar un aviso corto y no bloqueante siguiendo el tono/estilo de los mensajes de error ya usados en la UI de Argos (nada de `alert()`/`confirm()`). (4eeece30)
- [x] Step 7: Agregar tests para `useStrategyTargets` (o el servicio + hook) mockeando `supabase.from` con el patron ya usado en tests existentes del proyecto: (a) fetch inicial devuelve la fila guardada; (b) sin fila usa DEFAULT_TARGETS; (c) editar dispara upsert con el `user_id` correcto; (d) upsert fallido no revierte el valor local y expone `saveError`. (43070158)
- [x] Step 8: Correr typecheck, lint y tests, y corregir lo que rompa sin cambiar la forma del objeto `targets` ni tocar la RLS/tablas. (43070158)

### Decisiones (ADR)
- ADR-0113 — upsert con supabase directo en vez de supabaseFetch [Supuesto del agente] **⚠ REVISAR**
- ADR-0114 — Tests sobre el servicio en lugar del hook [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0043/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-04 — F-0045 completado

## Feature F-0045

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En lib/identity/resolvePerson.ts, extender el tipo de opts de resolvePersonByIdentity con relationship?: 'amigo' | 'amigo_de_amigo' | 'conocido' | null y referrer?: string | null; en la rama if (create) (líneas ~97-104) pasar relationship: opts.relationship ?? undefined y referrer: opts.referrer ?? undefined a db.person.create, dejando que el default de schema 'conocido' se aplique cuando no se pasa nada. No cambiar el comportamiento de ningún otro caller. (7bad92d4)
- [x] Step 2: En server/routers/ap.ts, agregar al input de la mutation preApprove (líneas 348-360) relationship: z.enum(['amigo', 'amigo_de_amigo', 'conocido']).optional() y referrer: z.string().max(200).optional(), sin .default(), para poder distinguir 'no eligió nada' de un valor. (fba9438a)
- [x] Step 3: En server/routers/ap.ts, dentro de la transacción de preApprove (llamada a resolvePersonByIdentity, línea ~544), pasar relationship: input.relationship y referrer: input.referrer || undefined. No tocar la rama de resolvePerson (identity.service.ts), que nunca crea la Person. (41f4dcd3)
- [x] Step 4: En app/ap/page.tsx, agregar relationship y referrer (ambos opcionales) a la interfaz ClientData (línea 97) y al estado inicial de clientData (línea 375). Pasar ambos valores en la llamada a preApproveMut.mutateAsync (línea ~475-481). (68d404c3)
- [x] Step 5: En app/ap/page.tsx, en el paso confirm (después del input de cbu, antes del botón 'Pre-aprobar', ~línea 830), agregar los dos campos nuevos como sección claramente opcional: un Select de relación (Amigo / Amigo de amigo / Conocido) y un input de texto libre para 'Quién lo refiere', con un subtítulo tipo '¿Conocés a este cliente? (opcional)', usando el estilo oscuro custom del paso (bg-white/5 border border-white/10 rounded-2xl). Actualizar el copy 'Solo necesito 3 datos' si hace falta para que siga siendo honesto con 3 obligatorios + 2 opcionales. (1a7ee2be)
- [x] Step 6: Agregar/extender tests en resolvePersonByIdentity: (a) Person nueva sin relationship/referrer en el input se sigue creando con los defaults (conocido/null, sin regresión); (b) Person nueva CON relationship/referrer en el input los persiste tal cual. Reutilizar los mocks de Prisma/tx existentes. (4d5f2fbb)
- [x] Step 7: Agregar/extender tests en ap.preApprove: una Person que ya existía (matcheada por CUIL) mantiene su relationship/referrer original sin importar qué mande el AP en el input nuevo (nunca se sobreescribe). Reutilizar el patrón de mock de Prisma/tx de los tests existentes (tests/ap-*.test.ts, tests/debtor-exposure-cross-ap.test.ts) antes de inventar un mock nuevo. (aea605d8)
- [x] Step 8: Correr typecheck, lint y tests, y corregir lo que rompa. (aea605d8)

### Decisiones (ADR)
- ADR-0115 — Tipo de `relationship` en `ClientData` como union literal en lugar de `string` [Supuesto del agente] **⚠ REVISAR**
- ADR-0116 — Sección opcional como tarjeta separada, no inline con los campos obligatorios [Supuesto del agente] **⚠ REVISAR**
- ADR-0117 — Testear las dos funciones helper en lugar del router preApprove directamente [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0045/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-07 — F-0046 completado

## Feature F-0046

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/features/fci/services/mercadoService.js`, agregar un parámetro `groupByFund` (default true) a `getFondosPage` que seleccione `.from('fci_explorador_grupos')` cuando está activo y `.from('fci_explorador')` cuando no, reutilizando el mismo builder de filtros/orden/paginación sin duplicar lógica. (2c827fd3)
- [x] Step 2: En `src/features/fci/services/fciService.js` / constants, exponer/normalizar los campos nuevos de la vista agrupada (`fondo_base`, `n_clases`, `clases_hermanas`) para que el consumidor los reciba tipados y con shape consistente con la vista plana. (4179dc08)
- [x] Step 3: En `FciExplorador.jsx`, agregar el toggle 'Ver 1 clase por fondo' (on por defecto) cerca de los filtros existentes de moneda/categoría/gestora, guardarlo en estado y pasarlo a `loadPage`/`getFondosPage` como `groupByFund`. (60aa2d19)
- [x] Step 4: En `FciExplorador.jsx`, implementar la fila expandible: cuando `groupByFund` está activo y `n_clases > 1`, mostrar un control chevron que expande y lista `clases_hermanas` (nombre + TNA) sin repetir el resto de las columnas; reutilizar cualquier patrón de expandible ya existente en el proyecto antes de crear uno nuevo. (2e2e334d)
- [x] Step 5: Agregar tests para `getFondosPage({ groupByFund: true })` que verifiquen que apunta a `fci_explorador_grupos` y que `groupByFund: false` apunta a `fci_explorador`, y que los filtros de moneda, clasificación, gestora y búsqueda se aplican igual en ambos modos. (bf260055)
- [x] Step 6: Correr typecheck y la suite de tests, y dejar el árbol limpio de errores de lint/typecheck. (bf260055)

### Decisiones (ADR)
- ADR-0118 — Default de groupByFund = true (vista agrupada por defecto) [Instrucción de Augusto]
- ADR-0119 — normalizeFondo va en mercadoService, no en fciService [Supuesto del agente] **⚠ REVISAR**
- ADR-0120 — clases_hermanas excluye la clase representativa (no incluye todas) [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0046/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-08 — F-0047 completado

## Feature F-0047

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En src/features/fci/services/mercadoService.js, agregar un helper `getLatestUniverseDate()` que consulte a Supabase la fecha hábil más reciente del universo de fondos activos (MAX sobre la fecha de último precio / rend_updated_at expuesta por las vistas), calculada dinámicamente y nunca hardcodeada; devolver la fecha normalizada y manejar el caso sin datos (null). (80bb3dc2)
- [x] Step 2: En src/features/fci/constants.js, exportar la constante de criterio de stale (p. ej. flag `EXCLUDE_STALE_DEFAULT` y el nombre del campo de fecha de último precio usado para comparar) para no duplicar strings mágicos entre service y tests, reutilizando el shape existente sin tocar FCI_GRUPO_DEFAULTS/FCI_CLASIFICACION. (59bf69b2)
- [x] Step 3: En `getFondosPage` de mercadoService.js, agregar el parámetro `excludeStale` (default true) que, usando la fecha del universo del helper, filtre en la query paginada las clases cuyo último precio no coincida con esa fecha; aplicar el filtro de forma coordinada con el parámetro `groupByFund` existente (F-0046) para ambos modos plano/agrupado, manteniendo eq/or/sort/range y que el conteo total y las páginas reflejen el universo ya filtrado (sin fondos fantasma ni offsets rotos). (6bf54bc0)
- [x] Step 4: Asegurar que 1D/7D/30D/TNA y los placeholders de YTD/1Y (cuando rend_ytd/rend_1y son NULL) sigan comportándose exactamente igual tras el filtro: no recalcular YTD/1Y client-side; verificar que normalizeFondo siga produciendo el shape canónico para las filas ya filtradas. (84391aa5)
- [x] Step 5: En src/pages/FciExplorador.jsx, cablear el ranking curado: pasar `excludeStale: true` a `getFondosPage` para que el listado excluya (no marque) los cierres stale por defecto, respetando el toggle 'Ver 1 clase por fondo' ya existente y sin agregar queries directas en el componente. (a230a08b)
- [x] Step 6: Agregar tests en src/features/fci/services/__tests__ (extendiendo mercadoService.getFondosPage.test.js y/o un nuevo test del helper): (a) un fondo con último precio desactualizado no aparece en el resultado; (b) con `groupByFund: true`, un fondo cuya clase default sería stale pero tiene una clase hermana fresca queda representado por la hermana fresca y no desaparece; (c) la paginación (conteo total y cantidad de páginas) refleja el universo ya filtrado; (d) `getLatestUniverseDate` calcula la fecha máxima dinámicamente. (120bdba2)
- [x] Step 7: Correr typecheck y la suite de tests (vitest) y dejar todo verde, corrigiendo cualquier error de lint/tipos introducido por los pasos anteriores. (120bdba2)

### Decisiones (ADR)
- ADR-0121 — Fuente de MAX(rend_updated_at): fci_explorador en lugar de fci_explorador_grupos [Supuesto del agente] **⚠ REVISAR**
- ADR-0122 — getLatestUniverseDate invocado vía mercadoService (no supabase inline) para habilitar spy en tests [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0047/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-09 — F-0053 completado

## Feature F-0053

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear `fci_parser.py` con `parse_pdf(path) -> list[dict]` usando pdfplumber (reusar el patrón de extract_text/parse_money/parse_date de `cauciones_parser.py`). Extraer de la sección 'Resumen de Movimientos' cada movimiento liquidado, emparejando cada línea 'Solicitud de suscripción/rescate de FCI' con su 'Liquidación de suscripción/rescate' siguiente por comprobante DOC→CL cercano en el mismo bloque de subcuenta; saltear solicitudes sin línea CL. Devolver por movimiento {tipo: 'suscripcion'|'rescate', cafci_id: int (número tras el guion en CAFCI<n>-<cafci_id>), fecha: date, comprobante: str (ej 'CL 2026007601'), cuotapartes: Decimal, vcp: Decimal, monto: Decimal}. (af998916)
- [x] Step 2: Crear `fci_sync.py` clonando la estructura de `sync_cauciones.py`: reusar `env()`, `sb_headers()`, patrón `--mode daily|backfill`, ventana DAYS_BACK y la lógica IMAP de descarga de adjuntos, pero con constante de asunto exacto 'Informe Semanal de Operaciones', remitente `alycbur.report@gmail.com` y filtro de adjunto `Resumen-Completo_*.pdf`. Pasar el PDF descargado a `fci_parser.parse_pdf`. Reusar las mismas env vars existentes (GMAIL_USER, GMAIL_APP_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_KEY, ARGOS_USER_ID, ARGOS_PORTFOLIO_ID, TELEGRAM_*), sin inventar nuevas. (3f9b1699)
- [x] Step 3: Implementar en `fci_sync.py` la resolución de `fci_id`: por cada movimiento hacer `GET .../fci_master?cafci_id=eq.<n>&select=id`; si no hay match, loguear `[fci-sync] WARNING: cafci_id <n> sin match en fci_master, salteando movimiento <comprobante>` y saltear ese movimiento sin abortar el resto de la corrida. (46ff81a7)
- [x] Step 4: Implementar en `fci_sync.py` el upsert idempotente de suscripciones a `fci_lots` vía POST PostgREST con `Prefer: resolution=merge-duplicates` y `on_conflict=external_ref`, payload {user_id, portfolio_id, fci_id, fecha_suscripcion: fecha, vcp_entrada: vcp, cuotapartes, capital_invertido: monto, activo: true, tipo: 'portfolio', external_ref: comprobante}. Nunca escribir una fila sin `external_ref` seteado. (1e531183)
- [x] Step 5: Implementar en `fci_sync.py` el upsert idempotente de rescates a `fci_rescates` vía POST PostgREST con `Prefer: resolution=merge-duplicates` y `on_conflict=external_ref`, payload {user_id, portfolio_id, fci_id, fecha_rescate: fecha, cuotapartes, vcp_salida: vcp, monto_rescatado: monto, mutations: [], external_ref: comprobante}. Dejar `mutations` siempre en `[]` (intencional, no calcular FIFO/PPC) y nunca escribir sin `external_ref`. (2ea7121d)
- [x] Step 6: Agregar a `fci_sync.py` el etiquetado Gmail de mails procesados reusando la lógica de `mark_processed()` de `sync_cauciones.py` (extraerla a un módulo compartido `gmail_common.py` o duplicarla), usando una label propia (ej. 'FCI Sync Processed') para no reprocesar UIDs ya vistos. (4989c1c9)
- [x] Step 7: Agregar a `fci_sync.py` la notificación por Telegram (mismo bot/formato que `sync_cauciones.py`) con el resumen de la corrida: cantidad de suscripciones y rescates nuevos sincronizados y cuántos movimientos se saltaron por fondo no reconocido. (2cbba70b)
- [x] Step 8: Crear `.github/workflows/fci-sync.yml` (archivo nuevo, sin tocar `cauciones.yml`) que corra `python fci_sync.py --mode daily` con un cron adecuado y `workflow_dispatch`, pasando los mismos secrets que `cauciones.yml` (GMAIL_USER, GMAIL_APP_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_KEY, ARGOS_USER_ID, ARGOS_PORTFOLIO_ID, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) como env. (d23b86a2)
- [x] Step 9: Agregar `pytest` a un `requirements-dev.txt` nuevo (no a `requirements.txt`) y crear tests para `fci_parser.parse_pdf` usando un fixture PDF real en `tests/fixtures/`, cubriendo: extracción correcta de una suscripción, extracción correcta de un rescate, y un movimiento cuyo código CAFCI no matchea ningún `fci_master.cafci_id` (debe loguearse y no romper el parseo del resto). (7c6468a9)

### Decisiones (ADR)
- ADR-0123 — Orden de columnas en línea de liquidación (cuotapartes → vcp → monto) [Supuesto del agente] **⚠ REVISAR**
- ADR-0124 — Matching FIFO sin verificar tipo (suscripcion vs rescate) [Supuesto del agente] **⚠ REVISAR**
- ADR-0125 — parse_money devuelve Decimal (no float como en cauciones_parser) [Supuesto del agente] **⚠ REVISAR**
- ADR-0126 — DAYS_BACK = 10 para el modo daily semanal [Supuesto del agente] **⚠ REVISAR**
- ADR-0127 — on_conflict en upsert usa (user_id, portfolio_id, external_ref) [Supuesto del agente] **⚠ REVISAR**
- ADR-0128 — resolve_fci_id con caché por cafci_id, no por movimiento [Supuesto del agente] **⚠ REVISAR**
- ADR-0129 — `on_conflict=external_ref` aplicado también a `upsert_rescates` [Supuesto del agente] **⚠ REVISAR**
- ADR-0130 — No extraer gmail_common.py: la duplicación ya existía y tocar sync_cauciones.py está fuera de alcance [Supuesto del agente] **⚠ REVISAR**
- ADR-0131 — Cron semanal lunes 09:00 UTC para fci-sync [Supuesto del agente] **⚠ REVISAR**
- ADR-0132 — PDFs de fixture generados en conftest, no commiteados [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0053/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-09 — F-0055 completado

## Feature F-0055

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En fci_parser.py, identificar el header/texto que delimita el inicio de la seccion 'Fondos de Inversion' y restringir parse_pdf() para que arranque a extraer movimientos solo desde ahi, descartando las menciones sueltas de Liquidacion que aparecen en el resumen general de arriba (zona sin Subcuenta/Comitente). (281bf5ce)
- [x] Step 2: En parse_pdf(), agregar la validacion de tipo en el emparejamiento Solicitud->Liquidacion: comparar liq_m.group(1) contra pending['tipo'] antes de agregar el movimiento; si difieren, loguear '[fci-parser] WARNING: tipo mismatch en <comprobante> -- Solicitud dice <X>, Liquidacion dice <Y>, salteando' y NO agregar ese movimiento a results. (bd6b70a0)
- [x] Step 3: En parse_pdf(), agregar deduplicacion por comprobante (external_ref) antes de retornar results: detectar comprobantes repetidos con valores de cuotapartes/vcp/monto distintos, loguear WARNING, y quedarse con una unica fuente de verdad por comprobante (la de la seccion Fondos de Inversion) como chequeo de seguridad redundante. (236bb4bd)
- [x] Step 4: En conftest.py, agregar una fixture que genere un PDF sintetico (mismo patron que F-0053/ADR-0132, sin datos reales) reproduciendo la estructura del PDF real: una mencion suelta de Liquidacion de un tipo en una zona sin Subcuenta/Comitente, seguida mas abajo por la seccion Fondos de Inversion con el par Solicitud/Liquidacion correcto del otro tipo. (0f1a511e)
- [x] Step 5: Agregar test que use esa fixture y verifique que parse_pdf() (a) no devuelve ningun comprobante repetido con montos distintos, (b) devuelve el tipo que declara la propia linea de Liquidacion de la seccion Fondos de Inversion, y (c) descarta la mencion suelta del resumen general de arriba. (b3a1fc3f)
- [x] Step 6: Agregar test especifico para el bug de tipo mismatch: cuando el tipo de la Solicitud difiere del de la Liquidacion emparejada, parse_pdf() no agrega el movimiento y emite el WARNING esperado. (cd64de25)
- [x] Step 7: Correr typecheck y la suite de tests completa, y corregir cualquier error hasta que pasen sin errores. (cd64de25)

### Decisiones (ADR)
- ADR-0133 — Anchor de corte: prefijo "fondos de inver" en vez del texto exacto con acento [Supuesto del agente] **⚠ REVISAR**
- ADR-0134 — Deduplicación silenciosa para comprobantes con valores idénticos [Supuesto del agente] **⚠ REVISAR**
- ADR-0135 — Fixture de F-0055 usa par Solicitud/Liquidacion en el resumen general, no una Liquidacion suelta [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0055/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-10 — F-0054 completado

## Feature F-0054

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En src/features/fci/services/fciService.js, refactorizar applyRedemptionPPC y applyRedemptionFIFO para extraer una función interna compartida (ej. computeAndApplyLotConsumption(portfolioId, fciId, cuotapartes, tipo, method)) que calcule el consumo de lotes con decimal.js, actualice fci_lots activas y devuelva el array de mutations, SIN insertar en fci_rescates. Ambas funciones existentes deben seguir comportándose igual (insertando su fila como hoy) reusando esta función; mantener la validación de excedente de PPC y agregar la misma validación de saldo insuficiente al camino FIFO para que también lance error en vez de aplicar consumo parcial. (756430f7)
- [x] Step 2: En src/features/fci/services/fciService.js, agregar applyPendingRescate(rescateId, method = 'PPC'): lee la fila de fci_rescates por id, valida que mutations esté vacío (y external_ref no-null), corre la función compartida de consumo del paso anterior contra fci_id/cuotapartes/tipo de esa fila, y hace UPDATE de esa MISMA fila seteando mutations con el resultado — nunca un insert nuevo. Si el saldo activo no alcanza, propagar el error sin tocar fci_lots ni la fila. (0a229e32)
- [x] Step 3: En src/features/fci/services/fciService.js, agregar getPendingRescates(portfolioId): consulta fci_rescates donde external_ref no es null y mutations es un array vacío (usar la sintaxis correcta de supabase-js para jsonb según la versión instalada; filtrar client-side si hace falta), con join a fci_master para nombre/moneda/sociedad_gerente, devolviendo fecha, cuotapartes, vcp_salida, monto_rescatado y fci_id. (bd740c7d)
- [x] Step 4: En src/features/fci/hooks/useFciLotEngine.js, exponer los pendientes y la acción: cargar getPendingRescates en el estado (junto al load existente de lotes/rescates) y agregar applyPending(rescateId, method) que envuelve fciService.applyPendingRescate, refresca lotes/rescates/pendientes al terminar y propaga el error de saldo insuficiente para que la UI pueda mostrarlo. (dd51bfd6)
- [x] Step 5: Agregar una sección/alert 'Rescates detectados pendientes de aplicar' en la UI de FCI (arriba de la tabla de lotes/rescates existente, siguiendo el patrón visual de alerts/pendientes ya usado en Argos), que se renderiza SOLO cuando hay al menos un pendiente. Cada fila muestra nombre del fondo, fecha, cuotapartes, vcp_salida y monto_rescatado, con un botón 'Aplicar' por fila que llama a applyPending, maneja estado de carga, y muestra el error de cuotapartes insuficientes de forma clara (inline o toast según el patrón existente). No mostrar TNA/tasa en copy nuevo. (b1bc633e)
- [x] Step 6: Agregar tests en src/features/fci/services/__tests__ para: (a) applyPendingRescate con lotes activos suficientes puebla mutations igual que un rescate nuevo con los mismos parámetros y actualiza fci_lots igual; (b) caso de cuotapartes insuficientes lanza error y NO modifica ningún lote ni la fila; (c) getPendingRescates no devuelve rescates cargados a mano (mutations ya poblado). Correr typecheck y tests y corregir lo que rompa. (1576cb85)

### Decisiones (ADR)
- ADR-0136 — Validación FIFO antes del loop, no después [Supuesto del agente] **⚠ REVISAR**
- ADR-0137 — `tipo` leído desde fci_rescates (columna de F-0053) [Supuesto del agente] **⚠ REVISAR**
- ADR-0138 — Filtro de mutations = [] aplicado client-side [Supuesto del agente] **⚠ REVISAR**
- ADR-0139 — Mock de Supabase con chain thenable único por llamada a `from()` [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0054/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-10 — F-0056 completado

## Feature F-0056

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En src/features/fci/services/fciService.js, dentro de applyPendingRescate, reemplazar el argumento `rescate.tipo` que se pasa a _consumeLots por el literal `'portfolio'`, y agregar un comentario explicando por qué (los rescates detectados por F-0053 salen del informe semanal de Alycbur = tenencia real del ALyC = contexto portfolio, nunca carry; fci_rescates no tiene columna `tipo`). (985870cc)
- [x] Step 2: En src/features/fci/services/__tests__/fciService.pendingRescates.test.js, quitar el campo inventado `tipo: 'portfolio'` del fixture PENDING_RESCATE para que refleje la forma real de la fila de fci_rescates. (985870cc)
- [x] Step 3: En src/features/fci/services/__tests__/fciService.pendingRescates.test.js, extender el mock de Supabase (makeChain) para capturar los argumentos pasados a .eq() sobre fci_lots, y agregar una aserción explícita que verifique que applyPendingRescate llama a .eq('tipo', 'portfolio') y NO con undefined. (810f1894)
- [x] Step 4: Verificar que getPendingRescates (fciService.js) no lea ni asuma una columna `tipo` en fci_rescates; si la lee, corregirlo para no depender de esa columna inexistente. No modificar si ya está correcto. (810f1894)
- [x] Step 5: Correr typecheck (tsc) y la suite de tests de vitest para confirmar que todo pasa sin errores. (810f1894)

### QA
Screenshots en `orchestrator/qa-artifacts/F-0056/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-10 — F-0048 completado

## Feature F-0048

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear un componente Tooltip accesible reutilizable en src/components/ui (soporta hover + focus por teclado, usa tokens argos-*, evita ser clipeado por overflow) y exportarlo desde src/components/ui/index.js. Debe recibir children (trigger) y un texto/contenido explicativo, y ser seguro ante errores de render (compatible con ErrorBoundary). (79779b31)
- [x] Step 2: En src/pages/FciExplorador.jsx, agregar un affordance de tooltip (icono Info/HelpCircle de lucide-react) junto al label 'TNA (30D)' dentro del componente SortHeader/su <span>, usando el Tooltip creado, con texto corto tipo 'TNA anualizada calculada sobre la variación de los últimos 30 días'. Verificar que el header sigue disparando toggleSort('tna') al hacer click y que el tooltip es accesible por teclado sin bloquear el onClick de ordenamiento. (e941c5ec)
- [x] Step 3: Correr typecheck, lint y la suite de tests; corregir cualquier error introducido por los cambios anteriores sin modificar el cálculo de TNA ni la capa de datos. (e941c5ec)

### Decisiones (ADR)
- ADR-0140 — Tooltip usa createPortal hacia document.body para escapar overflow-x-auto [Supuesto del agente] **⚠ REVISAR**
- ADR-0141 — Orden del icono HelpCircle entre label y ArrowUpDown [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0048/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-10 — F-0049 completado

## Feature F-0049

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En src/features/fci/services/mercadoService.js, agregar `getFondosStats(filtros)` que reciba los mismos filtros que getFondosPage (moneda, clasificacion_cod, sociedad_gerente, search) + el filtro stale (universeDate vía getLatestUniverseDate) y devuelva `{ total, tnaPromedio, mejorTna }` mediante una query agregada contra fci_explorador (o fci_explorador_grupos según groupByFund), replicando exactamente la misma cadena de .eq/.or/.gte que getFondosPage para no divergir de la tabla. (7e24ecf7)
- [x] Step 2: En src/features/fci/services/mercadoService.js (o un pequeño helper nuevo en features/fci/services), agregar `getUltimaCaucion()` de solo lectura que consulte la tabla `cauciones` con `.order('fecha_inicio', {ascending:false}).limit(1).maybeSingle()` y devuelva `{ tna, fecha }` a partir de tna_real (fallback tna_contrato), o `null` si no hay filas. No modificar financingService.getCauciones ni el módulo de Financiación. (d98f81ce)
- [x] Step 3: Construir un componente de franja de KPIs (p. ej. src/features/fci/components/ExploradorStatsBar.jsx) que reciba `{ total, tnaPromedio, mejorTna, caucion, loading }` y renderice 4 métricas usando KpiCard de src/components/ui (casing KpiCard.jsx). La métrica de caución debe etiquetarse honestamente como 'Tu última caución' (no 'en vivo' ni tasa de mercado), mostrar la fecha de la operación, y renderizar un estado vacío claro ('Sin cauciones registradas') cuando caucion es null, sin mostrar undefined/NaN. (10b2375b)
- [x] Step 4: En src/pages/FciExplorador.jsx, cablear los nuevos datos: invocar getFondosStats con los filtros activos (recalculando cuando cambian moneda, categoría, gestora o búsqueda) y getUltimaCaucion al montar; guardar los resultados en estado y renderizar <ExploradorStatsBar/> arriba de la tabla. Manejar estados de carga/error sin romper el render de la tabla existente. (10b2375b)
- [x] Step 5: En src/features/fci/services/__tests__/, agregar tests para getFondosStats (caso con filtros activos vs. sin filtros, verificando que la cadena de query replica la de getFondosPage) y para getUltimaCaucion (caso con caución existente y caso sin cauciones → null), mockeando el cliente de Supabase siguiendo el patrón de makeBuilder/vi.mock existente. (e0295575)
- [x] Step 6: Correr typecheck y la suite de tests (incluyendo mercadoService.getFondosPage.test.js para confirmar que no se rompieron las aserciones de la cadena fluente) y resolver cualquier error de lint/tipado introducido. (e0295575)

### Decisiones (ADR)
- ADR-0142 — KPIs del Explorador vía agregados PostgREST, no RPC [Supuesto del agente] **⚠ REVISAR**
- ADR-0143 — Fallback a tna_contrato vía select('*') en getUltimaCaucion [Supuesto del agente] **⚠ REVISAR**
- ADR-0144 — getFondosStats corre en Promise.all junto a getFondosPage [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0049/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-10 — F-0050 completado

## Feature F-0050

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En src/features/fci/services/mercadoService.js, agregar una función exportada (p. ej. getFondosCountByCategoria) que devuelva un conteo de fondos por clasificacion_cod respetando los filtros activos (moneda, sociedad_gerente, search) y el filtro stale. Debe reutilizar applyFondosFilters y getLatestUniverseDate, y seleccionar la vista según groupByFund (fci_explorador_grupos vs fci_explorador), igual que getFondosPage/getFondosStats. Preferir una sola query agrupada por clasificacion_cod si PostgREST lo permite sin RPC nuevo; si no, disparar N queries count-only en paralelo. Nunca traer todas las filas al cliente para contar. Devolver un shape estable tipo { [cod]: number } o array normalizado. (ad6808cf)
- [x] Step 2: En src/features/fci/services/__tests__/, agregar tests unitarios para getFondosCountByCategoria con mock de supabase: verificar que aplica la misma cadena de filtros que getFondosPage (moneda, gestora, search, stale), que respeta groupByFund seleccionando la vista correcta, que sin filtros opcionales no emite .eq/.or de más, y que los conteos reflejan combinaciones de filtros. Mantener consistencia con los contratos de los tests existentes de getFondosStats/getFondosPage. (9911de70)
- [x] Step 3: En src/pages/FciExplorador.jsx, reemplazar el array CATEGORIAS hardcodeado (5 entradas) por uno derivado de FCI_CLASIFICACION importado desde src/features/fci/constants.js, incluyendo un chip 'Todos' (valor null). No duplicar labels; iterar sobre el map como única fuente de verdad. Este paso solo prepara la fuente de datos de las opciones, sin cambiar aún el control visual. (fc1b7bf5)
- [x] Step 4: En src/pages/FciExplorador.jsx, agregar el estado y el efecto de carga de los conteos por categoría: invocar getFondosCountByCategoria dentro del mismo flujo reactivo (useCallback/useEffect) que ya recarga la data cuando cambian los filtros (moneda, gestora, búsqueda con su debounce, groupByFund, stale), guardando el resultado en estado local. Cuidar las dependencias para no generar loops de refetch. (42dfbb0f)
- [x] Step 5: En src/pages/FciExplorador.jsx, reemplazar el <select> de categoría por una fila de chips (uno por cada categoría de FCI_CLASIFICACION más 'Todos'), siguiendo el mismo patrón visual y de estado que el selector de moneda ARS/USD ya presente en la pantalla (~líneas 183-193). Cada chip debe mostrar el label + el contador entre paréntesis, setear clasificacion y resetear page=0 al clickear, y distinguir visualmente el chip activo con el mismo tratamiento (bg-primary/10 border-primary/40 text-primary) usado por el toggle de moneda. (28b3b092)
- [x] Step 6: Correr typecheck y la suite de tests (vitest) del proyecto y corregir cualquier error o test roto derivado de los cambios en mercadoService.js y FciExplorador.jsx hasta que todo pase sin errores. (28b3b092)

### Decisiones (ADR)
- ADR-0145 — Conteo por categoría vía GROUP BY implícito de PostgREST (single query) [Supuesto del agente] **⚠ REVISAR**
- ADR-0146 — `getFondosCountByCategoria` no acepta `clasificacion_cod` como filtro [Supuesto del agente] **⚠ REVISAR**
- ADR-0147 — Orden de las categorías en CATEGORIAS: natural del map vs. orden anterior [Supuesto del agente] **⚠ REVISAR**
- ADR-0148 — getFondosCountByCategoria dentro del Promise.all de loadPage, no en callback separado [Supuesto del agente] **⚠ REVISAR**
- ADR-0149 — Chips de categoría en fila separada, no inline en el filter strip [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0050/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-11 — F-0051 completado

## Feature F-0051

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En src/features/fci/components/, crear un componente de combobox de gestora buscable (input de texto + lista filtrable + selección + limpiar), reusando el patrón interno de FciSearchCombobox.jsx pero operando sobre una lista estática de gestoras pasada por props (los 63 valores de sociedad_gerente). No agregar librerías nuevas; seguir el estilo visual existente y aceptar props value/onChange/options. (323e5cbb)
- [x] Step 2: En src/pages/FciExplorador.jsx, reemplazar el <select> plano de gestora por el nuevo combobox buscable, poblándolo con las gestoras que ya provee mercadoService.getAdministradoras() (sin duplicar la fuente de datos). Mantener el estado 'administradora' y el reset de page a 0 al cambiar, y asegurar que el filtro siga pasando por sharedFilters/applyFondosFilters sin cambiar el contrato de servicios. (570c0b42)
- [x] Step 3: En src/pages/FciExplorador.jsx, agregar un contador de resultados visible ('N fondos encontrados') cerca de los filtros y arriba de la tabla, reusando el 'total' que ya devuelve getFondosPage (reflejando el total real, no solo la página actual). No introducir nuevas llamadas de servicio. (3e6317fd)
- [x] Step 4: En src/pages/FciExplorador.jsx, agregar un botón 'Limpiar filtros' que resetee moneda, clasificacion, administradora, searchInput/search y page a sus valores iniciales en un solo click, siguiendo los defaults existentes de cada estado. (267545a4)
- [x] Step 5: En src/pages/FciExplorador.jsx, agregar un texto de ayuda inline corto debajo del input de búsqueda explicando que se puede buscar por nombre o ticker, siguiendo el patrón visual/tipográfico ya usado en el explorador. (c455415f)
- [x] Step 6: Agregar/actualizar tests unitarios: cubrir el nuevo componente combobox de gestora (filtrado por texto y selección) y ajustar cualquier test de FciExplorador afectado. Verificar que typecheck, lint y la suite de vitest (incluyendo los tests existentes de mercadoService) pasen sin errores. (1d258012)

### Decisiones (ADR)
- ADR-0150 — GestoraCombobox cierra dropdown al seleccionar en vez de mantenerlo abierto [Supuesto del agente] **⚠ REVISAR**
- ADR-0151 — GestoraCombobox con filtrado client-side sobre lista pre-cargada [Supuesto del agente] **⚠ REVISAR**
- ADR-0152 — Botón limpiar filtros visible condicionalmente [Supuesto del agente] **⚠ REVISAR**
- ADR-0153 — Texto de ayuda como `<p>` estático en lugar de `Tooltip` con `HelpCircle` [Supuesto del agente] **⚠ REVISAR**
- ADR-0154 — Tests de GestoraCombobox como lógica pura (sin jsdom) [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0051/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-11 — F-0052 completado

## Feature F-0052

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En src/pages/FciExplorador.jsx, aplicar alineación tabular a las celdas numéricas: modificar los helpers pctCell y tnaCell (y los headers correspondientes) para usar font-variant-numeric tabular-nums (clase Tailwind `tabular-nums` o la clase `.num` definida en src/index.css) en las columnas 1D/7D/30D/YTD/1Y/TNA, reemplazando/complementando el font-mono actual para que los dígitos tengan igual ancho. (378c92bd)
- [x] Step 2: Agregar un helper subtractDays(n) (o reutilizar el existente en utils si ya hay uno) que devuelva la fecha ISO de hace n días, para acotar el rango de precios del sparkline a ~35 días. Ubicarlo en el módulo de utilidades de fechas del repo o inline en el servicio, exportado y con test unitario mínimo. (16c3a9c8)
- [x] Step 3: En FciExplorador.jsx, dentro de loadPage (o en un efecto que dispare tras cargar la página), tomar los ids de los fondos de la página actual y llamar a mercadoService.getPricesBatch(ids, subtractDays(35)); mapear el resultado a un objeto en estado { [fciId]: number[] } con los vcp ordenados por fecha ascendente. En modo agrupado, tomar la serie de la clase representativa (STALE_DATE_FIELD/rend_updated_at). Acotar SIEMPRE al universo visible de la página, no al total. (1f28213e)
- [x] Step 4: Agregar la columna 'Tendencia' a la tabla del Explorador: un nuevo <th> con el estilo de header del proyecto (text-[10px] font-bold uppercase tracking-wider text-ink-faint, no ordenable) y su celda <td> correspondiente en cada fila, ubicada de forma consistente con las demás columnas. (1f28213e)
- [x] Step 5: Renderizar en la celda 'Tendencia' el componente reutilizable Sparkline (importado de @/components/ui) con data={vcps del fondo} height={28}, eligiendo el color según el signo del rendimiento del período de referencia (mismo criterio profit/loss de pctCell/tnaCell: text-profit >= 0, text-loss < 0). Envolver el Sparkline en un contenedor de tamaño fijo (ej. div w-[72px] h-[28px]) que reserve el espacio cuando el fondo tenga menos de 2 puntos y Sparkline devuelva null (mismo patrón que MobilePositionsList.jsx), evitando saltos de layout. NO modificar Sparkline.jsx. (787e01b6)
- [x] Step 6: Verificar y ajustar que la tabla conserve el scroll horizontal en mobile con la nueva columna: el contenedor de la tabla debe mantener overflow-x-auto y el sparkline (ancho fijo) no debe forzar reflow ni romper el scroll. Ajustar clases de contenedor si hiciera falta. (787e01b6)
- [x] Step 7: Agregar/actualizar tests unitarios: cubrir el mapeo de getPricesBatch a series por fondo (orden por fecha, fondos sin historial suficiente → sin serie / contenedor vacío) y el criterio de color por signo. Correr typecheck y lint asegurando que todo pase sin errores. (c3cb6ec7)

### Decisiones (ADR)
- ADR-0155 — Color del sparkline derivado de rend_30d [Supuesto del agente] **⚠ REVISAR**
- ADR-0156 — Período de referencia para el color del sparkline: rend_30d [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0052/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-12 — F-0057 completado

## Feature F-0057

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En scripts/cafci_sync.py, dentro de daily(): además del batch de rows para fci_prices, construir en el mismo bucle (mismo idx) un batch de filas {id: fci_master_id, patrimonio: <patrimonio_act>} parseando patrimonio_act con pd.to_numeric(..., errors='coerce') y omitiendo del batch los fondos con NaN (no pisar valor previo con null). Upsertear ese batch por lotes contra fci_master con on_conflict='id' y el mismo BATCH_SIZE=500 que ya usa fci_prices. Verificar con --dry-run que no escribe en prod. (744bc350)
- [x] Step 2: Agregar un formateador de montos grandes (AUM/patrimonio) reutilizable — p.ej. formatAum(value) usando Intl.NumberFormat con notación compacta tipo '$ 1.240 M' — que devuelva un placeholder claro ('—') cuando el valor es null/undefined/no numérico, y nunca undefined/NaN. Ubicarlo junto a los otros formateadores del Explorador (mercadoService.js o util correspondiente). (d4cbc9bc)
- [x] Step 3: En getFondosPage (mercadoService.js), agregar la entrada 'aum': 'patrimonio' al mapa SORT_COL, siguiendo el patrón de las claves existentes (tna/1d/7d/etc), sin tocar getFondosStats. (8bb6a60b)
- [x] Step 4: En FciExplorador.jsx, agregar una columna nueva 'AUM' con <SortHeader label="AUM" sortK="aum" /> siguiendo exactamente el patrón de las columnas existentes (pctCell/tnaCell como referencia de estilo), renderizando fondo.patrimonio a través del formateador nuevo, mostrando el placeholder '—' cuando es null/undefined tanto en modo lista como en modo agrupado. (f8ff6979)
- [x] Step 5: Agregar/actualizar tests unitarios: cubrir el formateador de AUM (casos: null, cero, número grande con notación compacta) y verificar que SORT_COL.aum mapea a 'patrimonio'. Asegurar que typecheck y tests pasan. (38dda002)

### Decisiones (ADR)
- ADR-0157 — Mismo filtro de fecha/inactivo para patrimonio que para VCP [Supuesto del agente] **⚠ REVISAR**
- ADR-0158 — formatAum usa cero decimales en todas las ramas (K, M, unidad) [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0057/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-13 — F-0058 completado

## Feature F-0058

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En scripts/cafci_liquidez_sync.py, agregar un helper HTTP compartido para ambas fases: GET con rate limiting (delay fijo 300-500ms entre requests), timeout por request (~15s) y reintentos acotados (2-3) antes de saltear y loguear el request como fallido; tratar 404 como 'no existe' (skip silencioso, no error). Reusar el patrón de descarga/reintentos de cafci_sync.py. (65be2b24)
- [x] Step 2: Implementar la Fase 0 (resolución de fondo padre) en cafci_liquidez_sync.py: consultar fci_master por clases con activo=true Y cafci_fondo_padre IS NULL; si no hay pendientes, loguear 'Fase 0 saltada' y no crawlear. Para las pendientes, recorrer un rango parametrizable de IDs (default range(1,2500)) haciendo GET /fondos/{id} (sin ?clase=) con el helper HTTP, y de cada página válida extraer el nombre base del fondo (quitando el sufijo '- Clase X') y la sociedad gerente. (cff382ad)
- [x] Step 3: Implementar el matching de Fase 0: cruzar cada fondo padre encontrado contra las clases pendientes SIEMPRE por nombre base + gerente/sociedad_gerente juntos (nunca solo por nombre; nombres iguales entre gestoras distintas no deben matchear). Persistir los matches vía upsert por lotes a fci_master (on_conflict='id', payload solo {id, cafci_fondo_padre}). Loguear cuántas clases quedaron sin resolver, sin abortar. (637ea093)
- [x] Step 4: Implementar la Fase 1 (scraping de detalle) en cafci_liquidez_sync.py: para cada clase activa con cafci_fondo_padre resuelto, armar la URL /fondos/{padre}?clase={cafci_id}, hacer GET con el helper HTTP y parsear con un parser tolerante los campos plazo_liquidacion_dias, honorario_gerente_pct, honorario_depositaria_pct, comision_ingreso_pct, comision_egreso_pct, comision_transferencia_pct, gastos_ordinarios_pct, comision_exito_pct. Campo puntual no encontrado/no parseable → loguear y dejar null solo ESE campo; distinguir 'guión → null válido' de 'valor presente pero no parseable → omitir el campo'. Nunca descartar la clase entera ni abortar la corrida por un fallo individual. (1a8b64d9)
- [x] Step 5: Implementar el upsert por lotes de Fase 1 a fci_master (on_conflict='id', BATCH_SIZE=500), incluyendo solo los campos parseados con éxito en esa corrida más liquidez_updated_at; nunca pisar un valor bueno anterior con null por un fallo puntual (omitir del payload los campos fallidos). (20a96ce8)
- [x] Step 6: Agregar la CLI con argparse a cafci_liquidez_sync.py: flag --fase (0 | 1), --limit N y --dry-run, aplicables independientemente a cada fase (ej. --fase 0 --limit 50 --dry-run valida solo el matching contra una muestra; --fase 1 --limit 30 --dry-run valida solo el parser). En --dry-run no escribir a Supabase, solo loguear lo que se resolvería/persistiría. Permitir parametrizar el rango de IDs de Fase 0. (2b3be6d6)
- [x] Step 7: Crear .github/workflows/cafci_liquidez_monthly.yml: workflow separado del diario de VCP, con cron mensual (día 1, 03:00 UTC) + workflow_dispatch manual, timeout-minutes generoso (~180) para cubrir Fase 0 + Fase 1 en la primera corrida, usando los mismos secrets SUPABASE_URL/SUPABASE_SERVICE_KEY que cafci_daily.yml y ejecutando el script. (d30b5bb8)
- [x] Step 8: Agregar tests para cafci_liquidez_sync.py mockeando los requests HTTP: Fase 0 (match exacto por nombre+gerente, caso sin match, caso de nombres iguales entre gestoras distintas que NO deben matchear) y Fase 1 (parser con los casos reales: plazo 0 y 1 día, honorarios separados gerente/depositaria, comisión de éxito ausente → null). Verificar que un fallo individual (404/timeout) se saltea sin abortar ni pisar valores con null. (d2996892)

### Decisiones (ADR)
- ADR-0161 — Reset a baseline en vez de editar sobre el diff inflado [Supuesto del agente] **⚠ REVISAR**
- ADR-0162 — Shape asumida del JSON de GET /fondos/{id} en estadisticas.cafci.org.ar [Supuesto del agente] **⚠ REVISAR**
- ADR-0163 — Upsert en lotes en lugar de update individual con guard IS NULL [Instrucción de Augusto]
- ADR-0164 — Update individual por clase en lugar de batch upsert [Supuesto del agente] **⚠ REVISAR**
- ADR-0165 — Parser asume JSON (igual que Fase 0), no HTML [Supuesto del agente] **⚠ REVISAR**
- ADR-0166 — Agrupación por col-set en batch upsert para preservar valores previos [Supuesto del agente] **⚠ REVISAR**
- ADR-0167 — Validación de --id-min/--id-max restringida a --fase 0 en parse time [Supuesto del agente] **⚠ REVISAR**
- ADR-0168 — Fase 0 y Fase 1 como steps secuenciales, no como un solo comando [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0058/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-14 — F-0059 completado

## Feature F-0059

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En tailwind.config.js, agregar screens.compact = { raw: '(max-height: 820px)' } preservando explícitamente los breakpoints default de Tailwind (sm/md/lg/xl/2xl) mediante spread de defaultTheme.screens. Como el config es ESM (export default), usar import defaultTheme from 'tailwindcss/defaultTheme' en vez de require. Definir screens dentro de theme.extend para no pisar los defaults. (7100df22)
- [x] Step 2: Crear src/config/layoutFlags.js exportando `export const COMPACT_OVERVIEW_ENABLED = true;`, sin dependencias de otros módulos para evitar ciclos de import y permitir importarlo desde cualquier componente de src/. (732f10a9)
- [x] Step 3: Agregar temporalmente la clase de prueba `compact:bg-red-500` en el bloque desktop de DashboardOverview.jsx, verificar en DevTools emulando altura de viewport ≤820px que el breakpoint dispara solo por alto (no por ancho), y remover la clase de prueba antes de cerrar el paso. Correr npm run build para confirmar que compila sin errores. (732f10a9)

### Decisiones (ADR)
- ADR-0169 — `screens` dentro de `theme.extend` con spread explícito de `defaultTheme.screens` [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0059/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-14 — F-0060 completado

## Feature F-0060

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En src/features/portfolio/components/DashboardOverview.jsx, importar `COMPACT_OVERVIEW_ENABLED` desde `@/config/layoutFlags` (agregar el import junto a los imports existentes, sin duplicar si ya estuviera). (79b56fc8)
- [x] Step 2: En src/features/portfolio/components/DashboardOverview.jsx (grid `grid grid-cols-1 lg:grid-cols-[65fr_35fr]`, línea ~257/264), ramificar por flag con ternario: con `COMPACT_OVERVIEW_ENABLED=true` agregar `items-start` al className del grid (o `self-start` al hero) para que el hero deje de heredar el stretch; con el flag en `false` dejar el className exactamente como está hoy. No tocar la columna derecha ni la rama mobile. (68617579)
- [x] Step 3: En src/features/portfolio/components/PortfolioHeroChart.jsx, importar `COMPACT_OVERVIEW_ENABLED` desde `@/config/layoutFlags` (agregar el import sin duplicar). (09e6349f)
- [x] Step 4: En src/features/portfolio/components/PortfolioHeroChart.jsx, ramificar por flag el className del wrapper desktop `desktopEl` (línea ~291, `hidden md:flex ... flex-col`): con `COMPACT_OVERVIEW_ENABLED=true` agregar `md:h-[300px] compact:md:h-[220px]`; con el flag en `false` mantener el className original sin altura explícita. No modificar el área del chart (`flex-1 min-h-[90px]`), `renderChart`, `ResponsiveContainer` (width=100% height=100%), `isAnimationActive={false}`, ni la censura de saldos (MoneyValue/useBalanceVisibility/HIDDEN). (42c89556)
- [x] Step 5: Ejecutar typecheck, lint y tests del repo y corregir cualquier error introducido por los cambios de className/imports en los dos archivos, sin alterar la lógica de ramificación por flag. (42c89556)

### Decisiones (ADR)
- ADR-0170 — `items-start` en el grid vs `self-start` en el hero [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0060/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-14 — F-0062 completado

## Feature F-0062

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En tailwind.config.js, asegurar que exista el breakpoint `screens.compact` con `{ raw: '(max-height: 820px)' }`, preservando los defaults de screens (spread de `...defaultTheme.screens` o equivalente). Si ya existe, no duplicar. Es prerequisito para que la variante `compact:` de Tailwind compile las clases `compact:hidden`. (7778db91)
- [x] Step 2: En src/features/portfolio/components/GroupedPositionsTable.jsx, agregar el campo `priority: 'low'` a las definiciones de columna `pprom` y `diapct` dentro del array COLS, sin tocar el resto de columnas ni el orden. No cambia el render todavía; solo marca metadata. (a1750cee)
- [x] Step 3: En GroupedPositionsTable.jsx, importar COMPACT_OVERVIEW_ENABLED desde src/config/layoutFlags.js (si no está importado) y crear un helper puro, p.ej. `compactHiddenClass(col)`, que devuelva la string `'compact:hidden'` cuando `COMPACT_OVERVIEW_ENABLED === true && col.priority === 'low'`, y `''` en caso contrario. Con el flag en false debe devolver siempre string vacía. No aplicar el helper aún. (6c36143e)
- [x] Step 4: En GroupedPositionsTable.jsx, aplicar `compactHiddenClass(col)` al className de los `<th>` generados por COLS.map en el header (combinando con las clases existentes TH_SORT / TH base, sin reemplazarlas). Verificar que las columnas pprom y diapct se ocultan en viewport compact solo con el flag activo. (5f3f1979)
- [x] Step 5: En GroupedPositionsTable.jsx, aplicar la misma clase condicional a TODAS las celdas `<td>` de las columnas pprom y diapct en los tres lugares donde se escriben manualmente: filas de posición, filas de grupo (group headers) y el tfoot de totales. Mantener alineación header↔celdas idéntica; la censura de saldos (MoneyValue) en las columnas que quedan visibles no debe alterarse. (5f3f1979)
- [x] Step 6: En GroupedPositionsTable.jsx, calcular `MIN_W_COMPACT` = suma de `minW` de las columnas cuyo `priority !== 'low'` (≈825px), y aplicar el min-width inline del `<table>` de forma que use MIN_W_COMPACT cuando `COMPACT_OVERVIEW_ENABLED === true` en viewport compact, y MIN_W (≈995px) en el resto de los casos. Como el min-width se fija en JS y no hay media query en JS, resolverlo con clases responsive (p.ej. min-width base full + override compact) o dejando el valor menor y complementando con clases, de modo que con el flag en false el ancho siempre sea MIN_W. (48489e21)
- [x] Step 7: Agregar/actualizar un test unitario para GroupedPositionsTable que verifique: (a) con COMPACT_OVERVIEW_ENABLED=false las 10 columnas se renderizan siempre; (b) el ordenamiento por key (getSortValue/handleSort usando COLS.find por key) y la búsqueda siguen funcionando aunque pprom/diapct estén marcadas como low. Asegurar que typecheck y lint pasen. (72fd44e3)

### Decisiones (ADR)
- ADR-0171 — Aplicar compact:hidden también a <td>, no solo a <th> [Supuesto del agente] **⚠ REVISAR**
- ADR-0172 — Min-width responsive de la tabla vía CSS vars en lugar de literales Tailwind [Supuesto del agente] **⚠ REVISAR**
- ADR-0173 — Exports de test utilities en GroupedPositionsTable.jsx [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0062/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-14 — F-0061 completado

## Feature F-0061

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En src/components/ui/KpiCard.jsx, importar COMPACT_OVERVIEW_ENABLED (mismo import/patrón que usa F-0060) para poder ramificar clases condicionalmente en el modo default. (e39d1dfd)
- [x] Step 2: En src/components/ui/KpiCard.jsx (modo default, sin `status`), en el `Card` (~línea 128, `p-2.5`), agregar la clase `compact:p-2` únicamente cuando COMPACT_OVERVIEW_ENABLED === true, dejando `p-2.5` intacto cuando el flag está en false para mantener pixel-a-pixel el comportamiento actual. (0c43aecc)
- [x] Step 3: En src/components/ui/KpiCard.jsx, en el bloque `sparklineData && ... <Sparkline .../>` (~línea 156), agregar `compact:hidden` al contenedor del sparkline solo cuando COMPACT_OVERVIEW_ENABLED === true, de modo que en viewport compact el sparkline quede oculto y en full desktop / flag=false se muestre igual que hoy. (e6d55402)
- [x] Step 4: En src/features/portfolio/components/AllocationPanel.jsx, importar COMPACT_OVERVIEW_ENABLED y ramificar el padding del card (~línea 99, `padding: '10px 12px'`) a un valor más compacto (`8px 10px`) por tier compact solo cuando el flag está en true, sin tocar donut (100×100) ni leyenda. (6775e772)
- [x] Step 5: En src/features/portfolio/components/AllocationPanel.jsx, ramificar el `paddingTop: 10` del bloque StatBar (~línea 179) a `~6` en tier compact solo cuando COMPACT_OVERVIEW_ENABLED === true, manteniendo intacta la censura de saldos (useBalanceVisibility / HIDDEN) y el valor original con flag=false. (24d3d863)
- [x] Step 6: Verificar en AllocationPanel.jsx que el toggle Por tipo/Por estrategia sigue re-renderizando correctamente con los nuevos paddings en ambos tiers (compact y full), sin romper el layout de 2 columnas del KPI grid; ajustar solo si hace falta preservar el re-render. (24d3d863)
- [x] Step 7: Agregar/actualizar tests unitarios que cubran KpiCard y AllocationPanel con COMPACT_OVERVIEW_ENABLED en true y false: presencia/ausencia de `compact:hidden` en el sparkline, clases/estilos de padding correctos por flag, y que el toggle tipo/estrategia funciona; correr typecheck y lint. (ee55b99e)

### Decisiones (ADR)
- ADR-0174 — Lógica replicada inline en lugar de exportar helpers internos [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0061/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-14 — F-0063 completado

## Feature F-0063

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/hooks/useSidebarState.js`, extraer y exportar una función pura `getInitialSidebarExpanded()` que calcule el valor inicial del estado: si existe una preferencia guardada en localStorage (STORAGE_KEY 'sidebarExpanded') devolver ese valor booleano; si no hay preferencia y `COMPACT_OVERVIEW_ENABLED` es true y `window.matchMedia('(max-height: 820px)').matches`, devolver false (colapsado); en cualquier otro caso, replicar el default actual. Mantener el guard `typeof window === 'undefined'` para SSR/tests y envolver la lectura de matchMedia con guard defensivo por si no existe. (35013251)
- [x] Step 2: En `src/hooks/useSidebarState.js`, usar `getInitialSidebarExpanded()` como inicializador lazy de `useState` (una sola lectura al montar, sin listener de resize) para que el estado inicial se resuelva en el primer render sin flicker, dejando intacta la lógica de toggle y de persistencia en localStorage. (35013251)
- [x] Step 3: Crear `src/hooks/__tests__/useSidebarState.compact.test.js` (vitest) que cubra `getInitialSidebarExpanded()`: (a) flag true + viewport compact + sin preferencia guardada → colapsado (false); (b) preferencia guardada gana sobre el default compact; (c) viewport full desktop arranca como hoy con el flag en cualquier valor; (d) flag false → siempre el valor inicial de hoy sin importar el alto. Mockear `window.matchMedia` y `localStorage`. (4e1cdcb4)

### Decisiones (ADR)
- ADR-0175 — Fallback case 3 hardcodeado como `false` [Supuesto del agente] **⚠ REVISAR**
- ADR-0176 — Mock del flag via getter mutable en lugar de vi.resetModules [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0063/`

> Revisar con Claude in Chrome para validación de UX.

---

## 2026-09-21 — Fix cron fci-sync: 42P10 en upsert a fci_lots/fci_rescates [argos/caucion-sync]

**Ejecutor:** Claude en Cowork (Supabase MCP para diagnóstico y fix de prod; Chrome MCP autenticado como Augusto para leer el run de GitHub Actions y volver a disparar el workflow).

**Qué se hizo:**

• Augusto reportó por mail de GitHub Actions que "FCI Sync" (`caucion-sync`, workflow `fci-sync.yml`) falló en su primera corrida programada (Run #1, disparado por el cron, commit `0365346`, 20/09 22:51 ART, 24s, exit code 1).

• Diagnóstico contra el log del job: `Supabase upsert fci_lots 400: {"code":"42P10","message":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}` — mismo error en `fci_rescates`. Gmail y el parseo de los PDFs habían funcionado bien (2 mails, 2 PDFs únicos); el fallo era solo en la escritura a Supabase.

• Confirmado contra la DB (`wwzocpcolgdzkvcigchj`, vía `pg_constraint`/`pg_indexes`): `fci_lots`/`fci_rescates` tenían `idx_*_external_ref_unique`, un índice único parcial (`WHERE external_ref IS NOT NULL`, migración `035_fci_external_ref_dedupe` del 07/09 — a propósito, para no interferir con cargas manuales donde `external_ref` queda NULL). `fci_sync.py` (`upsert_lots`/`upsert_rescates`) llama a PostgREST con `on_conflict=external_ref`, que genera `ON CONFLICT (external_ref)` sin `WHERE` — Postgres no infiere un índice parcial desde un `ON CONFLICT` que no repite el mismo predicado → 42P10. Es la primera corrida real de este pipeline desde que existe `external_ref` (migración del 07/09), por eso el bug no se había visto antes.

• Fix aplicado en prod, migración `047_fci_external_ref_unique_constraint`: se dropearon los 2 índices parciales y se agregó `UNIQUE (external_ref)` real en `fci_lots` y `fci_rescates`. Sin cambios de código: un `UNIQUE` normal en Postgres ya permite múltiples NULL (NULL nunca es igual a NULL), así que las cargas manuales quedan protegidas exactamente igual que antes, y ahora el índice sí es inferible por `ON CONFLICT (external_ref)`.

• Verificación real (no mental): re-disparado el workflow a mano (`workflow_dispatch`, modo `daily`) — Run #2, success, 17s. Log: `Suscripciones: 2 | Rescates: 1`, `2/2 mails etiquetados como 'FCI Sync Processed'`, sin errores.

**Notas:** Dos warnings no fatales del parser quedan sin tocar, avisados a Augusto aparte: "tipo mismatch en CL 2026007643" (Solicitud dice suscripción, Liquidación dice rescate — el parser lo saltea) y un comprobante duplicado con valores distintos visto en la corrida original (CL 2026007280 — no reapareció en Run #2 porque esa corrida falló antes de persistir nada). `BACKLOG.md` actualizado con `AR-039` (fila nueva, `Ejecutor=manual` — migración de prod).

## 2026-09-21 — AR-040: Dashboard demora 20-30s en cargar tras login [argos]

Investigación y fix de performance, pedido explícito de Augusto tras rechazar un fix cosmético
(banner de aviso) y pedir diagnóstico real de la demora en la carga del dashboard.

### Diagnóstico
Confirmado contra Supabase (`wwzocpcolgdzkvcigchj`) y código real, no verificación mental:
- Causa principal: `useFciLotEngine.loadLots()` bajaba el historial COMPLETO de precios de
  cada fondo activo (`fciService.getPrices(id)` sin `fromDate`) solo para encontrar el precio
  del día anterior — hasta 2.844 filas/13 años para un solo fondo (Alpha Renta Capital Pesos -
  Clase B), confirmado por conteo real en Supabase.
- Causa secundaria: `FundingEngine.jsx`'s `loadVcpHistory` pedía el historial VCP de cada fondo
  carry en un loop por-fondo (N requests vía `Promise.allSettled`) en vez de usar
  `fciService.getPricesBatch` (ya existía en el service, sin uso).
- Se investigó y descartó por separado la consulta original de Augusto sobre "Ganancia FCI" y
  Alpha Renta Capital Pesos - Clase B (variación negativa): confirmado correcto, el neteo de
  variaciones negativas ya funciona bien — no requería fix.

### Pasos
- [x] Step 1: `fciService.js` — método nuevo `getRecentPrices(fciId, limit=30)`, acotado por
  cantidad de filas (`.order('fecha',{ascending:false}).limit(limit)`, revertido a ascendente)
  en vez de por fecha; da el mismo resultado exacto que el historial completo para "precio más
  reciente + el anterior" (ver ADR-0177).
- [x] Step 2: `useFciLotEngine.loadLots()` — usa `getRecentPrices` en vez de `getPrices` sin
  filtro en el bloque que calcula `yesterdayPrices`.
- [x] Step 3: `FundingEngine.jsx`'s `loadVcpHistory` — reemplaza el loop por-fondo por una sola
  llamada a `fciService.getPricesBatch` (ver ADR-0178, cambia aislamiento de fallas de
  por-fondo a atómico).
- [x] Step 4: Evaluado y descartado por alcance (ver ADR-0179) unificar este fetch con el de
  `FundingEngine` en una sola fuente compartida — cruza el límite hook-de-contexto vs.
  hook-de-página del proyecto, más grande que lo pedido.
- [x] Step 5: Verificación real antes de pushear (pedido explícito de Augusto: "no vamos a
  revisar, pushea directamente" — se corrió igual la verificación automática, no la humana):
  `npx tsc --noEmit` limpio, `npx vitest run` 361/361 tests verdes, `npm run build` OK.
- [x] Step 6: Detectado un WIP no relacionado ya sin commitear en la misma carpeta
  (`DashboardOverview.jsx`, paddings de AR-038/F-0064) — preservado con `git stash` puntual de
  ese archivo, sin tocarlo ni perderlo, mientras se commiteaba/pusheaba solo lo de AR-040 desde
  `main`.

### Decisiones (ADR)
- ADR-0177 — `getRecentPrices` acotado por cantidad de filas (LIMIT), no por ventana de fechas [Supuesto del agente] **⚠ REVISAR**
- ADR-0178 — `getPricesBatch` en FundingEngine cambia el aislamiento de fallas por-fondo a atómico [Supuesto del agente] **⚠ REVISAR**
- ADR-0179 — No se consolida el fetch de precios entre useFciLotEngine y FundingEngine [Supuesto del agente] **⚠ REVISAR**

### Commits
- `9d2418c8` (`portfolio-tracker-argos`, rama `main`) — `perf(fci): acotar fetch de precios en dashboard (AR-040)`, pusheado a `origin/main`, dispara auto-deploy de Vercel.

### Nota operativa
`device_bash` (shell dentro de la VM Linux de Cowork) sigue roto por el bug de Windows del 8/9
(mismo bloqueo documentado en S-050), pero `Windows-MCP__PowerShell` (ejecución directa en
Windows) sí funciona como canal alternativo — permitió correr git y el toolchain real
(tsc/vitest/build) desde Cowork en esta sesión. Vale la pena revisar si otros ítems bloqueados
por "consola no disponible" (como S-050) se pueden resolver por esta vía.

### QA
No se verificó en vivo post-deploy (Augusto pidió pushear directamente sin esperar revisión).
Pendiente: confirmar en el dashboard real que la carga es más rápida y las cifras (Saldo FCI,
Ganancia FCI, TNA ponderada) no cambiaron.

## 2026-09-21 - AR-041: Rescate FCI cuotapartes/monto cruzados + tipo hardcodeado en fci-sync [argos]

Reportado por Augusto en Cowork, en la misma sesion que AR-040, en dos mensajes: primero
"los fondos en caucion los veo en mi cartera principal, estaba separado eso antes!", despues
(con mas detalle) "el rescate esta mal, dice cp 3.9MM eso es plata no CP, la CP es lo que dice
en MONTO" + "hay que arreglar que respete donde esta el fondo, si en carry o portfolio".

### Diagnostico
Primero se descarto que fuera una regresion del push de AR-040: se releyo el diff de
`9d2418c8` contra `origin/main` linea por linea -- solo toca el fetch de precios
(`getRecentPrices`/`getPricesBatch`), no toca `portfolioPositions`/`carryPositions` en
`useFciLotEngine.js` (verificado que esa logica sigue intacta en `origin/main`).

La causa real esta en un repo distinto, `caucion-sync` (el cron `fci-sync`, Python +
GitHub Actions), no tocado por AR-040:
- El cron `fci-sync` fallaba con Postgres 42P10 en TODAS sus corridas hasta que otra sesion
  de Cowork lo arreglo mas temprano el mismo dia (AR-039). La corrida del 21/09 14:06 UTC fue
  la PRIMERA que efectivamente escribio filas a `fci_lots`/`fci_rescates` -- de ahi que
  Augusto notara recien ahora algo que, segun el, "estaba separado antes": literalmente nunca
  se habia escrito nada.
- Bug 1 (`fci_parser.py`): la linea de "Liquidacion" se parseaba asumiendo el mismo orden de
  3 importes (cuotapartes, vcp, monto) para suscripcion Y rescate. Confirmado contra el
  comprobante real CL 2026007643 (Alycbur FCI Abierto Pymes - Clase A) que el orden real en
  una liquidacion de RESCATE es (monto, vcp, cuotapartes) -- invertido. vcp_salida
  (14,059032) salio bien; cuotapartes (3.900.000, en realidad plata) y monto_rescatado
  (277.401,74, en realidad cuotapartes) quedaron cruzados. Verificacion dimensional:
  277.401,74 x 14,059032 ~= 3.900.000 (el monto real).
- Bug 2 (`fci_sync.py`): toda suscripcion sincronizada se insertaba con `tipo: "portfolio"`
  hardcodeado (linea 386), sin distinguir fondos que Augusto usa para caucion. Alycbur FCI
  Abierto Pymes - Clase A tiene TODO su historial real en la cuenta como `tipo='carry'` desde
  junio 2026 (confirmado por query a `fci_lots` agrupada por fci_id+tipo); el lote nuevo
  (CL 2026007601, 1.128.000 cp) se inserto `tipo='portfolio'` por el hardcode, apareciendo en
  la cartera principal de Argos via `fciPortfolioPositions`.

### Pasos
- [x] Step 1: `fci_parser.py` -- branch por `pending["tipo"]` al armar el dict de salida:
  rescate usa `(montos[2], montos[0])` para `(cuotapartes, monto)` en vez de
  `(montos[0], montos[2])` (ver ADR-0180).
- [x] Step 2: `fci_sync.py` -- nueva funcion `resolve_tipo(fci_id, cache)` que copia el tipo
  del lote mas reciente ya cargado para ese `fci_id` (query a `fci_lots`, `order=created_at.desc,limit=1`)
  en vez de hardcodear `"portfolio"`; fallback a `"portfolio"` si el fondo nunca se vio (ver
  ADR-0181).
- [x] Step 3: `tests/conftest.py` -- `_RESCATE_TEXT` actualizado al orden real; fixture nuevo
  `rescate_cruzado_real.pdf` calcado del comprobante real CL 2026007643.
- [x] Step 4: `tests/test_fci_parser.py` -- nuevo test
  `test_parse_rescate_no_cruza_cuotapartes_y_monto`, guard de regresion real. 10/10 tests
  pasan (`pytest`).
- [x] Step 5: Correccion de los datos ya escritos en Supabase con el bug activo (fuera del
  commit de codigo, aplicada directo via SQL): `fci_rescates.id=2a9902c2` (CL 2026007643) --
  cuotapartes 3.900.000 -> 277.401,74, monto_rescatado 277.401,74 -> 3.900.000;
  `fci_lots.id=c7f6a63c` (CL 2026007601, Alycbur) -- tipo portfolio -> carry (ver ADR-0182).
- [x] Step 6: Verificacion real antes de pushear (mismo patron que AR-040, "no vamos a
  revisar, pushea directamente" ya establecido para esta sesion): `python -m py_compile` +
  chequeo AST limpios, `pytest` 10/10 verdes.

### Hallazgo pendiente de confirmar (NO corregido en este fix)
Las 2 suscripciones sincronizadas el 21/09 (Adcap Ahorro Dolares CL 2026007527, Alycbur
CL 2026007601) tienen `cuotapartes == capital_invertido` exactamente en la base, lo cual es
dimensionalmente raro dado que `vcp_entrada != 1` en ambos casos (1,039 y 14,03 respectivamente
-- si fueran correctos, `capital_invertido` deberia ser `cuotapartes x vcp_entrada`, no igual a
`cuotapartes`). Posible bug adicional en el branch de suscripcion de `fci_parser.py`, o
coincidencia real del comprobante -- no hay evidencia suficiente para tocar el codigo sin que
Augusto confirme contra los comprobantes reales (ver ADR-0180, alternativas descartadas).
Queda pendiente.

### Decisiones (ADR)
- ADR-0180 -- fci_parser.py: orden de importes en Liquidacion depende del tipo de movimiento [Instruccion de Augusto] **REVISAR** (alcance: solo rescate, suscripcion sin tocar)
- ADR-0181 -- resolve_tipo: heuristico de ultimo tipo conocido por fci_id [Supuesto del agente] **REVISAR**
- ADR-0182 -- Correccion de datos ya escritos via SQL directo, no reprocesando el sync [Supuesto del agente]

### Commits
- `f0b6453` (`caucion-sync`, rama `main`) -- `fix(fci-sync): cuotapartes/monto cruzados en rescate + tipo hardcodeado (AR-041)`, pusheado a `origin/main`.

### QA
No hay deploy/Vercel de por medio (este repo corre por GitHub Actions cron, no Vercel). El fix
de codigo aplica desde la proxima corrida del cron; los 2 datos ya mal cargados se corrigieron
a mano via SQL (before/after verificado con SELECT antes y despues de cada UPDATE). Pendiente:
que Augusto confirme en el dashboard real que Alycbur ya no aparece en cartera principal, y que
revise la anomalia de suscripcion senalada arriba.

## 2026-09-21 - AR-042: fci_sync nunca aplica nada directamente -- review manual obligatorio en Argos [argos]

Augusto rechazo explicitamente el diseno de AR-041 (heuristico `resolve_tipo`, ADR-0181) en la
misma sesion, con un mensaje claro: "es que esta mal lo que hace, no tiene que aplicar NADA
directamente, me tiene que dar la opcion a mi ... y si no quiero aplicarlo no lo aplico". El
motivo original que dio: fci-sync existe por si Alycbur le hace movimientos de FCI a Augusto sin
que el se entere al momento (no revisa comprobantes a diario) -- pero necesita SIEMPRE la
oportunidad de decir que no antes de que algo se aplique a su cartera en vivo.

### Diseno (confirmado con Augusto via AskUserQuestion)
- Mientras se construia el fix, `fci_sync.py` sigue corriendo en su horario pero solo encola
  (no aplica) -- opcion elegida: "Que siga corriendo pero solo encole (recomendado)".
- El aviso de pendientes tiene que aparecer en dos lugares -- respuesta libre de Augusto: "En
  las notificaciones y en fondos".
- El contexto carry/portfolio de cada movimiento lo elige Augusto en el momento de aplicar,
  nunca se infiere -- opcion elegida: "Lo elijo yo en el momento de aplicar (recomendado)".

### Alcance
Las suscripciones detectadas por fci-sync se aplicaban directamente (`activo: true`) sin ningun
paso de revision -- a diferencia de los rescates, que ya tenian un patron de "pendiente de
revisar" construido en F-0053/F-0054/F-0056 (`fci_rescates` con `mutations: []`,
`FciPendingRescates.jsx` en Portfolio > Fondos). Se reutilizo ese mismo patron para
suscripciones en vez de construir uno nuevo, y de paso se corrigio el ultimo bug pendiente del
lado de rescates: `applyPendingRescate` tenia `'portfolio'` hardcodeado como tipo al aplicar
(bug latente que AR-041 no habia tocado).

### Pasos
- [x] Step 1 (Supabase): migracion `fci_lots_add_pendiente_flag` -- columna
  `pendiente boolean not null default false`.
- [x] Step 2 (`caucion-sync`, `fci_sync.py`): elimina `resolve_tipo()` (superado, ver
  ADR-0183); la rama de suscripcion inserta `activo: false, pendiente: true` en vez de
  `activo: true` con tipo resuelto -- nunca aplica nada, solo encola.
- [x] Step 3 (`portfolio-tracker`, `fciService.js`): `getActiveLots()` excluye
  `pendiente = true`; nuevo `getPendingLots(portfolioId)` / `applyPendingLot(lotId, tipo)`
  -- `tipo` obligatorio y validado (`'carry'|'portfolio'`), sin default (ver ADR-0184).
  `applyPendingRescate` gana el mismo requisito, reemplazando el `'portfolio'` hardcodeado.
- [x] Step 4 (`useFciLotEngine.js`): expone `pendingLots` / `applyPendingLot`.
- [x] Step 5 (UI): nuevo `FciPendingLots.jsx` (mismo patron visual que
  `FciPendingRescates.jsx`, que gana el mismo toggle carry/portfolio obligatorio antes de
  habilitar "Aplicar"); `FciPortfolio.jsx` renderiza ambas secciones en Portfolio > Fondos.
- [x] Step 6 (Supabase): migracion `sync_fci_notifications_ar042_wording` -- titulos de
  notificacion mas accionables ("Nueva suscripcion de FCI detectada -- revisala en
  Portfolio > Fondos" / mismo para rescate). Confirmado antes que `fci_suscripcion` y
  `fci_rescate` son los unicos tipos existentes en `notifications` (sin riesgo a otros
  consumidores).
- [x] Step 7: tests -- `caucion-sync`: 10/10 (`pytest`). `portfolio-tracker`: 368/368
  (`vitest`, incluye `fciService.pendingLots.test.js` nuevo y
  `fciService.pendingRescates.test.js` extendido con el tipo obligatorio); `tsc --noEmit`
  limpio; `npm run build` exitoso.

### Decisiones (ADR)
- ADR-0183 -- fci_sync nunca aplica nada directamente; toda suscripcion/rescate queda
  pendiente hasta revision manual en Argos [Instruccion de Augusto] -- supersede ADR-0181.
- ADR-0184 -- El tipo (carry/portfolio) lo elige Augusto a mano al aplicar, nunca se infiere
  [Instruccion de Augusto].
- ADR-0185 -- Aviso de pendientes por notificaciones existentes + nueva seccion en
  Portfolio > Fondos [Instruccion de Augusto].

### Commits
- `8613641` (`caucion-sync`, rama `main`) -- `fix(AR-042): fci_sync nunca auto-aplica, solo
  encola para revision`, pusheado a `origin/main`.
- `bafabcb` (`portfolio-tracker`, rama `main`) -- `fix(AR-042): suscripciones y rescates de
  FCI requieren revision manual antes de aplicarse`, pusheado a `origin/main`.

### QA
`tsc --noEmit` limpio, `npx vitest run` 368/368, `npm run build` exitoso (incluye bundle
`FciPortfolio`). Deploy de Vercel se dispara automaticamente al pushear a `main` (mismo patron
que AR-040/AR-041), no verificado en vivo post-deploy. Pendiente: que Augusto confirme en Argos
que ve la seccion nueva de pendientes en Portfolio > Fondos y que las notificaciones muestran el
texto actualizado.

## 2026-09-21 — F-0064 completado

## Feature F-0064

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/features/portfolio/components/DashboardOverview.jsx`, ramificar el className del contenedor raíz del bloque desktop (línea ~255, `hidden md:flex flex-col gap-2 px-6 lg:px-8 py-3 flex-1 min-h-0`) usando `COMPACT_OVERVIEW_ENABLED` (ya importado): cuando el flag está en `true` agregar `compact:md:px-4` (para `px-6 lg:px-8`) y `compact:md:py-2` (para `py-3`), y cuando está en `false` dejar el className original intacto. Combinar siempre las clases `compact:` con `md:`, nunca `compact:` sola. No tocar mobile ni la variante 'positions'. (0a9e1006)
- [x] Step 2: En el mismo archivo, ramificar los gaps del grid hero+KPI en tier compact contra `COMPACT_OVERVIEW_ENABLED`: en el grid `flex-shrink-0 grid grid-cols-1 lg:grid-cols-[65fr_35fr] gap-3` (línea ~258) bajar a `compact:gap-2`, y en el grid `grid grid-cols-2 gap-3` de KpiCards (línea ~271-272) bajar a `compact:gap-2`, manteniendo el patrón ternario del flag y los valores originales cuando el flag está en `false`. No modificar la rama `items-start` ya existente salvo para sumar la clase de gap. (1de153d9)
- [x] Step 3: Crear/actualizar test unitario Jest para M6 (p. ej. `src/features/portfolio/components/__tests__/DashboardOverview.compact.test.jsx`) siguiendo el patrón de `KpiCard.compact.test.js`/`GroupedPositionsTable.columns.test.js`: verificar que con `COMPACT_OVERVIEW_ENABLED=true` el className del contenedor desktop y de los grids incluye `compact:md:px-4`, `compact:md:py-2` y `compact:gap-2`, y que con el flag en `false` el className es exactamente el original de hoy (sin clases `compact:`). Correr build, lint y tests para confirmar que pasan sin errores. (8cec6c96)

### Decisiones (ADR)
- ADR-0186 — gap-2/gap-3 del grid interior excluidos del step [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0064/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-29 — F-0065 completado

## Feature F-0065

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `limits.ts`, refactorizar `isUsageLimitError(output: string): boolean` (mantener nombre y firma). Primero intentar extraer el primer objeto JSON con `"type":"result"` del output (tolerante a basura antes/después por `all:true`), reusando `parseClaudeJson` de `metrics.ts`. Si se parsea: es límite de uso solo si `is_error === true` Y (`api_error_status === 429` O `result` matchea case-insensitive `session limit|usage limit|rate limit|limit reached|too many requests|usage_limit_reached`); si `is_error === false`, NUNCA es límite. Si no se puede parsear JSON: fallback de texto case-insensitive con los mismos patrones más `"api_error_status"\s*:\s*429`, `HTTP 429` y `status(?: code)?[:\s]+429`; eliminar el `\b429\b` suelto. (bebe1826)
- [x] Step 2: En `limits.ts`, agregar tests unitarios a `limits.test.ts` para el detector: fixtures de éxito (`is_error:false`) con `0.429` en `total_cost_usd`, con `duration_ms:429`, y con 'rate limit' en `result` NO clasifican como límite; fixtures de error con `api_error_status:429`, con `result` tipo "You've hit your session limit · resets 4:40pm" (con y sin `api_error_status`), y stderr crudo con 'HTTP 429' SÍ clasifican como límite. (7fd77616)
- [x] Step 3: En `limits.ts`, extender `parseResetTime` y `hasExplicitResetTime` para aceptar `resets? (at )?H:MM(am|pm)` y `Ham|pm` (sin minutos), case-insensitive, con espacio opcional antes de am/pm, manteniendo el formato 24h actual y `retry-after`. Convertir 12h→24h (12am=00:00, 12pm=12:00) y aplicar la regla de hora ya pasada → día siguiente. Agregar tests: `resets 4:40pm`, `resets at 4:40 PM`, `resets 12am`, `resets 12:05pm`, cruce de medianoche, y regresión de formatos 24h y `retry-after`. (036a80db)
- [x] Step 4: En `limits.ts`, exportar `class UsageLimitError extends Error { output: string }` para ser reusada por el reviewer. (97a11d11)
- [x] Step 5: En `escalation.ts`, agregar `usageLimit?: boolean` a `FixerInvocationResult` y `usageLimitOpts?: ProbeOpts` a `EscalationOpts`. En `invokeFixer`, si `isUsageLimitError(output)` o `exitCode === 429`, devolver `{ ok:false, usageLimit:true, ... }`. En `escalateStep`, si `invoked.usageLimit`: `await handleUsageLimit(invoked.output, state, opts?.usageLimitOpts)` y repetir el mismo intento (`attempt--; continue`) sin tocar `lastDetail` ni consumir presupuesto. (44048e19)
- [x] Step 6: En `escalation.test.ts`, agregar tests con `invokeFixerFn` inyectado y `usageLimitOpts` para no dormir: (a) limit → ok: el intento no se cuenta y devuelve `ok:true`; (b) limit → limit → ok; (c) fallo real → fallo real agota `MAX_FIXER_ATTEMPTS` como hoy (no regresión). (648fc89b)
- [x] Step 7: En `reviewer.ts`, en `defaultCallClaude` chequear límite de uso (`isUsageLimitError` sobre `result.all` o `exitCode === 429`) ANTES del `exitCode !== 0` y de `parseReviewOutput`, lanzando `UsageLimitError` (importada de `limits.ts`) con `output`. En `runReviewer`, capturar `UsageLimitError` → `await handleUsageLimit(err.output, state)` → repetir la revisión en loop, garantizando que un límite NUNCA se devuelva como `{approved:false, feedback:<texto del límite>}`. (725ba3d5)
- [x] Step 8: En `reviewer.test.ts`, agregar tests con `callClaude` inyectado que lanza `UsageLimitError` la primera vez y devuelve una revisión válida la segunda, verificando que se pausa/reintenta y no se emite `{approved:false}` con el texto del límite. (725ba3d5)
- [x] Step 9: En `executor.test.ts`, agregar verificación cruzada del builder con el detector nuevo: casos de falso positivo (éxito con 'rate limit' en `result` y con `0.429` en costo) que NO pausan, y caso de session-limit-solo-texto que SÍ pausa sin consumir `attempt`; confirmar que `executeStep`/`executeStepWithRetry` no cambian de comportamiento. (e56f3d16)
- [x] Step 10: Correr typecheck y `npm test` completos, verde en la suite existente más los tests nuevos. (8f0b00b4)

### Decisiones (ADR)
- ADR-0187 — Tests de UsageLimitError ya presentes en reviewer.test.ts antes del step 8 [Supuesto del agente] **⚠ REVISAR**
- ADR-0187 — Tests de UsageLimitError ya presentes en reviewer.test.ts antes del step 8 [Supuesto del agente] **⚠ REVISAR**
- ADR-0187 — Tests de UsageLimitError ya presentes en reviewer.test.ts antes del step 8 [Supuesto del agente] **⚠ REVISAR**
- ADR-0187 — Tests de UsageLimitError ya presentes en reviewer.test.ts antes del step 8 [Supuesto del agente] **⚠ REVISAR**
- ADR-0188 — Test discriminante del invariante `attempt--` con MAX_RETRIES límites consecutivos [Instrucción de Augusto]

### QA
Screenshots en `orchestrator/qa-artifacts/F-0065/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-30 — F-0066 completado

## Feature F-0066

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `reviewer.ts`, cambiar el comando del diff de `runReviewer` a `git diff HEAD -- . ':(exclude)system/DECISIONS.md' ':(exclude)system/PROGRESS.md'` (el pathspec positivo `.` es obligatorio para que los excludes funcionen), sin cambiar la firma pública de `runReviewer`. Debe tolerar `repoRoot` que no sea augusto-os (archivos inexistentes → sin error). (61d13acb)
- [x] Step 2: En `reviewer.test.ts`, agregar tests con repo git real en tmpdir (`repoRoot`/`callClaude` inyectados): (a) único cambio sin commitear es `system/DECISIONS.md` → diff vacío → `{approved:true}` sin invocar `callClaude`; (b) cambio en un `.ts` MÁS cambio en `DECISIONS.md` → el prompt de `callClaude` contiene el `.ts` y NO `DECISIONS.md`; (c) repo donde esos archivos no existen → sin error. (8f317f38)
- [x] Step 3: En `index.ts`, extraer de `main()` una función testeable `commitStepWithAdrs` que: escribe los ADRs pendientes con `appendAdr` (respetando la idempotencia `!(step.adrIds?.length)`), persiste los `adrIds` en `STATE.json` de inmediato, y recién entonces llama `commitStep` — reordenando para que el commit del step incluya `system/DECISIONS.md` cuando el target es sistema. Mantener el log `[adr] ADR-XXXX registrado` y exportarla vía el guard `isDirectRun`. (4c8f7d6f)
- [x] Step 4: En `index.test.ts`, agregar tests de `commitStepWithAdrs` con repo git en tmpdir: (a) tras invocarla, `git status --porcelain` queda vacío y `DECISIONS.md` figura en el commit del step; (b) simular fallo de `commitStep` y re-ejecutar (resume) verificando que el ADR existe una sola vez y no se duplica; (c) step sin ADRs pendientes: comportamiento idéntico al actual. (f340e66f)
- [x] Step 5: En `backlog.ts`, agregar una función análoga a `commitAndPushBacklog` que comitea y pushea SOLO `system/DECISIONS.md` y `system/PROGRESS.md` en augusto-os (mensaje `chore(system): DECISIONS/PROGRESS tras <featureId>`) por rutas explícitas (nunca `-A`), reutilizando el núcleo `commitAndPush` con el mismo chequeo de rama default y no-op silencioso si no hay cambios. No alterar el comportamiento de `commitAndPushBacklog`. (6105c91a)
- [x] Step 6: En `index.ts`, invocar la nueva función de commit+push de documentos de sistema en la fase de release (junto a `updateBacklogStatus`/`commitAndPushBacklog`), envuelta en try/catch que loguea y NO bloquea el release. (2bc5113c)
- [x] Step 7: En `backlog.test.ts` (o test dedicado), agregar tests de la nueva función contra repo git real en tmpdir con remoto bare: commit+push de los dos archivos, idempotencia (segunda llamada no-op), rechazo fuera de la rama default, y que otros archivos sucios NO se incluyan. Verificar que los tests existentes (`commitAndPushBacklog`, `updateBacklogStatus`) sigan verdes. (3f9b7de9)
- [x] Step 8: En `index.ts`, tras `appendAdr`, si el ID devuelto ya figura en los `adrIds` de otro step de `state.steps`, loguear un warning `[adr] ID duplicado ADR-XXXX (step A y step B)`. Solo instrumentar, sin cambiar el comportamiento existente. (738057b4)
- [x] Step 9: En `adr.test.ts`, agregar test de no-colisión: llamar `appendAdr` 3 veces seguidas contra un archivo en tmpdir (parámetro `filePath`, con la plantilla real de `DECISIONS.md` como fixture) y verificar que devuelve IDs consecutivos y distintos, que las 3 entradas quedan en el archivo y que el orden newest-first se mantiene. (d3633754)
- [x] Step 10: Correr typecheck y `npm test` completos; dejar la suite existente y los tests nuevos en verde y sin errores de typecheck. (d3633754)

### Decisiones (ADR)
- ADR-0189 — commitStepWithAdrs devuelve el conjunto efectivo de adrIds, no solo los recién creados [Supuesto del agente] **⚠ REVISAR**
- ADR-0190 — Generalizar commitAndPush para aceptar paths variables en lugar de duplicar la lógica [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0066/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-30 — F-0067 completado

## Feature F-0067

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/features/portfolio/services/portfolioHistoryService.ts`, dentro de `loadFciPortfolioData`: agregar `.eq('descartado', false)` y `.eq('pendiente', false)` a la consulta de `fci_lots`, y `.eq('descartado', false)` a la consulta de `fci_rescates`. NO filtrar por `activo`. Exportar `loadFciPortfolioData` (cambiar de privada a exportada) manteniendo firma, retorno y el comportamiento de devolver `null` cuando no hay lotes válidos. (d209f0ac)
- [x] Step 2: Crear un helper de supabase falso en memoria para tests bajo `src/features/portfolio/services/__tests__/` (siguiendo el patrón de `src/features/fci/services/__tests__/mercadoService.getPricesBatch.test.js`) que implemente la cadena `from().select().eq().order().in()` aplicando los `.eq(...)` sobre filas reales de fixture con la forma `{ id, fci_id, cuotapartes, fecha_suscripcion, capital_invertido, tipo, activo, pendiente, descartado, fci_master(moneda) }`, para poder verificar comportamiento y no solo la forma de la llamada. (4e076263)
- [x] Step 3: Escribir tests unitarios de `loadFciPortfolioData` usando el supabase falso: (a) lote `descartado=true` NO llega en `lots` ni aporta a `pricesByFci`/`monedaByFci`; (b) lote `pendiente=true` excluido; (c) lote `activo=false`, `descartado=false`, `pendiente=false` con `cuotapartes=0` y su rescate CON `mutations` que lo referencia SIGUEN incluidos; (d) rescate `descartado=true` excluido; (e) portfolio sin lotes válidos devuelve `null` como hoy. (0948fb11)
- [x] Step 4: Agregar test de regresión del caso real: dataset con 4 lotes válidos más el lote descartado (1.128.000 cuotapartes, suscripción 2026-08-21, VCP ≈ 14,03) pasado por `loadFciPortfolioData` (con supabase falso) y luego por `buildFciValuationSeries` sobre fechas 2026-08-19 a 2026-08-25, afirmando que la serie NO tiene el escalón de ≈ +16 MM el 08-21 (la valuación del 08-21 difiere del 08-20 solo por movimiento de precio). (20bca4fb)
- [x] Step 5: Correr typecheck y la suite completa (`vitest run`) verificando que pasan la suite existente más los tests nuevos, sin cambios en `calculateTotals`, `fciValuationSeries.ts`, `fciService.js` ni `usePortfolioHistory.ts`. (20bca4fb)

### Decisiones (ADR)
- ADR-0191 — Builder con filtrado real en lugar de solo spy [Supuesto del agente] **⚠ REVISAR**
- ADR-0192 — Fixtures del caso (c) en describe anidado propio en lugar de ampliar los fixtures globales [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0067/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-30 — F-0068 completado

## Feature F-0068

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En reviewer.ts: antes de calcular el diff en runReviewer, registrar los archivos nuevos sin trackear con `git add -N -- . ':(exclude)system/DECISIONS.md' ':(exclude)system/PROGRESS.md'` (intent-to-add) usando el repoRoot inyectado, de modo que `git diff HEAD` incluya el contenido de los archivos nuevos sin stagear su contenido; respetar .gitignore y no romper si los archivos de exclusión no existen. Mantener firma pública de runReviewer, ReviewResult y ReviewerOpts. (8e9dbe62)
- [x] Step 2: En reviewer.ts: ajustar el logueo para contar los archivos nuevos incluidos y loguear `[reviewer] N archivo(s) nuevo(s) incluidos en el diff` cuando corresponda; reservar el mensaje `Diff vacío` (aprobar sin invocar callClaude) solo para el caso en que el diff resultante está realmente vacío. (8e9dbe62)
- [x] Step 3: En reviewer.test.ts: agregar tests con repo git real en tmpdir para (a) solo archivo nuevo sin trackear src/nuevo.ts → aparece en el prompt de callClaude y no se devuelve {approved:true} por diff vacío; (b) archivo nuevo + archivo trackeado modificado → ambos en el prompt. (8e9dbe62)
- [x] Step 4: En reviewer.test.ts: agregar tests para exclusiones — archivo ignorado por .gitignore (node_modules/x.js o logs/x.log) NO aparece en el diff; system/DECISIONS.md y system/PROGRESS.md excluidos tanto si están modificados como si son nuevos sin trackear; repo sin cambios sigue devolviendo {approved:true} sin invocar callClaude. (d33587f7)
- [x] Step 5: En reviewer.test.ts: agregar test de integración con repo tmpdir que verifique que tras runReviewer + commitStep, el archivo nuevo queda comiteado y `git status --porcelain` queda vacío (la revisión con intent-to-add no altera lo que commitStep comitea ni deja efectos colaterales). (d33587f7)
- [x] Step 6: Correr typecheck y `npm test` completos; asegurar que la suite existente de reviewer.test.ts sigue verde junto con los nuevos tests y que no hay errores de tipos ni lint. (d33587f7)

### Decisiones (ADR)
- ADR-0193 — Contar archivos nuevos via ls-files antes de git add -N, filtrado en código [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0068/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-09-30 — f-0069 completado

## Feature f-0069

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En runDeepSeekAgent (orchestrator/src/scout/deepseek.ts): leer choice.finish_reason en la respuesta final y loguearlo con el formato `[scout] <focus>: respuesta final finish_reason=<x>, <n> caracteres`, antes de cualquier parseo. No cambiar la lógica de tool_calls ni MAX_LOOP_TURNS. (b85de4da)
- [x] Step 2: Reemplazar el literal `max_tokens: 4096` del body del fetch a DeepSeek por una constante con nombre SCOUT_MAX_OUTPUT_TOKENS. Verificar en la documentación oficial de DeepSeek el máximo de salida de 'deepseek-v4-flash' y fijar el valor máximo documentado (si no se puede confirmar, dejar 8192 solo si está documentado; si no, mantener 4096). Dejar valor y fuente en un ADR. (fbe7e02d)
- [x] Step 3: En buildSystemPrompt (deepseek.ts): agregar cotas explícitas para la respuesta final — máximo de entradas de `evidencia` (propuesta 8) y largo máximo de `explicacion` (propuesta 200 caracteres) — sin tocar ScoutReportSchema. (8b281da7)
- [x] Step 4: En la rama de respuesta final de runDeepSeekAgent: detectar finish_reason==='length' y, en vez de parsear, agregar al historial un mensaje de usuario pidiendo la misma respuesta JSON en versión compacta y repetir el turno UNA sola vez. Si el segundo intento vuelve 'length', lanzar un error claro que mencione `finish_reason=length` sin hacer un tercer intento. Convivir con pruneToolHistory y no cambiar MAX_LOOP_TURNS ni SCOUT_TIMEOUT_MS. (9a5d6965)
- [x] Step 5: Envolver el JSON.parse del jsonMatch en la rama de respuesta final para que, con finish_reason distinto de 'length' y JSON inválido, se lance un error descriptivo que incluya el finish_reason y el largo del contenido (en vez del SyntaxError crudo), manteniendo que la investigación se considera fallida. (a54aeaf4)
- [x] Step 6: En scout.test.ts: agregar tests con fetch simulado (vi.stubGlobal) para: (a) 'length' + JSON truncado → no parsea y reintenta; (b) 'length' y luego válido → devuelve reporte; (c) 'length' dos veces → error con finish_reason=length sin tercer intento; (d) el body de la request usa SCOUT_MAX_OUTPUT_TOKENS; (e) buildSystemPrompt contiene ambas cotas; (f) 'stop' + JSON inválido → error con finish_reason y largo. Verificar que los tests existentes (incluido 402/S-034 y el de MAX_LOOP_TURNS) siguen verdes. (af96c462)
- [x] Step 7: Correr typecheck y npm test completos; ajustar hasta que la suite existente más los tests nuevos pasen sin errores de tipos. (af96c462)

### Decisiones (ADR)
- ADR-0195 — SCOUT_MAX_OUTPUT_TOKENS = 393 216 para deepseek-v4-flash [Instrucción de Augusto]

### QA
Screenshots en `orchestrator/qa-artifacts/f-0069/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-01 — f-0070 completado

## Feature f-0070

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En scripts/cafci_sync.py, ampliar el mapa de columnas `C` con los índices 0-based del xlsx pb_get: horizonte=3, region=2, calificacion=19, var_1m=9, var_ytd=10, var_12m=11 y minimo_inversion=43. Agregar constantes con nombre para los límites de sanitización (MINIMO_INVERSION_MAX = 1e9, VARIACION_MAX_ABS = 1000). Sin otros cambios de comportamiento. (84f81191)
- [x] Step 2: En scripts/cafci_sync.py, escribir la función pura `extraer_ficha(row)` (sin red ni Supabase) que devuelve un dict solo con los campos válidos de la fila: horizonte, region, calificacion, minimo_inversion, var_1m_oficial, var_ytd_oficial, var_12m_oficial. Sanitizar minimo_inversion (omitir si NaN, <=0 o >=1e9); sanitizar variaciones (omitir cada una si NaN o |valor|>1000, de forma independiente); sanitizar textos (calificacion omitida si NaN/vacío/'NA' case-insensitive, guardada recortada si no; horizonte/region recortados y omitidos si vacíos). (903dbdb9)
- [x] Step 3: En scripts/cafci_sync.py, integrar la ficha dentro del loop existente de `daily()` (después de los filtros es_inactivo / MAX_DIAS_ATRAS / mapeo): armar la fila con id, nombre y los campos de extraer_ficha, agregar `variaciones_fecha` (= fecha_vcp de la fila) solo si hay al menos una variación válida, y omitir la fila si no quedó ningún campo de ficha. Antes de subir, agrupar las filas por frozenset idéntico de claves y upsertear cada grupo en lotes de BATCH_SIZE a fci_master con on_conflict='id'. No modificar los payloads existentes de fci_prices, patrimonio ni liquidez, y seguir invocando refresh_fci_rendimientos al final. (216a63e7)
- [x] Step 4: En scripts/cafci_sync.py, agregar al log final de daily() y al del dry-run el conteo de fondos con ficha a upsertear (p. ej. 'Ficha (horizonte/mínimo/calificación/variaciones) a upsertear: N') con alguna línea de muestra. (944e7440)
- [x] Step 5: Crear scripts/test_cafci_sync.py (pytest) con tests de la función pura extraer_ficha: la fila real de Adcap Balanceado III - Clase A (horizonte 'Cor', región 'Arg', mínimo 1.0, variaciones 3.394/30.256/52.338); test parametrizado de sanitización de minimo_inversion (omitir 0.0, NaN y 9999999999999998.0; conservar 1.0, 1000.0, 10000000.0); test parametrizado de variaciones (omitir >1000 como 144594.18, conservar 733.15, una var omitida no impide guardar las demás); test de calificacion/horizonte/region; y test de que variaciones_fecha se agrega solo con al menos una variación válida. DataFrames en memoria con columnas por índice entero. (58b29a01)
- [x] Step 6: En scripts/test_cafci_sync.py, agregar un cliente Supabase falso en memoria que capture los payloads de upsert y exponga table().select().eq().not_.is_().execute(), table().upsert().execute() y rpc().execute(), reemplazando descargar_panel por un DataFrame fixture. Test de agrupado: dos fondos con conjuntos de claves distintos generan lotes de upsert separados y ningún payload mezcla conjuntos de claves distintos. Test de no regresión: con un DataFrame de 3 filas (una inactiva, una con fecha vieja, una válida), los payloads a fci_prices, patrimonio y liquidez/comisiones/plazo son idénticos a los previos y refresh_fci_rendimientos se invoca al final. (2c6e7dba)

### Decisiones (ADR)
- ADR-0196 — Orden de las claves nuevas dentro del dict C [Supuesto del agente] **⚠ REVISAR**
- ADR-0197 — Agregar ficha_scraped_at al payload de ficha [Supuesto del agente] **⚠ REVISAR**
- ADR-0198 — Tests de variaciones_fecha prueban la condición de daily(), no daily() directamente [Supuesto del agente] **⚠ REVISAR**
- ADR-0199 — FakeSupabase ignora todos los filtros de select (eq, gte, not_.is_) [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/f-0070/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-01 — f-0071 completado

## Feature f-0071

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En src/features/fci/services/mercadoService.js agregar getFondoFicha(id): resuelve el grupo desde fci_explorador_grupos (fila cuyo id coincide o cuyo clases_hermanas contiene ese id vía jsonb contains), trae la fila de fci_master (nombre, ticker, moneda, sociedad_gerente, sociedad_depositaria, clasificacion_cod, horizonte, region, calificacion, minimo_inversion, var_1m_oficial, var_ytd_oficial, var_12m_oficial, variaciones_fecha, plazo_liquidacion_dias, honorario_gerente_pct, honorario_depositaria_pct, gastos_ordinarios_pct, comision_ingreso_pct, comision_egreso_pct, patrimonio), la fila de fci_rendimientos, y la lista de clases del grupo (incluida la actual) con sus mismos campos; normaliza con normalizeFondo; devuelve null sin lanzar si el id no existe. No cambiar firmas ni comportamiento de los métodos existentes. Agregar test con supabase falso al estilo de mercadoService.getFondosPage.test.js. (f76923ba)
- [x] Step 2: En mercadoService.js agregar getRankingCategoria({ clasificacion_cod, moneda, tna }) que calcula { puesto, total } con consultas de conteo server-side (head: true) sobre fci_explorador_grupos: puesto = 1 + cantidad de fondos de la misma categoría y moneda con tna mayor, total = cantidad con tna no nulo, aplicando el mismo filtro de stale (STALE_DATE_FIELD / getLatestUniverseDate / patrón applyFondosFilters) que usa el Explorador; con tna nulo devuelve null. Si hace falta reutilizar applyFondosFilters, exportarlo o replicarlo sin cambiar su comportamiento. Agregar test que verifica los filtros enviados a las consultas. (c1c4e08b)
- [x] Step 3: Crear src/features/fci/utils/fichaFondo.js con funciones puras y sus tests: buildFichaPeriodos (último día hábil, 7D, 30D y TNA desde fci_rendimientos; 90D y 6M desde la serie de fci_prices solo si el historial cubre la fecha base, nunca extrapolando; año en curso y 12M desde var_ytd_oficial/var_12m_oficial con rend_ytd/rend_1y como respaldo calculado solo si la oficial es nula; cada fila con su fuente 'oficial'|'calculado'), etiquetas de horizonte/region/plazo de rescate/mínimo de inversión según el mapeo de la spec (valores desconocidos omitidos o texto crudo según corresponda), buildResumenFondo (párrafo con solo datos presentes), buildClasesRows (una fila por clase), y un helper de disponibilidad de rangos de gráfico (1M/3M/6M/Máx) según historial. Tests para historial corto, oficial presente, oficial ausente con respaldo y todo nulo; 4 clases y clase única. (6ada2df9)
- [x] Step 4: Crear src/features/fci/hooks/useFondoFicha.js: hook que, dado fondoId, carga de forma independiente la ficha (getFondoFicha), los precios del rango seleccionado (getPricesForFondo + fromDateForRange) y el ranking (getRankingCategoria), de modo que el fallo o ausencia de datos de un bloque no derribe los demás; expone estados de cargando/error/no encontrado y una acción de reintento. (6a7d882e)
- [x] Step 5: Crear la página src/pages/FciFondoDetalle.jsx (default export, dentro de ErrorBoundary) usando useFondoFicha y los helpers de fichaFondo.js, con las secciones en orden: cabecera con migas de pan (Explorador › categoría › fondo), nombre (fondo_base si hay varias clases), chips de moneda/categoría/horizonte, botón Comparar que navega a /fci/comparador?fondos=<id>, botón de volver, y párrafo de resumen; tarjetas de KPI (30D, YTD, 12M, TNA 30D, patrimonio) marcando las oficiales CAFCI; gráfico de valor cuota con recharts (gridProps/axisProps de chartTheme) y selector de rango 1M/3M/6M/Máx (rangos sin historial deshabilitados); tabla de rendimiento por período mostrando la fuente de cada fila; ficha técnica que omite filas sin dato y muestra honorarios/comisiones como % incluido 0,00%; tabla de clases de cuotaparte (clase abierta resaltada, cada otra clase enlaza a su ficha); sección de ranking en la categoría. Estados de cargando, error con reintento y no encontrado con enlace al Explorador; cada bloque se degrada solo. Estética oscura de Argos y componentes reutilizados (PageHeader, Tooltip, chips/tarjetas). (9467b62c)
- [x] Step 6: Registrar la ruta /fci/explorador/:fondoId en src/App.jsx con la misma envoltura que /fci/explorador (ProtectedRoute adminOnly + AppLayout + Suspense/LoadingFallback, página cargada con React.lazy apuntando a FciFondoDetalle.jsx), cuidando el orden frente a la ruta exacta /fci/explorador, los redirects legacy /mercado/* y el catch-all /portfolio/:tab?. (9467b62c)
- [x] Step 7: En src/pages/FciExplorador.jsx convertir el nombre del fondo en un enlace a /fci/explorador/<id> tanto en la fila principal como en las filas de clases hermanas expandidas, sin romper el chevron de expandir, el botón de comparar ni el resto de la fila (que no deben navegar). Verificar typecheck, lint, npm test y npm run build. (e9dcbff5)

### Decisiones (ADR)
- ADR-0200 — Resolución de grupo secuencial (no paralela) [Supuesto del agente] **⚠ REVISAR**
- ADR-0201 — getRankingCategoria siempre aplica el filtro stale (sin parámetro excludeStale) [Instrucción de Augusto]
- ADR-0202 — Nombres de funciones no especificadas en el spec [Supuesto del agente] **⚠ REVISAR**
- ADR-0203 — keyDates como parámetro opcional para inyección en tests [Supuesto del agente] **⚠ REVISAR**
- ADR-0204 — Fetch de historial completo en la ficha, ventana de gráfico derivada en cliente [Supuesto del agente] **⚠ REVISAR**
- ADR-0205 — Tarjetas KPI propias en la ficha de fondo en vez de KpiCard [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/f-0071/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-01 — F-0072 completado

## Feature F-0072

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En src/features/fci/services/mercadoService.js, corregir getFondoFicha: pasar el filtro jsonb de clases hermanas como string JSON con JSON.stringify([{ id }]) en lugar del arreglo JS, y asegurar que cuando ni la consulta directa (.eq('id', id)) ni la de hermanas devuelven fila, retorne null (sin lanzar error). No cambiar la firma del método. (166951ff)
- [x] Step 2: Agregar/actualizar tests en src/features/fci/services/__tests__/mercadoService.getFondoFicha.test.js con un supabase falso que registre el argumento de .contains y verifique que es un string que parsea a [{"id":"<id>"}]; cubrir que un id hermano devuelve la ficha del grupo con esa clase como actual y que un id inexistente devuelve null. (ea07b30b)
- [x] Step 3: En src/features/fci/utils/fichaFondo.js, agregar funciones puras exportadas labelHorizonte (Cor→Corto plazo, Med→Mediano plazo, Lar→Largo plazo, Flex→Flexible, Sasig/desconocido→omitido) y labelRegion (Arg→Argentina, Glo→Global, Latam→Latinoamérica, Eeuu→EE.UU., Bra→Brasil, Eur→Europa, otro→texto crudo), con tests parametrizados en fichaFondo.test.js. (1a203dc4)
- [x] Step 4: En getFondoFicha (mercadoService.js), exponer el patrimonio total del fondo desde fci_explorador_grupos.patrimonio (p. ej. como patrimonio_fondo) además del patrimonio de la clase, sin romper el shape existente de `fondo`; actualizar los tests de getFondoFicha para cubrir ambos campos. (0c34eace)
- [x] Step 5: Agregar en src/utils/formatters.ts (o src/features/fci/utils/fichaFondo.js) una función pura de formato de importe que reciba la moneda del fondo y use prefijo US$/USD para USD y $ para ARS, reutilizando formatAum como base; tests para ARS y USD. (d09efdf4)
- [x] Step 6: Ampliar buildClasesRows en fichaFondo.js para proyectar por clase: valor cuotaparte (VCP unitario más reciente de fci_prices, 6 decimales vía getPricesBatch), patrimonio de la clase, 30 días, YTD oficial, 12M oficial, TNA, honorario de gerente (variaciones oficiales y honorario leídos de fci_master por id) y ticker si existe; celdas faltantes muestran '—' solo en su celda. Tests con el fondo de 3 clases de Adcap Balanceado III y con uno de una sola clase. (35d26b09)
- [x] Step 7: Extender buildFichaTecnicaRows en fichaFondo.js para incluir filas de sociedad gerente, sociedad depositaria, categoría, moneda y calificación (solo cuando existe), manteniendo las reglas actuales (filas sin dato omitidas, honorarios/comisiones incluso en 0,00%); test. (96c0971d)
- [x] Step 8: Mejorar buildResumenFondo en fichaFondo.js: usar las etiquetas legibles de horizonte/región, evitar el punto duplicado tras la sociedad gerente, e incluir cuando haya dato categoría y moneda, rendimiento a 30 días, patrimonio total del fondo, cantidad de clases y puesto en la categoría; cada frase sin dato se omite. Tests con todos los datos, parciales y casi nada. (8dc70eb8)
- [x] Step 9: Agregar en fichaFondo.js una función pura de formato de la nota de variaciones oficiales que, usando variaciones_fecha, produzca 'Datos oficiales CAFCI al DD/MM/AAAA' (y aclare que la fecha base de 12 meses la define CAFCI), sin alterar buildFichaPeriodos; test de la función de formato. (5f38ce87)
- [x] Step 10: Actualizar la página src/pages/FciFondoDetalle.jsx para consumir todo lo anterior: chips de cabecera y ficha técnica con etiquetas legibles (no fondo.horizonte/fondo.region crudos), KPI Patrimonio mostrando el total del fondo con formato por moneda, tabla de clases completa (clase resaltada activa, resto enlazada a su ficha) y nota de variaciones oficiales; respetar tema oscuro y tokens argos-*. (61dca87d)

### Decisiones (ADR)
- ADR-0206 — patrimonio_fondo como campo de primer nivel, no anidado [Instrucción de Augusto]
- ADR-0207 — formatAumMoneda delega en formatAum en lugar de reimplementar [Instrucción de Augusto]
- ADR-0208 — buildClasesRows lee var_ytd_oficial/var_12m_oficial/honorario de c (fondo.clases[i]), no de un segundo parámetro ni de fci_master directo [Supuesto del agente] **⚠ REVISAR**
- ADR-0209 — Orden de las filas nuevas en buildFichaTecnicaRows [Supuesto del agente] **⚠ REVISAR**
- ADR-0210 — buildResumenFondo: Moneda como oración separada, no integrada al opening [Supuesto del agente] **⚠ REVISAR**
- ADR-0211 — formatNotaVariaciones retorna objeto en lugar de string [Supuesto del agente] **⚠ REVISAR**
- ADR-0212 — Guard de ClasesSection: n_clases > 1 en lugar de clases.length > 1 [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0072/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-01 — F-0073 completado

## Feature F-0073

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear `supabase/migrations/048_fci_explorador_variaciones_oficiales.sql` con `CREATE OR REPLACE VIEW public.fci_explorador AS ...` manteniendo exactamente las 15 columnas originales (id, nombre, ticker, moneda, administradora, sociedad_gerente, clasificacion_cod, rend_1d, rend_7d, rend_30d, rend_ytd, rend_1y, tna, rend_updated_at, patrimonio) en el mismo orden y tipo, donde `rend_ytd = COALESCE(CASE WHEN m.variaciones_fecha >= CURRENT_DATE - 7 THEN m.var_ytd_oficial END, r.rend_ytd)::numeric(10,6)` y `rend_1y` el equivalente con `m.var_12m_oficial`; conservar `WHERE m.activo = true`, sin `DROP VIEW`, sin tocar `fci_explorador_grupos`, con comentario que explique la regla (oficial CAFCI vigente primero, cálculo propio de respaldo) y un bloque ROLLBACK comentado con la definición actual completa de la vista. (cd46437e)
- [x] Step 2: Agregar un test vitest (en `src/**/__tests__`, leyendo el archivo con `node:fs`) que verifique que la migración `048_fci_explorador_variaciones_oficiales.sql` existe, contiene `CREATE OR REPLACE VIEW public.fci_explorador`, no contiene `DROP`, referencia `var_ytd_oficial`, `var_12m_oficial` y `variaciones_fecha`, aplica el cast `numeric(10,6)` a `rend_ytd` y `rend_1y`, y lista las 15 columnas originales en el orden original. (6eaee894)
- [x] Step 3: En `src/pages/FciExplorador.jsx` agregar la prop `tooltip` al `SortHeader` de las columnas `YTD` y `1Y` con los textos que explican el origen del dato (YTD: «Variación oficial CAFCI del año en curso; si no hay dato oficial vigente, cálculo propio de Argos»; 1Y: «Variación oficial CAFCI a 12 meses (la fecha base la define CAFCI); si no hay dato oficial vigente, cálculo propio a 1 año»), sin cambiar las etiquetas `YTD`/`1Y`, las claves de orden ni `SORT_COL`. (9f9c024e)

### Decisiones (ADR)
- ADR-0213 — Escala de var_ytd_oficial asumida igual a rend_ytd (sin factor 100) [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0073/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-01 — F-0074 completado

## Feature F-0074

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/features/fci/services/mercadoService.js`, en `getFondoFicha`, agregar dos consultas más a la tanda paralela (sin cambiar la firma pública ni el resto del shape): (a) `fci_master` con `.in('id', allClassIds)` seleccionando `id, var_ytd_oficial, var_12m_oficial, honorario_gerente_pct`; (b) `fci_prices` con `.in('fci_id', allClassIds)` filtrado a `fecha >= hoy-15 días`, orden `fecha` descendente, tomando la primera fila (vcp más reciente) por `fci_id`. Fusionar esos cuatro campos en cada elemento de `clases` (null si falta fila), manteniendo `ticker, tna, rend_30d, patrimonio, moneda` desde `fci_explorador`. Extender el test con supabase falso para verificar: (a) las clases traen los cuatro campos, (b) exactamente dos consultas nuevas (no N), (c) una clase sin precio reciente o sin fila en master queda con null sin romper a las demás. (9da77f10)
- [x] Step 2: En `src/features/fci/utils/fichaFondo.js`, ajustar `buildClasesRows` para que `vcp` llegue calculado desde `c.vcp` (redondeado a 6 decimales) cuando no se pasa `pricesByClassId`, manteniendo prioridad de `pricesByClassId` si viene y conservando el resto de la salida actual. Agregar tests en `__tests__/fichaFondo.test.js`: un fondo de 3 clases (Adcap Balanceado III, con una clase sin datos → null/'—') y un fondo de una sola clase; verificar que los tests existentes siguen verdes. (a8f9f510)
- [x] Step 3: En `src/features/fci/utils/fichaFondo.js`, agregar una función pura nueva (p. ej. `hasVariacionOficial(clase)` o `shouldShowNotaVariaciones(clase)`) que devuelva true solo si la clase tiene `var_ytd_oficial` o `var_12m_oficial` no nulos, sin tocar la firma ni salida de `formatNotaVariaciones`. Agregar tests con caso Parakeet (sin YTD/12M → false) y Adcap (con dato → true). (d64ce838)
- [x] Step 4: En `src/features/fci/utils/fichaFondo.js`, agregar a `buildResumenFondo` un parámetro opcional de ranking (sin romper llamadas ni tests existentes) que, cuando está disponible, incluya la frase del puesto en la categoría (p. ej. `Puesto 5 de 222 en Renta Mixta (ARS) por TNA 30D.`); si no viene ranking, la frase se omite. Agregar tests con y sin ranking. (e54eb21d)
- [x] Step 5: En `src/pages/FciFondoDetalle.jsx`, completar `ClasesSection` con las columnas: Clase, Ticker, Valor cuota (6 decimales), Patrimonio (`formatAumMoneda` según moneda de la clase), 30D, YTD, 12M, TNA 30D y Honorario gerente; quitar la columna `Moneda`; usar `pctCell`/`pctClass` para porcentajes y `—` por celda faltante; agregar `title="Variación oficial CAFCI"` a los encabezados YTD y 12M; mantener la clase abierta resaltada y las demás enlazadas a su ficha; envolver la tabla en `overflow-x-auto` para scroll horizontal, respetando tema oscuro y tokens `argos-*`. (168c522d)
- [x] Step 6: En `src/pages/FciFondoDetalle.jsx`, cablear la lógica de datos: condicionar el render de la nota `Datos oficiales CAFCI...` usando la nueva función pura (solo si la clase abierta tiene variación oficial) y pasar el ranking disponible (de `useFondoFicha`/`RankingSection`) a `buildResumenFondo` para que el párrafo de resumen muestre el puesto en categoría cuando exista. (67f72f57)

### Decisiones (ADR)
- ADR-0214 — Deduplicación de fci_prices en JS con loop de primera aparición [Supuesto del agente] **⚠ REVISAR**
- ADR-0215 — Fallback c.vcp aplica también cuando pricesByClassId se pasa pero no tiene entrada para la clase [Supuesto del agente] **⚠ REVISAR**
- ADR-0216 — Nombre de la función: `hasVariacionOficial` en lugar de `shouldShowNotaVariaciones` [Supuesto del agente] **⚠ REVISAR**
- ADR-0217 — Frase de puesto incluye "por TNA 30D" siempre, aunque no haya categoría ni total [Supuesto del agente] **⚠ REVISAR**
- ADR-0218 — hasVariacionOficial se aplica al objeto fondo (clase abierta), no a fondo.clases [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0074/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-01 — F-0075 completado

## Feature F-0075

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear función pura exportada `toNumber(value)` en `src/features/financing/utils/` (archivo nuevo, p. ej. `toNumber.ts`) que convierta `Decimal` (decimal.js), `number`, `string` numérico, `null` y `undefined` a un `number` finito, devolviendo `0` para todo valor no finito o no convertible. Agregar tests en `__tests__/` cubriendo: `new Decimal('7885573267.72')` → `7885573267.72`, `'12.5'` → `12.5`, `null` → `0`, `undefined` → `0`, `NaN` → `0`, y un número normal sin cambios. Primero escribir el test que reproduce el defecto (Decimal convertido correctamente a number). (0ef6f1b2)
- [x] Step 2: Crear función pura exportada `buildKpiData({ metrics, csvData, capyfi, sourceFilter })` en `src/features/financing/utils/` que contenga la lógica hoy inline en el `useMemo` de `FinancingKPIs.jsx` (`caucionData`, `capyfiData`, `kpiData`) y devuelva `{ capitalTotal, costoTotal, tnaPromedio, duracionPromedio, operaciones }` como `number`. Todo campo que venga de `metrics` (`capitalTotal`, `interesTotal`, `tnaPromedioPonderada`, `diasPromedio`, `totalOperaciones`) debe pasar por `toNumber` antes de cualquier operación aritmética; ninguna suma/resta/multiplicación debe mezclar `Decimal` con `number`. La ponderación de TNA y duración por capital se conserva igual que hoy. (c44e7726)
- [x] Step 3: Agregar tests para `buildKpiData` en `__tests__/`: (a) `sourceFilter='todas'` con `metrics` construido con `Decimal` y `capyfi` numérico → `capitalTotal` suma numérica correcta, `costoTotal` suma de costos, `tnaPromedio` promedio ponderado ≠ 0 con capital, `duracionPromedio` promedio ponderado ≠ 0 con duración, `operaciones` suma; (b) `sourceFilter='caucion'` → solo valores de `metrics`; (c) `sourceFilter='capyfi'` → solo valores de `capyfi`; (d) `metrics=null` y `csvData=null` con `capyfi` vacío → todo en 0 sin lanzar; más un test que reproduce el defecto original (Decimal en `capitalTotal` + `capyfi.capitalTotal` con decimales) verificando que el resultado no es `NaN` ni string. (93c0bf32)
- [x] Step 4: Conectar `FinancingKPIs.jsx` a `buildKpiData` reemplazando la lógica inline del `useMemo`, sin cambiar su API de props ni los formatters (`compactARS`, `formatARS`, `formatPercent`, `formatNumber`) ni el layout de 5 tarjetas `MetricCard`. Agregar en la tarjeta `Total Operaciones` (filtro `Todas`) un `tooltip` con el desglose real (`N cauciones + M eventos CapyFi`). (7c3c3967)
- [x] Step 5: En `FinancingDashboard.jsx`, usar `toNumber` en el bloque `Resumen de Operaciones` (líneas con `metrics?.capitalTotal`, `metrics?.tnaPromedioPonderada`, `metrics?.diasPromedio`) en lugar de la coerción implícita de `Decimal`, conservando los textos que hoy se ven correctos. Cambiar el rótulo del Resumen de 'Total de operaciones' a 'Total de cauciones'. (76b1361e)

### Decisiones (ADR)
- ADR-0219 — CapyfiKpis tipado como number | null | undefined (no Decimal) [Supuesto del agente] **⚠ REVISAR**
- ADR-0220 — Tooltip de desglose vía dos llamadas a buildKpiData en lugar de exponer sub-shapes [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0075/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-01 — F-0077 completado

## Feature F-0077

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Agregar `formatQuantity(value)` exportada en `src/utils/formatters.ts` (sin tocar `formatNumber`/`formatCuotapartes`): enteros sin decimales, fraccionarios con hasta 8 decimales sin ceros finales y coma decimal es-AR, `null`/`undefined`/`NaN` → `-`, `0` → `0`. Crear tests puros en `src/utils/__tests__/` cubriendo los casos del acceptance (560, 0.00834225, 0.00024893, 1.5, null, undefined, NaN, 0). (7e83717c)
- [x] Step 2: Usar `formatQuantity` en la columna de cantidad de `src/features/portfolio/components/GroupedPositionsTable.jsx` (reemplazando `formatNumber(pos.totalQuantity)`), en la cantidad de cada fila de la tabla de Transacciones (`TradesTabContent.jsx`) y en la cantidad de lote/trade de `PositionDetailModal.jsx`. Hacer grep de los usos de cantidad antes de editar; NO tocar los componentes de cripto (`CryptoPositionsTable`, `CryptoPositionDetailModal`) ni los de FCI (`formatCuotapartes`). (f1805ba4)
- [x] Step 3: Agregar la opción `Split` (valor `split`) al `<select>` Tipo de `src/features/portfolio/components/TradesTabContent.jsx`, junto a `Todos`/`Compra`/`Venta`, de modo que al elegirla la tabla filtre solo filas de tipo `split`. Si la lógica de filtrado es una extracción chica, extraerla a una función pura con test en `__tests__/`; si no, documentarlo en un ADR. (122097a3)
- [x] Step 4: Crear función pura `getTitleForPath(pathname)` (en `src/utils/` o equivalente) que mapee cada ruta a su título (`Overview · Argos`, `Posiciones · Argos`, `Fondos · Argos`, `Transacciones · Argos`, `Gráficos · Argos`, `Estrategia · Argos`, `Análisis de Spread · Argos`, `Financiación · Argos`, `Fondos en Caución · Argos`, `Préstamos DeFi · Argos`, `Explorador · Argos`, `Ficha de fondo · Argos` para `/fci/explorador/:id`, `Comparador · Argos`, `Administración · Argos`) y cualquier otra ruta (incluidas públicas) → `Argos Capital`. Agregar tests puros cubriendo el mapa completo y el fallback. (8372a7a9)
- [x] Step 5: Crear el hook `useDocumentTitle` que aplique `getTitleForPath(pathname)` a `document.title` al navegar, y conectarlo en `AppLayout.jsx` (o equivalente donde esté el layout común y acceso al pathname). (99879eff)
- [x] Step 6: Corregir el plural en `src/features/crypto/.../DefiLoanReconciliation.jsx` (alrededor de la línea 89) para que muestre `1 observación cargada` y `N observaciones cargadas` en lugar de `observaciónes`. Agregar test o ADR según corresponda. (435f615b)

### Decisiones (ADR)
- ADR-0221 — No extraer lógica de filtrado a función pura — ya es genérica [Instrucción de Augusto]
- ADR-0222 — Aliases de /portfolio/overview incluidos en el mapa exacto [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0077/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-01 — F-0076 completado

## Feature F-0076

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Agregar/crear el archivo de tests unitarios de `summarizeBenchmark` en `src/features/portfolio/services/__tests__/` (reusando setup de tests existentes de benchmarkService si los hay) con series sintéticas que cubran la aceptación (c): verificar que en ARS y USD con el mismo factor de conversión por fecha el `alpha` es idéntico y los retornos distintos. Los tests deben escribirse contra la nueva definición (base = netInvested) y pueden quedar en rojo hasta implementar el paso de cálculo. (ce3a2af7)
- [x] Step 2: Agregar en el mismo archivo de tests los casos de la aceptación (a) aportes escalonados (día 1: aporta 100, vale 100; día 2: aporta 900, netInvested 1000, cartera 1100, phantom 1050 → retorno cartera 10%, benchmark 5%, alpha ≈ 4,76%), (b) reproducción del defecto (primer punto chico + aportes grandes: la base vieja daría miles de %, la nueva decenas), (d) netInvested final 0 o negativo → null, y (e) serie vacía → null. (823bcb8a)
- [x] Step 3: Reescribir el cálculo de `portfolioReturn` y `benchmarkReturn` en `summarizeBenchmark` (`src/features/portfolio/services/benchmarkService.ts`) para usar como base el capital neto aportado del último punto (`netInvested`/`netInvestedUSD` según moneda): `retorno = (valor_final − netInvested_final) / netInvested_final × 100`. Dejar de usar `firstValid`/`portfolioBase`/`benchmarkBase`. Mantener `alpha` geométrico `((1 + rP) / (1 + rB) − 1) × 100` y conservar los `return null` por datos insuficientes (`totalInvested <= 0`, `portfolioCurrent <= 0`, `benchmarkCurrent <= 0`, guard de cobertura). No cambiar la firma pública de la función. (6f30eac9)
- [x] Step 4: Actualizar el comentario de la interfaz `BenchmarkSummary` (que hoy dice `alpha: diferencia portfolioReturn - benchmarkReturn`) y el JSDoc de `summarizeBenchmark` en `benchmarkService.ts` para reflejar la nueva definición: alpha geométrico y base = capital neto aportado (`netInvested`). (fe376c88)
- [x] Step 5: Ejecutar `npm test`, typecheck y `npm run build`; verificar que la suite de `summarizeBenchmark` pasa en verde y que no se introdujeron regresiones de tipos o build. Ajustar únicamente lo necesario para que los tres comandos pasen sin tocar `buildBenchmarkHistory`, `useBenchmark`, la serie/eje del gráfico ni el Overview. (fe376c88)

### Decisiones (ADR)
- ADR-0223 — Alpha invariante: test pasa con implementación actual Y nueva [Supuesto del agente] **⚠ REVISAR**
- ADR-0224 — (d) y (e) no se duplicaron — ya cubiertos en Step 1 [Supuesto del agente] **⚠ REVISAR**
- ADR-0225 — benchmarkReturn usa el mismo netInvested que portfolioReturn [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0076/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-02 — F-0078 completado

## Feature F-0078

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Agregar tests puros en `src/utils/__tests__/` para `formatUSD` (positivo con miles y decimales, redondeo, cero, `null`/`undefined`/`NaN`, negativo, negativo que redondea a cero) y para los negativos de `formatARS` y `formatUSDT`, cubriendo el formato es-AR con coma decimal y el signo `−` (U+2212) delante del prefijo. Los tests deben reflejar el comportamiento objetivo (quedarán en rojo hasta implementar). (58cd6aaf)
- [x] Step 2: Agregar tests puros en `src/utils/__tests__/` para `formatPercent` y `formatPercentNoSign` (negativos con `−` U+2212, positivo con `+`, casi-cero sin `−`) y para el nuevo helper `formatPercentDecimals` (con y sin signo, 1 y 2 decimales, `null`/`undefined`/`NaN`), reflejando el comportamiento es-AR objetivo. [Nota Cowork 2026-10-01: el step 2 se cerró a mano e incluye la implementación de formatPercent/formatPercentNoSign/formatPercentDecimals (firma { decimals, signed }); formatPercentNoSign conserva el signo de los negativos.] (3857fe1)
- [x] Step 3: Implementar en `src/utils/formatters.ts`: migrar `formatUSD` a locale `es-AR` manteniendo prefijo `US$ ` y los mismos guards; aplicar el patrón de signo `−` (U+2212) delante del prefijo en `formatARS`, `formatUSD` y `formatUSDT` usando `Math.abs(value)` y sin `-0` (valor que redondea a cero no lleva signo). No cambiar `formatAum`, `formatAumMoneda`, `formatCompactNumber`, `formatCuotapartes`, `formatQuantity`, `formatNumber` ni `formatDateAR`. (5a449919)
- [x] Step 4: [Ya implementado en el step 2 (commit 3857fe1). Verificar que formatPercent, formatPercentNoSign y formatPercentDecimals(value, { decimals = 2, signed = false }) cumplen la spec y, si cumplen, no cambiar nada.] En `src/utils/formatters.ts`: modificar `formatPercent` y `formatPercentNoSign` para usar `−` (U+2212) en negativos (positivo con `+` como hoy; casi-cero sin `−`), y agregar el helper exportado `formatPercentDecimals(value, { decimals = 2, signed = false })` para porcentajes en escala porcentaje, es-AR, con `−` real y guard a `—`/`-` según patrón del call site. (5a449919)
- [x] Step 5: Hacer grep de consumidores que inspeccionen el texto formateado de porcentajes con `startsWith('-')`/`includes('-')` o lo parseen (verificar que `src/components/ui/Badge.jsx` ya acepta `-` y `−`); ajustar en este mismo feature cualquier consumidor que solo acepte `-`, o documentar en un ADR corto si es riesgoso. (5a449919)
- [x] Step 6: Migrar el módulo FCI a `formatPercentDecimals` y `formatNumber`: en `FciFondoDetalle.jsx` (`fmtPct`, `fmtTna`, el `toFixed(1)` de ~línea 42, los `${Number(h.val).toFixed(2)}%` de ~402 y `honorario_gerente_pct` de ~494), `FciExplorador.jsx` (`pctCell`, `tnaCell`) y `ExploradorStatsBar.jsx` (`formatTna`), para que muestren coma decimal. (11144886)
- [x] Step 7: En `FciFondoDetalle.jsx` migrar a es-AR con `formatNumber(v, n)` los `tickFormatter`/`valueFormatter` del gráfico (~líneas 305 y 317) y el VCP (`c.vcp.toFixed(6)`, ~línea 482), conservando la misma cantidad de decimales visibles. (221ef7f4)
- [x] Step 8: Barrido de `.toFixed(` y `'en-US'` en `src/` (excluyendo tests) y migrar a es-AR los textos visibles: carry (`RatesEvolutionChart`, `SpreadComparatorChart`, `SpreadRealizedChart`, `useCarry*`, `useHistoricalRates` si alimentan labels/tooltips), financing (`CaucionesTable`), portfolio (`BenchmarkChart`, `PortfolioHeroChart`), `Admin.jsx`, `ComparadorChart`, `ComparadorTooltip`; y `PositionDetailModal.jsx:25` a `formatDateAR` (o `es-AR` con mismas options si muestra mes en letras a propósito). No tocar inputs, `value=`, CSV ni notas internas. (0df79312)
- [x] Step 9: Escribir un ADR corto que liste cada `.toFixed(` restante en el código justificando que corresponde a los casos excluidos (inputs `type=number` como `DefiLoanModal`/`NexoLoanModal`/`ConversionModal`/`LocalCsvUploader`, export CSV de `ComparadorTable.jsx` ~línea 19, `notes:` de `fciService.js`, claves/datos no mostrados), y documentar cualquier consumidor de `formatPercent` que se haya dejado sin ajustar. (6f33d16c)
- [x] Step 10: Ejecutar `npm test`, typecheck y `npm run build`; verificar que los nuevos tests pasan y que los existentes (`formatAumMoneda`, `GroupedPositionsTable.columns`, `benchmarkService`) siguen verdes, ajustando cualquier regresión sin cambiar cálculos ni datos. (6f33d16c)

### Decisiones (ADR)
- ADR-0226 — roundsToZero check en importes monetarios (no solo en porcentajes) [Supuesto del agente] **⚠ REVISAR**
- ADR-0227 — Bug de doble signo en OperationsPositionCards/OperationsTab considerado pre-existente y fuera de scope [Supuesto del agente] **⚠ REVISAR**
- ADR-0228 — formatPercentDecimals para ticks de porcentaje en gráficos [Supuesto del agente] **⚠ REVISAR**
- ADR-0229 — Alcance de la corrección del double-sign en celdas de PnL carry [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0078/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-02 — F-0079 completado

## Feature F-0079

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear función pura `contrastRatio(fgHex, bgHex)` (WCAG 2.x, luminancia relativa) en `src/utils/` con sus tests unitarios en `__tests__/` que cubran casos conocidos (negro/blanco = 21:1, pares del design system). (31efaf58)
- [x] Step 2: Agregar un test puro que lea los valores de `--ink-mute`/`--ink-faint` de `src/index.css` y `ink.mute`/`ink.faint` de `tailwind.config.js` y verifique: (a) CSS y Tailwind coinciden, (b) cada uno >= 4,5:1 contra `--bg`, `--surface`, `--surface-2` y `--surface-3` usando `contrastRatio`, (c) ink-mute más claro que ink-faint. Debe quedar en rojo con los valores actuales. (25a01b74)
- [x] Step 3: Cambiar los tokens de texto secundario: `--ink-faint`/`--text-tertiary` de `#5A5E68` a `#868B95` y `--ink-mute`/`--text-secondary` de `#8A8F99` a `#A3A8B2` en todos los bloques de `src/index.css` (~líneas 29-30, 39-40, 60-61) y en `tailwind.config.js` (`ink.mute`, `ink.faint`). Hacer grep de los literales `#5A5E68` y `#8A8F99` en `src/` y reemplazar usos hardcodeados por el token. El test del paso anterior debe pasar. [Nota Cowork 2026-10-02: cerrado a mano; los comentarios de fixtures de contrastUtils.contrastRatio.test.ts se aclararon como valores históricos pre-AR-053.] (461ec4c)
- [x] Step 4: Reemplazo mecánico de tamaño mínimo: todos los `text-[9px]` y `text-[10px]` de `src/` pasan a `text-[11px]`, y los `fontSize` de 9 o 10 en props de gráficos (ticks de Recharts, `style={{ fontSize }}`) suben a 11. No tocar textos de 11px o más. Si algún contenedor desborda, ajustar el contenedor (no volver a 10px) y anotarlo en un ADR corto. (53788776)
- [x] Step 5: Ampliar áreas táctiles a >= 32×32px en los controles interactivos compactos de las pantallas principales (empezar por Overview: chips de rango y botones de ícono), usando padding, `min-h-8 min-w-8` o área clicable ampliada SIN agrandar el ícono ni cambiar el diseño visible. No tocar los controles que ya miden >= 32px. (95e73e6e)
- [x] Step 6: Agregar `aria-label` en español descriptivo a todo botón que solo tiene un ícono (sin texto visible). Hacer grep de `<button` con hijo ícono en `src/components`, `src/features` y `src/pages` y completar los que falten, sin cambiar comportamiento ni diseño. (4183df94)
- [x] Step 7: Agregar prop `as` (default `h2`) al componente compartido de título de sección/tarjeta y corregir la jerarquía de encabezados en las páginas principales (Overview, Posiciones, Fondos, Financiación, Explorador) para que no salten niveles (h1→h2→h3), sin cambiar clases ni apariencia. (e5231d70)

### Decisiones (ADR)
- ADR-0230 — Nombre del archivo `contrastUtils.ts` (no `colorUtils.ts`) [Supuesto del agente] **⚠ REVISAR**
- ADR-0231 — Parsear tailwind.config.js como texto en lugar de importarlo dinámicamente [Supuesto del agente] **⚠ REVISAR**
- ADR-0232 — Tamaño mínimo fijado en 11 px (no 12 px) [Supuesto del agente] **⚠ REVISAR**
- ADR-0233 — min-h-8 + flex centering vs. solo min-h-8 en chips de texto [Supuesto del agente] **⚠ REVISAR**
- ADR-0234 — title= se conserva junto a aria-label; no se elimina [Supuesto del agente] **⚠ REVISAR**
- ADR-0235 — `titleAs` en Card en lugar de `as` [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0079/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-02 — F-0080 completado

## Feature F-0080

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Agregar un test puro en `src/utils/__tests__/` (patrón de `contrastUtils.designTokens.test.ts`: leer fuentes con `fs`, sin testing-library) que falle con el estado actual: (a) verifica que ninguna línea de `src/**/*.{jsx,tsx}` combine `bg-profit` sólido con `text-white` (salvo excepciones documentadas), y (b) verifica con `contrastRatio` que el color de texto oscuro elegido tenga >= 4,5:1 contra `#2FD4CD`. (2b25fffc)
- [x] Step 2: Exponer el token `--teal-ink` (#06302E) como clase de Tailwind en `tailwind.config.js` si aún no está disponible (hacer grep de `teal-ink` para confirmar cómo se expone), reutilizando el token existente de `src/index.css` sin crear paleta nueva. (2b25fffc)
- [x] Step 3: Corregir los 14 botones principales `bg-profit text-white` para que el texto use el color oscuro `teal-ink` (>= 4,5:1 sobre el relleno) en: `TradesTabContent.jsx`, `FciPortfolio.jsx`, `Fci.jsx`, `FciLotModal.jsx`, `FciLotTable.jsx`, `FinancingDashboard.jsx`, `FundingCiclosTab.jsx`, `FundingConversionesTab.jsx`, `TradeJournal.jsx`, `CryptoPortfolio.jsx`, `DefiLoans.jsx` y `NexoLoans.jsx`, ajustando hover, foco, íconos y estados deshabilitados; los botones translúcidos (`bg-profit/10`, `bg-profit-muted`) no cambian. (262751c0)
- [x] Step 4: Ampliar las áreas táctiles del chrome de la app (`Topbar.jsx`, `Sidebar.jsx`, `MobileHeader.jsx`, `NotificationsBell.jsx`) a >= 32×32 px de área clicable con padding, `min-h-8 min-w-8` o área ampliada por pseudo-elemento, SIN agrandar el ícono ni mover el layout visible del header ni de la barra lateral. (1317cbe7)
- [x] Step 5: Ampliar a >= 32 px de alto y ancho los chips y botones de filtro de las pantallas principales (Transacciones `1M`/`3M`/`6M`/`YTD`/`1A`/`Max`; Financiación `Todas`/`Caución`/`CapyFi`; Explorador `Todos`/`ARS`/`USD` y chips de categoría; Fondos `Ver en FCI`/`Ver Historial`/`Nueva Operación`) reutilizando el patrón F-0079 (`min-h-8` + `flex items-center justify-center`), conservando tamaño de letra, bordes y fondos; los que ya miden >= 32 no cambian. (3982068e)
- [x] Step 6: Ampliar a >= 24×24 px el área clicable de los controles dentro de filas de tabla (botones de ícono de filas en Fondos y similares, links de nombre de fondo del Explorador) usando pseudo-elemento con `inset` negativo sobre contenedor `relative` o el link ocupando la celda, SIN cambiar el alto de las filas ni su densidad. (262361cb)
- [x] Step 7: Hacer grep de `<button` y `<a` con hijo ícono en `src/components`, `src/features` y `src/pages` (p. ej. `FciLotTable.jsx`, `FciLotsList.jsx`, `FciPortfolio.jsx`, filas del Explorador) y agregar `aria-label` en español descriptivo a todo botón/link de solo ícono sin texto visible que aún no lo tenga, conservando `title` y sin cambiar comportamiento ni diseño. (41774022)
- [x] Step 8: Reemplazar el uso del color de categoría (`#6B7280` de `Bonos`) como color de texto por `ink-mute` (o derivado con >= 4,5:1) en `AllocationPanel.jsx`, `GroupedPositionsTable.jsx`, `FundingCiclosTab.jsx`, `ComparadorLegend.jsx` y `DashboardOverview.jsx`, conservando el color de categoría solo como relleno, punto o borde de leyendas y gráficos; `utils/constants.ts` no cambia mientras se use solo como relleno. (4acc9557)

### Decisiones (ADR)
- ADR-0236 — Color de texto de reemplazo fijado como teal-ink leído desde index.css [Supuesto del agente] **⚠ REVISAR**
- ADR-0237 — Áreas táctiles 32px — crecimiento de secciones internas del sidebar [Supuesto del agente] **⚠ REVISAR**
- ADR-0238 — Pseudo-element solo hacia arriba en el link de nombre de fondo [Supuesto del agente] **⚠ REVISAR**
- ADR-0239 — Alcance de aria-label extendido a label-como-botón y nav Links con texto condicional [Supuesto del agente] **⚠ REVISAR**
- ADR-0240 — Alcance real de F-0080 step 8 es 2 archivos, no 5 [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0080/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-03 — F-0081 completado

## Feature F-0081

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En src/components/layout/Topbar.jsx, ampliar a >= 32 px el área clicable de los dos botones del toggle ARS/USD (CurrencyToggle, ~líneas 26-42): agregar `min-h-8` + `flex items-center justify-center` a cada botón, conservando el texto `text-[11px]`, fondos, bordes y la lógica de useCurrencyPreference. No tocar el toggle equivalente de MobileHeader.jsx que ya cumple. (58e8c2a8)
- [x] Step 2: En src/components/layout/Topbar.jsx, ampliar el link del logo `ARGOS CAPITAL` (~línea 61-72) a >= 32 px de alto: agregar `min-h-8` + `flex items-center` al Link, sin cambiar el tamaño del `<img>` (w-6 h-6), el texto ni la posición visible, verificando que no desborde el header `h-12`. (931d00d0)
- [x] Step 3: Hacer grep de la ruta `/portfolio/fondos` para confirmar si el componente activo es src/pages/FciPortfolio.jsx o src/pages/Fci.jsx (o ambos). Documentar el resultado; si uno de los dos es código muerto, anotarlo en un ADR corto en docs/adr/ y no modificarlo. (931d00d0)
- [x] Step 4: En el/los archivo(s) de Fondos confirmados (FciPortfolio.jsx líneas ~213/287/312 y/o Fci.jsx líneas ~217/291/316), ampliar a >= 32 px de alto los botones de acción `Ver en FCI`, `Ver Historial`/`Ver Posiciones` y `Nueva Operación` usando `min-h-8` + `flex items-center justify-center`, conservando letra, colores y bordes. (5f894a3f)
- [x] Step 5: En src/pages/FciExplorador.jsx, ampliar a >= 32×32 px los botones de paginación `Página anterior` y `Página siguiente` (~líneas 542 y 553): reemplazar `p-1.5` por `min-w-8 min-h-8` + `flex items-center justify-center`, conservando los `aria-label`/`title`, el icono ChevronLeft/Right y el estado disabled. (7bef77ff)
- [x] Step 6: Ejecutar `npm test`, el typecheck y `npm run build` para confirmar que todo pasa sin errores tras los cambios de presentación. (7bef77ff)

### Decisiones (ADR)
- ADR-0241 — Step 4 cubre solo los tres botones de acción; las pills de sub-tab son de step 5 [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0081/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-03 — F-0082 completado

## Feature F-0082

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/features/portfolio/components/PortfolioCharts.jsx`, eliminar el bloque fijo `Analyst Insight` completo (el `<div className="p-4 bg-primary/5 ...">` con el título `Analyst Insight` y el texto fijo `"Che, mirá bien la concentración en el Treemap..."`, últimas líneas del contenedor `space-y-6`), cuidando de no borrar el cierre del contenedor ni del componente, y manteniendo el espaciado entre secciones (sin hueco ni margen extra al final). (eabdbb37)
- [x] Step 2: En `src/features/portfolio/components/PortfolioCharts.jsx`, limpiar cualquier import, variable, constante o estilo que quede sin uso tras remover el bloque; verificar con grep que ni `Analyst Insight` ni el texto fijo quedan en ningún archivo de `src/`. Sin cambios de cálculo, datos, rutas ni esquema. (eabdbb37)
- [x] Step 3: Ejecutar `npm test`, el typecheck (`tsc --noEmit` o el script configurado) y `npm run build`; confirmar que los tres pasan sin errores tras la eliminación del bloque. (eabdbb37)

### QA
Screenshots en `orchestrator/qa-artifacts/F-0082/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-04 — F-0083 completado

## Feature F-0083

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear un helper puro y testeado en `src/lib/dedupeInFlight.js` (o `.ts`) que exporte `dedupeInFlight(fn)` y `memoizeAsync(fn, ttlMs)`: comparte la promesa de una llamada en curso entre invocaciones concurrentes con los mismos argumentos (clave estable por serialización de args) y, opcionalmente, cachea el resultado por TTL. Una promesa rechazada se elimina del mapa (no se cachea; el error se propaga a todos los que la esperaban). Incluir tests puros con vitest que cubran: concurrencia (una sola ejecución de `fn` para N llamadas simultáneas), falla sin caché (reintento tras rechazo), expiración de TTL, y claves distintas por argumentos distintos. (a0a1e429)
- [x] Step 2: Aplicar el helper en `mepService.getHistory` y `usdtService.getHistory` envolviendo la carga con `dedupeInFlight`/`memoizeAsync` para que las llamadas concurrentes (PortfolioContext, Dashboard.jsx, usePortfolioHistory, useBenchmark) compartan una única consulta a `mep_history` y `usdt_history`. Conservar la caché de 1 h existente (`cachedHistory`/`lastUpdate`) y devolver exactamente el mismo resultado (mezcla de histórico local + base) que hoy. (e6fcf9c2)
- [x] Step 3: Aplicar el helper en `eodHistoryService.getEodSeries` para deduplicar llamadas concurrentes por ticker: dos llamadas simultáneas al mismo ticker comparten la consulta a `daily_prices`. Conservar la caché de 1 h (`cache`, `TTL`) y la regla de no cachear series vacías. (bb148582)
- [x] Step 4: En `src/features/fci/hooks/useFciLotEngine.js`, sacar `loadLugares()` del `useEffect` que dispara `loadLots` para que se ejecute una sola vez por montaje (no por cada cambio de `portfolioId`). Si `lugares` depende de `portfolioId`, cargarlo una vez por valor de `portfolioId` y reutilizar (React Query con clave estable o el helper). NO consolidar las 5 consultas de `loadLots` sobre `fci_lots`/`fci_rescates` (fuera de alcance). Mantener los comentarios de trazabilidad AR-0xx y evitar loops de refetch / doble ejecución en StrictMode. (2eb9976c)
- [x] Step 5: Inventariar y deduplicar las consultas a `fci_prices` que se disparan al cargar el Overview (`fciService.js` líneas ~79, ~100, ~115, ~136, ~211; `mercadoService.js`; `portfolioHistoryService.ts` ~361 / `loadFciPortfolioData`). Usar el helper de promesas en vuelo / `getPricesBatch` para que el mismo conjunto de fondos no se consulte repetidamente, dejando como máximo 3 consultas distintas (las que realmente necesitan columnas o rangos diferentes se conservan). Preservar los contratos existentes: `.single()`→null vs array ASC con `reverse`, y el emparejamiento por fecha exacta del VCP anterior. No agregar filtros de fecha que cambien resultados. (bddac7bf)
- [x] Step 6: Ejecutar `npm test` (incluyendo los nuevos tests del helper y los existentes de fci/portfolio), typecheck y `npm run build`; corregir cualquier fallo de tipos, lint o tests que surja de los cambios anteriores, asegurando que no cambien valores mostrados ni la forma de los datos. (bddac7bf)

### Decisiones (ADR)
- ADR-0242 — Serialización de args con JSON.stringify como clave del mapa [Supuesto del agente] **⚠ REVISAR**
- ADR-0243 — Error de Supabase se convierte en throw dentro de _fetchFromDB [Supuesto del agente] **⚠ REVISAR**
- ADR-0244 — Separar effects en lugar de usar eslint-disable para la carga de lugares [Instrucción de Augusto]
- ADR-0245 — Derivar latestPrice desde getRecentPrices en vez de mantener getLatestPrice separado [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0083/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-04 — F-0084 completado

## Feature F-0084

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear el módulo puro `src/lib/finance/marketCalendar.ts`: constante `MARKET_HOLIDAYS` (YYYY-MM-DD) con SOLO las fechas verificadas (2026-10-12, 2026-11-09, 2026-11-23, 2026-12-08, 2026-12-25, 2027-01-01), con comentario de fuentes y nota de actualización anual; y `getMarketStatus(now: Date)` que usa ART fijo UTC-3, ventana lunes-viernes 10:00–17:59:59 (reusando las constantes de `priceRefresh.ts`) y devuelve `{ state, reason?, lastCloseDate }` calculando el último día hábil con rueda ya cerrada, excluyendo fines de semana y feriados. Agregar helper interno para detectar feriado/día hábil. Incluir el test `src/lib/finance/__tests__/marketCalendar.test.ts` con todos los casos de la aceptación (bordes 09:59/10:00/17:59/18:00, sábado, domingo, lunes feriado 2026-10-12 con lastCloseDate 2026-10-09, martes post-feriado antes de 10:00, conversión ART vs UTC, viernes/sábado apuntando al mismo viernes) más el test de que `MARKET_HOLIDAYS` está ordenada, sin duplicados y con formato válido. (24158575)
- [x] Step 2: Modificar `isPriceWindowART` en `src/lib/finance/priceRefresh.ts` para que consulte el calendario de feriados (un feriado entre semana cuenta como fuera de ventana, usando el intervalo lento de polling), reutilizando la lógica/helpers de `marketCalendar.ts` sin duplicar constantes. Verificar que los tests existentes de `priceRefresh` siguen verdes (sus fechas no son feriados). (5bc99e39)
- [x] Step 3: Crear el componente compartido `MarketStatusIndicator` que combina el estado de mercado (`getMarketStatus`) con `usePrices().isFetching` y expone los tres estados: (a) abierta sin descarga → punto `bg-teal` + `En vivo`; (b) abierta con descarga → punto `bg-warning animate-pulse` + `Actualizando…`; (c) cerrada → punto `bg-ink-faint` sin animación + `Mercado cerrado` con sufijo opcional `· cierre vie 02/10` (día abreviado + DD/MM es-AR, usando `formatDateAR` de `src/utils/formatters.ts` si sirve) a partir de `lastCloseDate`. Con mercado cerrado nunca mostrar `Actualizando…`. Soportar prop para versión corta (sin fecha) vs completa. Accesibilidad: texto `text-ink-mute`/`text-ink-faint`, mínimo 11 px, punto `aria-hidden`, contenedor con `aria-live="polite"`/`role="status"` que solo anuncie al cambiar el estado real. Incluir `setInterval` de 60 s con limpieza al desmontar que recalcula el estado sin disparar consultas a Supabase. (03439c5d)
- [x] Step 4: Reemplazar `LiveIndicator` en `src/components/layout/Topbar.jsx` por `MarketStatusIndicator` en su versión corta (`hidden md:flex`, `Mercado cerrado` sin fecha), eliminando el literal `En vivo`/`Actualizando…` duplicado y manteniendo el layout/espaciado del topbar. (b0480e55)
- [x] Step 5: Reemplazar `LiveDot` en `src/features/portfolio/components/PortfolioHeroChart.jsx` por `MarketStatusIndicator` en su versión completa (con la fecha de cierre junto al gráfico), sin tocar el resto del hero chart ni del Overview, y confirmar que `npm test`, typecheck y `npm run build` pasan. (e0d6df61)

### Decisiones (ADR)
- ADR-0246 — `lastCloseDate` se devuelve también cuando `state = 'open'` [Supuesto del agente] **⚠ REVISAR**
- ADR-0247 — Dependencia circular entre priceRefresh y marketCalendar [Supuesto del agente] **⚠ REVISAR**
- ADR-0248 — Separar el live-region de aria-live del label visible [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0084/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-05 — SP-021: Renovar préstamos solo interés (novación) y fusión

**Commit:** kredy c769c33 (main, deploy READY)
**Qué se hizo:** Nueva acción Renovar en préstamos solo interés (planificador puro, router tRPC y diálogo), 21 tests con mutación. Aplicada en prod: dos préstamos de US.000 al 10% de Iván Néstor fusionados en uno de US.000 al 8% mensual (US/mes), cobro de US registrado el 2026-10-05; los anteriores quedan efinanced. Decisión en ADR-0249. Pendiente: verificar la TIR proyectada -7,22%.

## 2026-10-06 — F-0086 completado

## Feature F-0086

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/features/portfolio/services/mepService.ts`, extraer una función pura exportada (p. ej. `deriveCurrentRate(history)`) que, dado un historial ya resuelto y ordenado descendente, devuelva `history[0].price` (con guardas para historial vacío cayendo al fallback local). No cambiar firmas existentes de `getHistory`/`getCurrentRate`/`findClosestRate`; solo agregar el helper reutilizable para que el contexto derive el rate del historial resuelto. (1f456fa4)
- [x] Step 2: Agregar test unitario rojo en vitest (en `__tests__` del servicio) que reproduzca la carrera: dado un historial remoto cuyo último dato es `{ date: '2026-10-05', price: 1537.9 }` mientras el JSON local termina en `2026-01-26 / 1468.93`, el rate derivado del historial resuelto debe ser `1537.9` y nunca `1468.93`. (8f00921d)
- [x] Step 3: Agregar test del caso de fallback: si `getHistory()` falla y devuelve `localHistory`, el rate derivado usa el último dato local (comportamiento actual sin cambios), verificando que `deriveCurrentRate(localHistory)` devuelve el último cierre embebido. (98a43e5e)
- [x] Step 4: Modificar `loadMep` en `src/features/portfolio/components/PortfolioContext.jsx`: eliminar `mepService.getCurrentRate()` del `Promise.all` junto a `getHistory()`, y derivar `mepRate` del historial ya resuelto por `getHistory()` (usando el helper `deriveCurrentRate` o llamando a `getCurrentRate()` recién después de que `getHistory()` resolvió). No tocar ninguna fórmula ni otros consumidores de `mepRate`. (d2dbd883)
- [x] Step 5: Correr `grep -rn mepRate src` para listar los 17 consumidores fuera de tests y confirmar que ninguno requiere edición propia; dejar la evidencia lista para el cuerpo del PR. Ejecutar `npm test` y typecheck completos y verificar que pasan. (223b6be2)

### Decisiones (ADR)
- ADR-0250 — Fallback de `deriveCurrentRate` al `localHistory` del módulo, no a `CONSTANTS.MEP_DEFAULT` [Supuesto del agente] **⚠ REVISAR**
- ADR-0251 — El RED test de la carrera MEP await-ea getCurrentRate() y entra el remoto por el canal real de supabase [Supuesto del agente] **⚠ REVISAR**
- ADR-0252 — Separar el green de `getCurrentRate` async en su propio commit de implementación [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0086/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-06 — F-0087 completado

## Feature F-0087

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `src/utils/formatters.ts` agregar el helper `formatPp` (porcentaje en puntos porcentuales: mismo signo U+2212/+ y regla de redondeo a cero que `formatPercentDecimals`, coma decimal es-AR, sufijo `pp`), reutilizando la lógica de signo ya existente sin duplicarla. No tocar consumidores todavía. Agregar en `src/utils/__tests__/` un test por helper tocado o creado (`formatPp` seguro; y `formatPercent`/`formatPercentDecimals` si se refactorizan) cubriendo caso positivo, negativo (U+2212), cero según la regla vigente de `formatPercent`, y null. (cba1bd8e)
- [x] Step 2: Antes de reemplazar, correr una búsqueda con regex multilínea (`'\+'\s*:\s*''\}\s*\{?\s*formatNumber`) acotada a `src/**/*.{js,jsx,ts,tsx}` para confirmar los 8 sitios de la aceptación y detectar variantes multilínea no listadas; dejar registrada la lista definitiva (sin modificar código en este paso). (cba1bd8e)
- [x] Step 3: Migrar los badges de P&L % de posiciones en `GroupedPositionsTable.jsx:146` (`PnlPctBadge`) y `MobilePositionsList.jsx:77` del patrón manual `{x >= 0 ? '+' : ''}{formatNumber(x, n)}%` a `formatPercent`/`formatPercentDecimals` de `@/utils/formatters`, para que una posición con pérdida muestre `−2,19%` con menos real. Sin cambios de cálculo. (63446bff)
- [x] Step 4: Migrar los sitios de porcentaje manual en `DistributionChart.jsx:139` y `CurrencyRiskCard.jsx:10` a `formatPercent`/`formatPercentDecimals`, emitiendo `+`/`−` (U+2212) y coma decimal. Sin cambios de cálculo ni datos. (39a7752c)
- [x] Step 5: Migrar los deltas en puntos porcentuales de Estrategia a `formatPp`: `TargetAllocation.jsx:65`, `CompoundProjection.jsx:103` y `ReinvestmentTracker.jsx:156`, de modo que el delta de asignación muestre `−43,0pp` con menos real. Sin cambios de cálculo. (ba81eb7b)
- [x] Step 6: Migrar el delta `pp` de carry en `DashboardTab.jsx:125` a `formatPp` (mismo signo y redondeo). Sin cambios de cálculo ni datos. (5119f207)
- [x] Step 7: Corregir el formateo de las stats de Spread: las cuatro tarjetas de `RatesEvolutionChart.jsx` (SPREAD PROM., MÁX, MÍN, ACTUAL) que interpolan `${stats.x}%` crudo y las de `SpreadRealizedChart.jsx:177` deben pasar por `formatPercent`/`formatPercentDecimals` para mostrar coma decimal y menos real (p. ej. `17,75%`, `−4,63%`). `stats.*` ya son números; solo cambia el string mostrado, no el cálculo. (a5eccf31)
- [x] Step 8: Eliminar las apariciones de `u$s` en `PositionDetailModal.jsx:615`, `FciLotsList.jsx:76`, `FciPendingLots.jsx:118,129` y `FciPendingRescates.jsx:111,122`, reemplazándolas por `formatUSD` o el prefijo `US$ ` con número es-AR (decisión AR-057/F-0078). Cuidar las ramas ternarias `isUSD`/`currency` para no duplicar el prefijo de moneda. Sin cambios de cálculo. (a6167669)
- [x] Step 9: Verificación final: correr `grep` de `'+' : ''}{formatNumber` y de `u\$s` acotado a `src/` (excluyendo tests) para confirmar cero remanentes, y ejecutar `npm test` y el typecheck completos hasta que pasen. (a6167669)

### Decisiones (ADR)
- ADR-0253 — Extensión de formatPercentDecimals con parámetro `suffix` para reusar lógica en formatPp [Supuesto del agente] **⚠ REVISAR**
- ADR-0254 — CompoundProjection:103 y ReinvestmentTracker:156 migrados a `formatPercent`, no a `formatPp` [Supuesto del agente] **⚠ REVISAR**
- ADR-0255 — `formatPercentDecimals` sin `signed` en lugar de `formatPercent` para las stats de Spread [Supuesto del agente] **⚠ REVISAR**
- ADR-0256 — VCP en USD: template literal vs formatUSD para 6 decimales [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0087/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-06 — F-0089 completado

## Feature F-0089

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear helper puro `getFciDayLabel(latestDate, now)` en `src/features/fci/utils/` que, reutilizando la fecha ART de `src/lib/finance/marketCalendar.ts`, devuelva los rótulos a usar (título de tarjeta `P&L HOY` vs `P&L ÚLTIMO VCP`, subtítulo `al DD/MM` con `formatDateAR`, y encabezado de columna `PnL Diario` vs `P&L últ. día`) según si el último VCP es de hoy o no. Agregar tests con vitest: VCP de hoy, VCP del viernes visto un lunes, y sin VCP. (5289ea08)
- [x] Step 2: Aplicar `getFciDayLabel` en la tarjeta `P&L HOY` de `/portfolio/fondos` y `/carry-trade/fondos-en-caucion` (page `src/pages/Fci.jsx`) usando `priceDate` expuesto por `useFciLotEngine.js:268` (con fallback a la fecha que ya muestra la fila si falta), y en el encabezado de columna `PnL Diario` de `FciLotTable.jsx:222`. No cambiar ningún valor numérico. (20b9465e)
- [x] Step 3: Crear helper puro `getFuenteQueConviene(fuentes, umbralPp = 0.5)` en utils de carry que devuelva la fuente más barata solo si la diferencia con la siguiente es ≥ 0,5 pp, y null en caso contrario. Agregar tests: diferencia de 0,05 pp → null; exactamente 0,5 pp → la más barata; caso de 3 fuentes; y 1 sola fuente → null. (0bfac7a9)
- [x] Step 4: Aplicar `getFuenteQueConviene` en `DashboardTab.jsx:78-141` (`¿Dónde financiar hoy?`): mostrar el badge `Conviene` y el resaltado de fila (`bg-primary/10 border-primary/30`) solo cuando el helper devuelve una fuente; cuando devuelve null, no marcar ninguna fila y mostrar en el pie `Sin diferencia relevante (menos de 0,5pp)`; cuando hay fuente, mantener el pie con el ahorro usando `formatNumber`. (15848937)
- [x] Step 5: Crear helper puro `isActive(itemPath, currentPath)` para la navegación (con la regla: `Carry` activo en cualquier ruta que empiece con `/carry-trade/`; `Inicio` en `/portfolio/overview` y `/portfolio`; `Posiciones` en `/portfolio/posiciones`) y agregar test del helper con las 4 rutas de carry. (de790bf3)
- [x] Step 6: Aplicar el helper `isActive` en `MobileNav.jsx` para el bottom nav mobile y agregar `aria-current='page'` al ítem activo. (c0c1e55f)
- [x] Step 7: Agregar `aria-current='page'` al link activo del sidebar desktop en `Sidebar.jsx:63-80`. (b9764ea4)
- [x] Step 8: Corregir microcopy: plural correcto `1 vigente` / `N vigentes` (`DashboardTab.jsx:291`); `Generando: $ …` con espacio (`DashboardTab.jsx:412`); y `Capital promedio por operación: $ …` con prefijo `$` usando `formatARS` en `FinancingDashboard.jsx:306`. (4f2328e7)

### Decisiones (ADR)
- ADR-0257 — Subtítulo formateado como "al DD/MM" (sin año) [Supuesto del agente] **⚠ REVISAR**
- ADR-0258 — Derivar latestDate como el máximo de los priceDate de las posiciones [Supuesto del agente] **⚠ REVISAR**
- ADR-0259 — Ubicación del helper en `src/lib/finance/` en lugar de un directorio "utils de carry" nuevo [Supuesto del agente] **⚠ REVISAR**
- ADR-0260 — Corrección del cálculo de ahorro en el pie de FundingVerdictCard [Supuesto del agente] **⚠ REVISAR**
- ADR-0261 — Carry activo por prefijo de sección, no por mapeo individual de rutas [Supuesto del agente] **⚠ REVISAR**
- ADR-0262 — Confiar en formatARS para el prefijo `$` en lugar de anteponerlo a mano [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0089/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-07 — F-0088 completado

## Feature F-0088

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear una función pura `getHeroChartState({ loading, historyLoading, pointsCount })` que devuelva 'skeleton' | 'chart' | 'empty' en `src/utils/` (o junto a los helpers de chart), sin tocar UI. Reglas: si loading/historyLoading es true → 'skeleton'; si terminó de cargar y pointsCount < 2 → 'empty'; si pointsCount >= 2 → 'chart'. Agregar test de vitest cubriendo: historyLoading=true con 0 puntos → 'skeleton'; historyLoading=false con 0 puntos → 'empty'; 2+ puntos → 'chart'. No agregar Testing Library ni jsdom. (a1b56c32)
- [x] Step 2: Propagar un prop nuevo `historyLoading` (desde `portfolioHistory.isLoading`, ya expuesto en `Dashboard.jsx:114-125`) a través de `DashboardOverview.jsx` hacia las dos instancias de `PortfolioHeroChart` (líneas ~207 y ~259). En `PortfolioHeroChart.jsx`, reemplazar la decisión actual de render por el resultado de `getHeroChartState(...)`: mostrar el skeleton existente (`bg-white/[0.02] animate-pulse`, L233) mientras el estado sea 'skeleton', y mostrar 'Sin datos para este período' solo cuando el estado sea 'empty'. Mantener el render del gráfico cuando sea 'chart'. (46cd4ded)
- [x] Step 3: En `PositionDetailModal.jsx`, ajustar el `YAxis` del gráfico de precio histórico (~L609-620) para que el dominio se adapte a los datos con margen y no arranque en 0, p. ej. `domain={[dataMin => dataMin * 0.98, dataMax => dataMax * 1.02]}`. El ajuste debe calcularse sobre la serie back-ajustada (`adjustedHistorical`) y mantener la conversión ARS/USD por `mepRate` en el `tickFormatter`. Solo aplicar el dominio cuando hay serie (evitar NaN/dominio vacío). (a74360d9)
- [x] Step 4: En la tabla 'Historial de Operaciones' del mismo `PositionDetailModal.jsx`, agregar `whitespace-nowrap` a las celdas de montos (precio, invertido, valor actual, resultado, % resultado) para que a ~1492px ningún monto se parta en dos líneas. Cambio puramente de clases Tailwind. (606b9ab5)
- [x] Step 5: En `TopPerformersChart.jsx` (~L59-72), configurar el `YAxis` con `interval={0}` y un ancho suficiente para mostrar las 10 etiquetas de ticker (nombres largos truncados con `title`), ajustar el alto del contenedor para que las 10 etiquetas no se solapen, y cambiar el `XAxis` a un dominio que incluya 0 (p. ej. `[(min) => Math.min(0, min), 'auto']`) para que la longitud de las barras sea proporcional al P&L %. Mantener `formatPercent` en el tooltip. (f982d6f9)

### Decisiones (ADR)
- ADR-0263 — Altura dinámica vs. fija para el chart de 10 performers [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0088/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-07 — F-0085 completado

## Feature F-0085

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En `tailwind.config.js`, agregar la clave de primer nivel `primary: { DEFAULT: '#2FD4CD' }` dentro de `theme.extend.colors` (mismo teal que `accent`/`success`/`profit`), sin modificar los tokens legacy anidados `background.primary`, `border.primary` ni `text.primary` (deben seguir generando `bg-background-primary`, `border-border-primary`, `text-text-primary`). Usar hex plano para que los modificadores de opacidad `/90`, `/10`, `/5` funcionen. (743f65fc)
- [x] Step 2: Agregar un test de vitest que importe `tailwind.config.js` y verifique: `theme.extend.colors.primary.DEFAULT === '#2FD4CD'`, y que sigan existiendo `theme.extend.colors.background.primary`, `theme.extend.colors.border.primary` y `theme.extend.colors.text.primary`. Sin dependencias nuevas. (2b3e4aa7)
- [x] Step 3: Agregar un test de regresión en vitest que recorra con `fs` todos los `.jsx`/`.tsx` bajo `src/` y falle si encuentra una línea (o `className` con plantilla/multilínea) que combine `bg-primary` sólido (sin modificador `/opacidad`) junto con `text-white`. Debe ignorar usos con opacidad como `bg-primary/10`. (3bafd9d6)
- [x] Step 4: Hacer un `grep` de `bg-primary` + `text-white` en la misma línea sobre `src/` para enumerar los 27 archivos afectados (incluye `FciComparador.jsx`, `ErrorBoundary.jsx`, `ProtectedRoute.jsx`, `OperationsTab.jsx`, `ConversionModal.jsx`, `CycleModal.jsx`, `DefiLoanModal.jsx`, `DefiLoanReconciliation.jsx`, `CryptoTradeModal.jsx`, `SignUp.jsx`, etc.) y reemplazar `text-white` por `text-background-primary` solo en elementos con fondo `bg-primary` sólido, revisando también `className` multilínea o con template literals. No tocar usos con opacidad (`bg-primary/10`, etc.). (eb32dd1e)
- [x] Step 5: Revisar explícitamente el botón principal de `src/features/portfolio/components/TradeModal.jsx` (afectado por el commit `ab82f52`): si su diseño actual de contraste invertido nativo ya logra contraste >= 4.5:1 dejarlo como está y documentarlo con un comentario; si no, ajustarlo para que cumpla usando `bg-primary text-background-primary`. (564625f6)
- [x] Step 6: Ejecutar `npm test` y el typecheck completos; corregir cualquier fallo residual de los tests nuevos o del build hasta que todo pase en verde. (c56d7d1d)

### Decisiones (ADR)
- ADR-0264 — `primary` definido como objeto `{ DEFAULT }` y no como string plano [Instrucción de Augusto]
- ADR-0265 — Test como `.js` en vez de `.ts` [Supuesto del agente] **⚠ REVISAR**
- ADR-0266 — Usar DOCUMENTED_EXCEPTIONS en lugar de test inicialmente rojo [Supuesto del agente] **⚠ REVISAR**
- ADR-0267 — Excepción de bg-danger persiste en test de regresión [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0085/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-07 — F-0090 completado

## Feature F-0090

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear un helper/hook compartido `useFciDayLabel(positions)` en `src/features/fci/utils/` (o `src/features/fci/hooks/`) que derive el `priceDate` más reciente de `positions` (map → filter Boolean → sort → at(-1)) y devuelva el resultado de `getFciDayLabel(latestDate)` ({cardTitle, subtitle, columnHeader}), replicando el `useMemo` de `Fci.jsx` (~L194-197). No modificar `getFciDayLabel` ni su firma. (bd54c757)
- [x] Step 2: Agregar test unitario en `__tests__/` para el nuevo `useFciDayLabel`, cubriendo: sin positions / sin priceDate (fallback 'P&L ÚLTIMO VCP'), VCP de hoy ('P&L HOY') y VCP previo (subtítulo 'al DD/MM'), inyectando `now` para determinismo. No tocar `getFciDayLabel.test.ts`. (1ca6d963)
- [x] Step 3: Refactorizar `src/pages/Fci.jsx` para consumir el nuevo `useFciDayLabel(positions)` en lugar del `useMemo` inline de `dayLabel`, manteniendo idéntico el comportamiento del KpiCard de Fondos en Caución. (3d162c1e)
- [x] Step 4: En `src/pages/FciPortfolio.jsx` (`/portfolio/fondos`), importar y usar `useFciDayLabel(positions)` para reemplazar el `label="P&L Hoy"` fijo (~L246) del KpiCard por `dayLabel.subtitle ? \`${dayLabel.cardTitle} · ${dayLabel.subtitle}\` : dayLabel.cardTitle`. No cambiar el valor numérico ni la lógica de moneda (ARS/USD). (7ed2c926)
- [x] Step 5: Verificar coherencia visual entre la tarjeta P&L y el encabezado de columna `P&L últ. día` de `FciLotTable` en `/portfolio/fondos` (nunca una tarjeta 'HOY' junto a columna 'últ. día'), y correr `npm test` y el typecheck completos corrigiendo cualquier regresión. (7ed2c926)

### Decisiones (ADR)
- ADR-0268 — Ubicación del hook en `hooks/` en lugar de `utils/` [Supuesto del agente] **⚠ REVISAR**
- ADR-0269 — Inyección de `now` en el hook vs. fake timers [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0090/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-08 — F-0091 completado

## Feature F-0091

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Agregar tests de reproducción (van primero, deben fallar hoy): en tests/loan-calculator.test.ts, que simulateLoan({ capital: 880000, termMonths: 9, tnaTarget: 1.45, loanType: 'amortized', accrualType: 'exponential', roundingMultiple: 1000, smartDueDate: true }) con startDate '2026-10-05' da 165000, '2026-10-07' 164000, '2026-10-08' 163000 y '2026-10-15' 177000 (primer vencimiento salta a 2026-12-02); y en tests/ap-preapprove-relationship.test.ts un caso de ap.approvePreApproval con un pre-aprobado de installmentAmount 165000 aprobado en un día distinto al de creación que hoy crea un Loan con otra cuota. NOTA (Cowork 2026-10-07): el verifier exige typecheck, lint (--max-warnings 0) y tests en verde en cada paso. Por eso el test de ap.approvePreApproval que reproduce el bug va marcado `test.fails` (pasa mientras el bug exista); el paso que implementa el fix lo cambia a `test`. Los 7 warnings de lint previos ya fueron limpiados en el commit 1092114: no tocar esos archivos en este paso. (55d41473)
- [x] Step 2: Agregar parámetro opcional `fixedInstallment` a generateSmartSchedule en lib/business-days.ts: cuando viene, no redondea ni recalcula la cuota, usa ese importe para todas las cuotas y resuelve la tasa diaria efectiva con el Newton ya existente (L229-259) para que el saldo cierre en 0 con las fechas reales. Exponerlo en lib/loan-calculator.ts en el camino smart (simulateAmortizedSmart, generateSmartAmortizationTable y simulateLoan). Sin el parámetro, resultado idéntico al actual; agregar tests de que los existentes de tests/loan-calculator.test.ts no cambian. (f2774c03)
- [x] Step 3: Crear un helper 'hoy en ART' en lib/ que devuelva la fecha de hoy (YYYY-MM-DD) en zona America/Argentina/Buenos_Aires sin usar getFullYear()/getMonth()/getDate() del servidor, y usarlo como startDate en ap.preApprove (server/routers/ap.ts L375-376) y en ap.approvePreApproval (L690 en adelante). Agregar test unitario del helper. (2c8a2464)
- [x] Step 4: Modificar ap.approvePreApproval (server/routers/ap.ts ~L633+) para crear el Loan con startDate = hoy-ART y fixedInstallment = PreApproval.installmentAmount, de modo que Loan.installmentAmount, cada LoanInstallment.amount, capital, termMonths y totalAmount = installmentAmount*termMonths sean los cotizados, y tna/monthlyRate pasen a ser los efectivos de la fecha real. Preservar apCommissionRatio, ApCommission.expectedCommission y las transiciones de Opportunity. Si la cuota fija no puede cerrar el saldo con tasa positiva, lanzar TRPCError BAD_REQUEST explicativo sin crear nada. Cubrir con el fixture (880000/9/165000 aprobado en varias fechas, TNA efectiva con tolerancia 0.001). NOTA (Cowork 2026-10-07): en tests/ap-preapprove-relationship.test.ts cambiar el test marcado `test.fails` (cuota cotizada 165000 aprobada otro día) a `test` normal: con el fix pasa a ser la regresión permanente y debe pasar en verde. (c89f7884)
- [x] Step 5: Modificar loans.confirmPreApproved (server/routers/loans/crud.ts ~L504-600), rama de vencimiento inteligente, para usar fixedInstallment = Number(loan.installmentAmount) de modo que cada fila cumpla interest + principal = amount (±0.01) y el saldo de la última cuota sea 0, sin cambiar nunca el monto fijado de la cuota. Aplicar la misma lógica a la rama de refinanciación que activa el core compartido (confirmRefinancing, server/routers/loans/operations.ts ~L636-790) si recalcula importes; si ya los respeta, dejarla y anotarlo en el ADR. Si la cuota fija no cierra con tasa positiva, lanzar TRPCError BAD_REQUEST sin crear nada. Test con préstamo pre_approved confirmado en fecha distinta a la de creación. (1689b251)
- [x] Step 6: Redondear a centavos el Loan.installmentAmount guardado en el camino smart de loans.create (computeLoanPlan, server/routers/loans/crud.ts ~L73-80) para que sea igual a LoanInstallment.amount de la cuota regular (evitar persistir sin redondear, p.ej. 471222.44015 vs filas 471222.44). Test con los fixtures de paridad. (1b08ea54)
- [x] Step 7: Agregar campo opcional `expectedInstallmentAmount` al input zod de loans.create y loans.createPreApproved (server/routers/loans/crud.ts): si viene y el servidor calcula otra cuota, rechazar con BAD_REQUEST y mensaje 'La cuota cambió de $X a $Y: revisá la vista previa' sin crear nada; sin el campo, comportamiento actual intacto. Test del guard. Agregar también un test de paridad de fixtures (simulador, vista previa, loans.create y ap.preApprove dan la misma cuota y cronograma): 880000/9/145/1000/2026-10-05→165000, /2026-10-07→164000; 350000/6/120/1000/2026-10-07→80000; 500000/12/100/1000/2026-10-07→67000; 1200000/3/110/0/2026-10-07→471222.44. (186d6543)
- [x] Step 8: Actualizar la vista previa del formulario 'Nuevo Préstamo' en components/loans/create-loan-dialog.tsx (bloque ~L735-775) para dejar de usar su propia fórmula francesa y mostrar cuota, primer vencimiento y cronograma resumido derivados de generateSmartAmortizationTable/simulateLoan (el mismo cálculo del servidor), sin '~' cuando el valor es exacto. Alinear el redondeo por defecto con el simulador: inicializar roundEnabled igual que app/dashboard/simulator/page.tsx:108 (redondeo a $1.000 en ARS y 0 en USD, criterio de ap.preApprove), visible y editable (create-loan-dialog.tsx:51). Enviar expectedInstallmentAmount desde el formulario y desde 'Crear préstamo' del simulador (app/dashboard/simulator/page.tsx payload ~L339-380). (15644a41)
- [x] Step 9: Agregar aviso de demora en PreApprovalCard (app/dashboard/ap/page.tsx L416) para pre-aprobados con status === 'pending': a los 7 días calendario o más desde createdAt (en ART) mostrar un aviso ámbar 'Pre-aprobada hace N días: evaluar volver a crearla por los días de demora' (a los 6 días no aparece). Si la fecha de hoy hace que la TNA efectiva resultante difiera en 1 punto porcentual o más de la cotizada, agregar 'TNA efectiva X % (cotizada Y %)', visible solo para el prestamista, nunca para el prestatario. El aviso no bloquea el botón Aprobar y no agrega vencimiento. Test del borde 6/7 días. (76a5c7b5)
- [x] Step 10: Agregar prueba de mutación (criterio 13): revertir fixedInstallment en approvePreApproval hace fallar los tests del criterio 3, y revertir el guard expectedInstallmentAmount hace fallar su test. Correr typecheck y npm test completos y dejarlos en verde. (2b3f3373)

### Decisiones (ADR)
- ADR-0270 — test.fails para el test de reproducción del bug [Instrucción de Augusto]
- ADR-0271 — Generalizar condición Newton de `roundingMultiple > 0` a `installment !== exactInstallment` [Supuesto del agente] **⚠ REVISAR**
- ADR-0272 — `todayArt` acepta parámetro `now` para testabilidad [Supuesto del agente] **⚠ REVISAR**
- ADR-0273 — TNA persistida en el Loan = TNA efectiva de la fecha real, no la TNA de cotización [Supuesto del agente] **⚠ REVISAR**
- ADR-0274 — confirmRefinancing no necesita fixedInstallment [Supuesto del agente] **⚠ REVISAR**
- ADR-0275 — Comparación del guard a precisión de centavo (round2), no exacta [Supuesto del agente] **⚠ REVISAR**
- ADR-0276 — simulateLoan se llama client-side en lugar de via tRPC para la vista previa [Supuesto del agente] **⚠ REVISAR**
- ADR-0277 — TNA efectiva calculada con reverseFromInstallmentSmart en el cliente [Supuesto del agente] **⚠ REVISAR**
- ADR-0278 — Pruebas de mutación como tests de función pura, no de integración del router [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0091/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-08 — F-0092 completado

## Feature F-0092

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: Crear módulo puro `lib/payment-shortcuts.ts` con `getPaymentShortcuts(loan, now)` que extrae la lógica actual de `register-payment-dialog.tsx` (L33-44: overdueInsts, nextDueInst, unpaidInsts, totalPendingAmount) sin cambiar resultados, devolviendo `overdue` (suma de lo que falta de cuotas impagas con dueDate < now), `next` (lo que falta de la primera impaga con dueDate >= now, con flag de parcial) y `allPending` (suma de lo que falta de todas las impagas); cada importe redondeado a centavos sin artefactos de coma flotante y omitido si es 0. Agregar tests en `tests/` con fixtures: (a) 2 vencidas/1 próxima/3 pendientes, (b) próxima con paidAmount>0, (c) sin vencidas, (d) sin cuotas pendientes (sin atajos), (e) centavos como 471222.44. (b8e7b157)
- [x] Step 2: Crear helper puro `lib/payment-amount.ts` con `parseAmountEsAR(text)` y `formatAmountEsAR(n)`: coma=decimal, punto=miles; punto seguido de 1-2 dígitos al final sin coma = decimal ('1.5'→1.5, '1.50'→1.5), punto seguido de exactamente 3 dígitos = miles ('1.500'→1500, '90.000'→90000); '1,500'→1.5; devuelve null si no es monto válido o es ≤0; nunca más de 2 decimales. Agregar tests unitarios que cubran espacios, '$', texto vacío, '0', negativo y '90.000,50'→90000.5. (4a7776dd)
- [x] Step 3: En `RegisterPaymentDialog`: reemplazar el cálculo inline de atajos por `getPaymentShortcuts` de `lib/payment-shortcuts.ts` y convertir las filas 'Vencidas', 'Próxima' y 'Cuotas pendientes' en `<button type="button">` con altura mínima 44px en <640px, señal visual de que se tocan ('Usar' o flecha), foco visible y `aria-label` tipo 'Cobrar vencidas: $ 90.000,00'. Al tocar un atajo, completar el campo Monto con ese importe (formateado es-AR) y devolver el foco al campo. La fila 'Capital vivo prestado' y los préstamos solo interés / 0% se muestran como hoy, sin atajo. (8a21b5c8)
- [x] Step 4: En `RegisterPaymentDialog`: migrar el campo Monto de `type="number"` a `type="text"` con `inputMode="decimal"`, sin flechas, placeholder '0,00', formateo es-AR al salir del campo y al completarse desde un atajo (usando `lib/payment-amount.ts`); asociar `Label` por `htmlFor`/`id` a los tres campos (Monto, Fecha, Nota); deshabilitar el botón mientras `parseAmountEsAR` devuelva null; enviar a `registerPayment` el número parseado sin cambiar el contrato de la mutación. (474a6d07)
- [x] Step 5: En `RegisterPaymentDialog`: mostrar el monto interpretado en el botón de confirmar ('Confirmar cobro de $ 90.000,50') con altura mínima 44px en móvil, y renderizar el error de `registerMutation` bajo el botón usando el mensaje del servidor (agregar `onError`/estado); el modal no se cierra ante error, el error se limpia al reabrir o al editar el monto, y el botón vuelve a habilitarse. (99777259)
- [x] Step 6: En el diálogo 'Cobrar cuota N' de `app/dashboard/loans/page.tsx` (~L1299-1357): mostrar el mismo texto 'Confirmar cobro de $ ...' con el monto fijo, aplicar altura táctil mínima 44px al botón y renderizar el error de `payInstMutation` dentro del modal bajo el botón, sin cerrar ante error. (9ab14c4d)
- [x] Step 7: Agrandar áreas táctiles en móvil (<640px): el botón 'Registrar Cobro' (hoy size="sm", 32px) y el botón de cerrar del modal (`components/ui/dialog.tsx` L46, ~16px) a 44×44px. Revisar los usos de `DialogContent` compartido y, si agrandar el cierre global altera otros modales, limitarlo a un `className` opcional o variante usada solo por estos dos diálogos; sin cambios en el aspecto de escritorio ni en el resto de la app. (e1148ffc)
- [x] Step 8: Agregar pruebas de mutación: verificar que al romper `getPaymentShortcuts` (usar el monto total de la cuota en vez de lo que falta) fallan los tests de atajos, y que al cambiar la regla del punto de `parseAmountEsAR` fallan sus tests; confirmar que typecheck, lint sin warnings y `npm test` completos pasan. (2d96f18c)

### Decisiones (ADR)
- ADR-0279 — Tipo mínimo estructural para el input de `getPaymentShortcuts` en lugar de importar `LoanInstallment` [Supuesto del agente] **⚠ REVISAR**
- ADR-0280 — Truncado vs. redondeo en parseAmountEsAR [Supuesto del agente] **⚠ REVISAR**
- ADR-0281 — Foco devuelto vía setTimeout(0) en lugar de flushSync [Supuesto del agente] **⚠ REVISAR**
- ADR-0282 — Resetear payInstMutation al abrir el diálogo de cobro, no al cerrar [Supuesto del agente] **⚠ REVISAR**
- ADR-0283 — Prop `closeClassName` opt-in en lugar de cambio global del botón de cierre [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0092/`

> Revisar con Claude in Chrome para validación de UX.

## 2026-10-08 — F-0093 completado

## Feature F-0093

Implementado automáticamente por el orquestador Tier 1.

### Pasos
- [x] Step 1: En tests/payment-amount.test.ts, agregar un barrido de regresión de centavos marcado con `test.fails`: para los enteros {0,1,29,57,1234,90000,165000,471222,1485000,99999999} y todos los centavos 00–99, armar el texto en las 3 grafías ('165.000,05', '165000,05', '165000.05') y afirmar `Math.round(parseAmountEsAR(texto)*100) === enteros*100+centavos` y `parseAmountEsAR(texto) === Number(`${enteros}.${cc}`)`. Debe quedar verde (porque hoy falla) y registrar en un comentario cuántos/ cuáles casos fallan (esperado ~39/899). (199a9c9a)
- [x] Step 2: Reimplementar `parseAmountEsAR` en lib/payment-amount.ts con aritmética de enteros: validar el texto por regex (grafías es-AR coma decimal / punto de miles), construir los centavos como entero a partir de la parte entera concatenada con la parte decimal rellenada a 2 dígitos, y devolver `centavos/100` (única división), SIN `parseFloat`, `Math.trunc(n*100)` ni multiplicaciones por 100. Preservar el contrato: `null` si inválido o ≤0. Luego quitar el `test.fails` del barrido y dejarlo en verde. (837d4019)
- [x] Step 3: En tests/payment-amount.test.ts, agregar casos de borde y de rechazo: más de 2 decimales → `null` ('1,234','1,2345','1.2345','0,001'); excepción de miles conservada ('1.500'→1500,'90.000'→90000); ceros/signos/basura → `null` ('0' igual a antes,'0,00','-5','','$','1,5,5','1..5'); y equivalencias exactas ('$ 90.000,50'→90000.5,'  1.000.000 '→1000000,'1.5'→1.5,'1.50'→1.5,'1,5'→1.5,'1,50'→1.5). Un test por caso. (c2e93da0)
- [x] Step 4: Revisar `formatAmountEsAR` (lib/payment-amount.ts) y el redondeo a centavos de lib/payment-shortcuts.ts; agregar en tests/payment-amount.test.ts el ida y vuelta `parseAmountEsAR(formatAmountEsAR(x)) === x` para todos los centavos 00–99 sobre los enteros de ejemplo. Si el barrido detecta un desvío en `formatAmountEsAR` o en payment-shortcuts, corregirlo en estos mismos archivos manteniendo verde todo lo anterior. (61446062)
- [x] Step 5: Agregar una prueba de mutación contra el CÓDIGO REAL de lib/payment-amount.ts: documentar en un script/test que al reintroducir temporalmente `Math.trunc(n*100)/100` con `parseFloat` el barrido falla (con conteo y casos), restaurando luego con `git checkout -- lib/payment-amount.ts`. Además, agregar en la cabecera de tests/f0092-mutation.test.ts una nota aclarando que sus mutantes son copias locales y que la prueba efectiva contra el código real vive en el barrido de payment-amount.test.ts. (3e147dbd)
- [x] Step 6: Verificar que los consumidores UI del parseo envían el número exacto sin re-truncar: components/loans/register-payment-dialog.tsx (L63-66 y L160-161, formateo al aplicar atajo y al salir del campo) y el diálogo rápido 'Cobrar cuota N' en app/dashboard/loans/page.tsx. Confirmar que el monto parseado se pasa tal cual a `registerPayment`/`payInstallment` y que el label/botón de confirmación muestra el centavo correcto, sin cambiar contratos de mutaciones ni contabilidad. (0bdec8a7)

### Decisiones (ADR)
- ADR-0284 — Soft-assertion con array de fallos en lugar de expect() directos [Supuesto del agente] **⚠ REVISAR**
- ADR-0285 — Punto-decimal con 4+ dígitos: truncar a 2, no rechazar [Supuesto del agente] **⚠ REVISAR**
- ADR-0286 — Rechazar fracPart.length > 2 en punto-decimal en lugar de truncar [Supuesto del agente] **⚠ REVISAR**
- ADR-0287 — Mutante con lógica de puntos correcta, solo muta el truncado final [Supuesto del agente] **⚠ REVISAR**

### QA
Screenshots en `orchestrator/qa-artifacts/F-0093/`

> Revisar con Claude in Chrome para validación de UX.
