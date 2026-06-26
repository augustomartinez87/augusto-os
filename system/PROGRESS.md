# Progress — augusto-os

Log append-only de features y milestones completados.

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
