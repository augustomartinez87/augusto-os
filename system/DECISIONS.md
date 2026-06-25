# Decisiones de diseño — augusto-os

Formato: fecha · decisión · contexto · alternativas descartadas

---

## 2026-06-20 — Argos en el loop sin dev DB (targets no-Prisma)

**Decisión:** Argos (`portfolio-tracker`, React/Vite/Supabase-client) entra al loop con `dbModel: "none"` en targets.json. El guard exime a targets no-Prisma de exigir `devDatabaseUrl` y no inyecta `DATABASE_URL`. Razón: su verificación (tsc + lint + test + `vite build`) no toca la DB; Supabase se accede por `VITE_SUPABASE_URL` en runtime, no por Prisma. Se descartó crear un Supabase branch dev (~USD 10/mes) hasta que haga falta QA visual con datos (AR-004).

**Cambios de engine:** `Target.dbModel` ('prisma'|'none', default 'prisma'); `assertNoProdDb` retorna void y cortocircuita en dbModel=none; `getDbEnvOverride` retorna `{}` si no hay override; `qa.ts` solo setea DATABASE_URL/DIRECT_URL si existen; `verifier` (por-step y release) tolera la falta de script `lint` ("missing script" → omitir).

**Riesgo residual:** el executor podría, en teoría, tocar la Supabase prod de Argos (no hay aislamiento de DB). Mitigación: features de Argos deben ser UI/lógica; gates de no-SQL-destructivo siguen activos; no se le pasa service key al loop. Pendiente AR-003: afinar el prompt del executor por dbModel.

---

## 2026-06-20 — Fase de release autónoma (merge + verificación + gate de OK + push/deploy)

**Decisión:** el orquestador lleva un feature hasta prod, no solo hasta una branch. Al terminar los steps:
1. **Merge automático** de la feature branch → `main` (local, `--no-ff`, sin push). Si hay conflicto, aborta y deja la branch intacta.
2. **Battery de verificación completa** (`runReleaseChecks`): typecheck + lint + tests + `npm run build` (build de prod) + escaneo informativo de fuga de TNA/tasa en vistas de prestatario. Hard-fail en typecheck/lint/tests/build; el TNA-check es informativo y se muestra en el pedido de OK.
3. Si pasa todo → **gate humano**: el loop pausa y pide `npm run approve`. Si falla algo, NO molesta a Augusto: muestra el error y frena.
4. Con el OK → **push a `main`**. Como Vercel está conectado por Git, el push dispara el deploy a prod (no se usa `vercel` CLI).

**Por qué:** Augusto pidió que el orquestador delegue push+deploy, pidiéndole OK solo después de verificar todo lo posible. Honra el gate de prod del `CLAUDE.md` (deploy requiere aprobación explícita) vía `npm run approve`, pero saca el trabajo manual de git.

**Implementación:** flags nuevos en `STATE.json` (`merged`, `awaitingPushApproval`, `pushed`); `mergeIntoMain`/`pushMain` en git.ts; `runReleaseChecks` en verifier.ts; máquina de estados en el bloque de cierre de index.ts. `STATE.json` se archiva recién tras el push. El gate reusa el mecanismo existente (`npm run approve` en otra terminal mientras el `npm start` sigue corriendo y polleando).

**Límite explícito:** push/deploy son las ÚNICAS acciones de prod; siempre detrás del OK humano. El merge local no toca prod, por eso es automático.

---

## 2026-06-20 — Rename: identidad Kredy vs Spensiv + config del orquestador

**Decisión (naming canónico):**
- **Kredy** = app de préstamos/crédito + capa AP. Repo originalmente "spensiv" (carpeta `spensiv/`). Target del orquestador = **`kredy`**.
- **Spensiv** = app de finanzas personales (cashflow/tarjetas/gastos). Repo `spensiv-tracker` (carpeta `spensiv-tracker/`). Target del orquestador = **`spensiv`**.
- El branding "Spensiv - tu motor de cashflow" le corresponde al TRACKER, no a Kredy.

**Vercel (checklist C):** Augusto renombró el project a **`kredy-ap`** y **reenvía** los links `/l`. El subdominio `kredy.vercel.app` ya estaba tomado por otro team (los `.vercel.app` son globales), así que la URL de prod quedó en **`https://kredy-ap.vercel.app`** (Valid Configuration). El nombre comercial sigue siendo "Kredy"; `-ap` es solo limitación técnica. `metadataBase` de Kredy = `https://kredy-ap.vercel.app` (F-0003). No se compra dominio propio.

