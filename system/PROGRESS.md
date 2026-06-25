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