**Cambios aplicados hoy en augusto-os (config, no destructivo):**
- `targets/targets.json`: key `spensiv` → `kredy` (mismo path `spensiv/` hasta el rename de carpetas, checklist F); agregado target `spensiv` → `spensiv-tracker`. Argos intacto.
- `orchestrator/.env`: `SPENSIV_DEV_DATABASE_URL` (Neon ep-old-union = kredy-dev) renombrado a `KREDY_DEV_DATABASE_URL`; agregado `SPENSIV_DEV_DATABASE_URL=<COMPLETAR>` para el sandbox dev del tracker (todavía inexistente). Backup en `.env.bak-rename`.
- `config/prod-db-hosts.json`: patrón global `ep-floral-mud` (prod del tracker) para que el guard nunca la use como dev. Patrón específico, NO `neon.tech` genérico (eso bloquearía también el sandbox kredy-dev, también en Neon).
- `orchestrator/src/executor.ts` y `planner.ts`: prompts target-aware — antes hardcodeaban "Spensiv (Next.js/tRPC/Prisma)"; ahora usan `getActiveTargetName()` + `stack` del target.
- `features/F-0001.md` y `F-0002.md`: `target: spensiv` → `target: kredy` (eran features de Kredy; sin el fix, resumir habría apuntado al tracker).

**Pendiente del split:** el sandbox `kredy-dev` (ep-old-union) todavía tiene tablas del tracker viejas → `cd spensiv && npx prisma db push`. El tracker no tiene sandbox dev: el guard aborta su loop hasta crear uno y setear `SPENSIV_DEV_DATABASE_URL`.

**Nota:** el `CLAUDE.md` global describe Spensiv como "finanzas personales + préstamos reales", conflando ambos productos. Conviene separarlo (Kredy = préstamos; Spensiv = finanzas personales) — no se editó automáticamente por ser config personal de Augusto.

---

## 2026-06-19 — Dev DB de Spensiv = Neon (spensiv-dev)

**Decisión:** La base de datos de desarrollo para el loop de Spensiv es una base Neon (`ep-old-union-aiylgeew.c-4.us-east-1.aws.neon.tech/neondb`). El secreto vive en `orchestrator/.env` como `SPENSIV_DEV_DATABASE_URL`, gitignored. El campo `devDatabaseUrl` de `targets.json` referencia `${SPENSIV_DEV_DATABASE_URL}` — nunca el valor crudo. El orquestador arranca con `tsx --env-file=.env` para expandir la referencia antes de correr el guard.

**Esquema:** Materializado con `prisma db push` desde `spensiv/prisma/schema.prisma` contra la URL directa de Neon (no la pooled). Sincronizado el 2026-06-19.

**Guard:** `prodDbPatterns` de spensiv contiene `jymdblurkpadupdqzfzo` (matchea cualquier URL de la DB de prod Supabase, incluyendo `db.jymdblurkpadupdqzfzo.supabase.co`). La URL de Neon (`neon.tech`) no matchea ningún patrón de prod.

**Contexto:** Neon elegido sobre Supabase branch ($0.01344/h) y Docker local (requiere instalación). Neon tiene tier gratuito suficiente para desarrollo headless.

**El .env de Spensiv quedó intacto**, apuntando a prod, sin tocar. El loop overridea solo en memoria vía execa.

---

## 2026-06-19 — Aislamiento de prod: DB no-prod + guard anti-prod

**Decisión:** El loop inyecta `DATABASE_URL`/`DIRECT_URL` apuntando a una DB no-prod en el env de TODOS los procesos hijo (executor, planner, verifier, QA). El `.env` de Spensiv sigue apuntando a prod para uso manual de Augusto — el loop overridea solo en memoria (opción `env:` de execa, sin tocar archivos).

**Guard de seguridad (db-guard.ts):** Antes de ejecutar cualquier trabajo, el loop verifica:
1. `devDatabaseUrl` en targets.json está configurada (no es `<COMPLETAR>`) → si no: aborta con instrucciones.
2. `devDatabaseUrl` NO matchea ningún patrón de prod (`prodDbPatterns` en targets.json + global en `config/prod-db-hosts.json`) → si matchea: aborta con "[guard] DATABASE_URL apunta a producción — corrida abortada".

El guard actúa ANTES de invocar planner, executor, verifier o QA. Es defensa en profundidad: aunque alguien misconfigure el env o el override falle, el loop se niega a correr.

**Contexto:** El `DATABASE_URL` local de Spensiv apunta a la DB de producción real. `npm test` (vitest) invoca el env del proceso hijo; si hereda el env del padre sin override, cualquier test que abra Prisma tocaría prod. La capa `permissions.deny` no bloquea esto (solo bloquea `prisma migrate`).

**DB no-prod para Spensiv:** 
- Placeholder actual: `localhost:5432/spensiv_test` (operativo cuando Docker esté instalado)
- Opción inmediata: Supabase branch del proyecto `jymdblurkpadupdqzfzo` — costo $0.01344/h (~$10/mes). Crear en dashboard.supabase.com/project/jymdblurkpadupdqzfzo/branches, luego `npx prisma db push` contra esa URL.
- Sincronización del schema: `cd spensiv && npx prisma db push` (NO migrate — no genera archivos de migración).

**Tests actuales (2026-06-19):** 12 archivos, 123 tests, todos pure unit (sin conexión DB real). Pasan con cualquier DATABASE_URL en el env. Cuando se agreguen tests que usen Prisma, necesitan la DB no-prod real.

**Descartado:** Editar `.env` de Spensiv — Augusto lo usa para desarrollo manual y rompe su flujo.

---

## 2026-06-18 — `--strict-mcp-config` como capa de bloqueo MCP

**Decisión:** El executor headless usa `--strict-mcp-config` en vez de `--allowedTools` solo para bloquear MCP.

**Contexto:** `--allowedTools` es aditivo — agrega tools pero NO bloquea las MCP del `settings.local.json`. Con `enableAllProjectMcpServers: true` en settings.local, el executor veía 40+ tools MCP (Supabase, Vercel, etc.) y podía invocarlas. `--strict-mcp-config` overrides todos los configs MCP y carga cero servers.

**Descartado:** `--permission-prompt-tool auto-deny` — en la versión actual del CLI se trata como nombre de MCP tool (no como keyword built-in) y falla con "MCP tool auto-deny not found".

---

## 2026-06-18 — Hook `pre-tool-use.sh` como guardrail load-bearing

**Decisión:** La protección de producción vive en el hook de shell, NO en `permissions.deny`.

**Contexto:** `--dangerously-skip-permissions` bypasea `permissions.deny` por diseño (es su propósito para headless). El hook de shell (exit code 2) es independiente de las permissions y NO se bypasea con esa flag. Verificado en sesión 2026-06-18: `blocked.log` capturó los tres comandos simulados con `--dangerously-skip-permissions`.

**Implicación:** Si se cambia cómo se invoca `claude`, hay que re-testear ambas capas. La capa deny es documentación; el hook es enforcement real.

---

## 2026-06-18 — QA graceful failure con `NO_SERVER:` prefix

**Decisión:** Si Playwright no puede conectar al servidor, QA emite error con prefijo `NO_SERVER:` y el orchestrator continúa (no bloquea). 

**Contexto:** F-0001 se corría sin dev server levantado. `page.goto` lanzaba `net::ERR_CONNECTION_REFUSED` que propagaba como fatal al main loop. El objetivo es que typecheck + lint + tests sean suficientes para commits headless; QA visual es adicional cuando el server está disponible.

**Cuándo bloquea:** Si hay errores QA que NO son `NO_SERVER:` (ej: JS error en página, invariante rota), sí bloquea y requiere gate humano.

---

## 2026-06-18 — augusto-os como repo separado de los targets

**Decisión:** El orquestador y la memoria del sistema viven en `augusto-os/`, separado de `spensiv/` y `argos/`.

**Contexto:** Si el orquestador viviera dentro de `spensiv/`, tendría acceso implícito al DB, deps, y convenciones del repo. La separación permite que el orquestador opere sobre cualquier target sin asumir el stack del target. El `REPO_ROOT` se resuelve dinámicamente desde `targets/targets.json`.

**Alternativa descartada:** Mantener orchestrator en `spensiv/orchestrator/` — ya fue Fase 0, no escala a multi-target.

---

## 2026-06-18 — Comisión AP se devenga al cobro, no al originar

**Decisión (dominio Spensiv):** La comisión del AP se registra cuando el deudor paga la cuota, no cuando se origina el préstamo. Si el cliente no paga, no hay comisión.

**Contexto:** Evita el caso donde el AP cobró comisión por un préstamo que eventualmente resultó en default. El AP tiene skin in the game en la cobrabilidad.

**Implicación:** `realizeCommissionsForPayment` es el punto de entrada correcto, no `createOpportunity`.
