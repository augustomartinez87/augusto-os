# ADR — Architecture Decision Records · augusto-os

Registro de decisiones de diseño. Cada decisión es un **ADR** inmutable: una vez aceptada no se edita, se **reemplaza** por uno nuevo que la supersede (dejando trazabilidad).

El objetivo de este archivo es doble: (1) documentar el *por qué* detrás de cada decisión, y (2) ser **autosuficiente** — cualquier agente (Claude, Llama, otro) debe poder leer esto y retomar el contexto sin reconstruirlo. Por eso cada entrada declara explícitamente su **Origen**: si la decisión fue una instrucción de Augusto o un supuesto que tomó el agente por su cuenta. Eso permite auditar después qué se decidió deliberadamente vs. qué asumió la máquina.

## Template (copiar para cada ADR nuevo)

```
## ADR-XXXX · YYYY-MM-DD · <título corto>

**Estado:** propuesta | aceptada | reemplazada-por-ADR-YYYY | descartada
**Origen:** Instrucción de Augusto | Supuesto del agente | Derivada (consecuencia técnica de otro ADR)
**Target:** sistema | kredy | spensiv | argos

**Decisión:** qué se decidió, en una o dos frases.
**Contexto:** por qué surgió, qué problema resuelve.
**Alternativas descartadas:** qué otras opciones había y por qué no.
**Consecuencias / riesgo residual:** qué queda abierto o qué se vuelve frágil.
```

**Campo Origen — cómo clasificar:**
- `Instrucción de Augusto` → Augusto lo pidió o aprobó explícitamente. La máquina ejecutó una orden.
- `Supuesto del agente` → el agente eligió sin instrucción explícita (default razonable, criterio técnico). Revisable.
- `Derivada` → consecuencia técnica forzada por otro ADR; no es una elección libre.

> Convención de estados de features (backlog/active/review/done/blocked) → ver `system/CONVENTIONS.md`.

---

## ADR-0010 · 2026-06-20 · Argos en el loop sin dev DB (targets no-Prisma)

**Estado:** aceptada
**Origen:** Supuesto del agente (criterio técnico; Augusto no pidió incluir Argos con un modelo de DB específico)
**Target:** argos

**Decisión:** Argos (`portfolio-tracker`, React/Vite/Supabase-client) entra al loop con `dbModel: "none"` en targets.json. El guard exime a targets no-Prisma de exigir `devDatabaseUrl` y no inyecta `DATABASE_URL`. Razón: su verificación (tsc + lint + test + `vite build`) no toca la DB; Supabase se accede por `VITE_SUPABASE_URL` en runtime, no por Prisma. Se descartó crear un Supabase branch dev (~USD 10/mes) hasta que haga falta QA visual con datos (AR-004).

**Cambios de engine:** `Target.dbModel` ('prisma'|'none', default 'prisma'); `assertNoProdDb` retorna void y cortocircuita en dbModel=none; `getDbEnvOverride` retorna `{}` si no hay override; `qa.ts` solo setea DATABASE_URL/DIRECT_URL si existen; `verifier` (por-step y release) tolera la falta de script `lint` ("missing script" → omitir).

**Riesgo residual:** el executor podría, en teoría, tocar la Supabase prod de Argos (no hay aislamiento de DB). Mitigación: features de Argos deben ser UI/lógica; gates de no-SQL-destructivo siguen activos; no se le pasa service key al loop. Pendiente AR-003: afinar el prompt del executor por dbModel.

---

## ADR-0009 · 2026-06-20 · Fase de release autónoma (merge + verificación + gate de OK + push/deploy)

**Estado:** aceptada
**Origen:** Instrucción de Augusto (pidió delegar push+deploy con OK solo tras verificar todo lo posible)
**Target:** sistema

**Decisión:** el orquestador lleva un feature hasta prod, no solo hasta una branch. Al terminar los steps:
1. **Merge automático** de la feature branch → `main` (local, `--no-ff`, sin push). Si hay conflicto, aborta y deja la branch intacta.
2. **Battery de verificación completa** (`runReleaseChecks`): typecheck + lint + tests + `npm run build` (build de prod) + escaneo informativo de fuga de TNA/tasa en vistas de prestatario. Hard-fail en typecheck/lint/tests/build; el TNA-check es informativo y se muestra en el pedido de OK.
3. Si pasa todo → **gate humano**: el loop pausa y pide `npm run approve`. Si falla algo, NO molesta a Augusto: muestra el error y frena.
4. Con el OK → **push a `main`**. Como Vercel está conectado por Git, el push dispara el deploy a prod (no se usa `vercel` CLI).

**Implementación:** flags nuevos en `STATE.json` (`merged`, `awaitingPushApproval`, `pushed`); `mergeIntoMain`/`pushMain` en git.ts; `runReleaseChecks` en verifier.ts; máquina de estados en el bloque de cierre de index.ts. `STATE.json` se archiva recién tras el push. El gate reusa el mecanismo existente (`npm run approve` en otra terminal mientras el `npm start` sigue corriendo y polleando).

**Límite explícito:** push/deploy son las ÚNICAS acciones de prod; siempre detrás del OK humano. El merge local no toca prod, por eso es automático. Honra el gate de prod del `CLAUDE.md`.

---

## ADR-0008 · 2026-06-20 · Rename: identidad Kredy vs Spensiv + config del orquestador

**Estado:** aceptada
**Origen:** Instrucción de Augusto (naming canónico y decisión de Vercel)
**Target:** sistema / kredy / spensiv

**Decisión (naming canónico):**
- **Kredy** = app de préstamos/crédito + capa AP. Repo originalmente "spensiv" (carpeta `spensiv/`, luego renombrada a `kredy/`). Target del orquestador = **`kredy`**.
- **Spensiv** = app de finanzas personales (cashflow/tarjetas/gastos). Repo `spensiv-tracker` (carpeta `spensiv/` post-rename). Target del orquestador = **`spensiv`**.
- El branding "Spensiv - tu motor de cashflow" le corresponde al TRACKER, no a Kredy.

**Vercel (checklist C):** Augusto renombró el project a **`kredy-ap`** y **reenvía** los links `/l`. El subdominio `kredy.vercel.app` ya estaba tomado por otro team (los `.vercel.app` son globales), así que la URL de prod quedó en **`https://kredy-ap.vercel.app`** (Valid Configuration). El nombre comercial sigue siendo "Kredy"; `-ap` es solo limitación técnica. `metadataBase` de Kredy = `https://kredy-ap.vercel.app` (F-0003). No se compra dominio propio.

**Cambios aplicados en augusto-os (config, no destructivo):** `targets/targets.json` (key `spensiv`→`kredy`; nuevo target `spensiv`→tracker); `orchestrator/.env` (`KREDY_DEV_DATABASE_URL` + placeholder tracker, backup en `.env.bak-rename`); `config/prod-db-hosts.json` (patrón `ep-floral-mud`); `executor.ts`/`planner.ts` target-aware; frontmatter F-0001/F-0002 → `target: kredy`.

**Consecuencias:** el `CLAUDE.md` global describe Spensiv como "finanzas personales + préstamos reales", conflando ambos productos. Conviene separarlo — no se editó automáticamente por ser config personal de Augusto.

---

## ADR-0007 · 2026-06-19 · Dev DB de Kredy/Spensiv = Neon

**Estado:** aceptada
**Origen:** Supuesto del agente (elección de Neon sobre alternativas; Augusto aprobó usar una DB no-prod, no eligió el proveedor)
**Target:** sistema / kredy

**Decisión:** La DB de desarrollo para el loop es una base **Neon**. El secreto vive en `orchestrator/.env`, gitignored. El campo `devDatabaseUrl` de `targets.json` referencia `${...}` — nunca el valor crudo. El orquestador arranca con `tsx --env-file=.env` para expandir la referencia antes del guard.

**Esquema:** Materializado con `prisma db push` desde `prisma/schema.prisma` contra la URL directa de Neon (no la pooled).

**Alternativas descartadas:** Supabase branch ($0.01344/h ≈ USD 10/mes) y Docker local (requiere instalación). Neon tiene tier gratuito suficiente para desarrollo headless.

**Guard:** `prodDbPatterns` contiene `jymdblurkpadupdqzfzo` (matchea la prod Supabase de Kredy). La URL de Neon dev no matchea ningún patrón de prod. El `.env` de la app queda intacto apuntando a prod; el loop overridea solo en memoria (execa).

---

## ADR-0006 · 2026-06-19 · Aislamiento de prod: DB no-prod + guard anti-prod

**Estado:** aceptada
**Origen:** Instrucción de Augusto (exigió que el loop nunca toque prod); el mecanismo (guard + override en memoria) es Supuesto del agente
**Target:** sistema

**Decisión:** El loop inyecta `DATABASE_URL`/`DIRECT_URL` apuntando a una DB no-prod en el env de TODOS los procesos hijo (executor, planner, verifier, QA). El `.env` de la app sigue apuntando a prod para uso manual — el loop overridea solo en memoria (opción `env:` de execa, sin tocar archivos).

**Guard de seguridad (db-guard.ts):** Antes de ejecutar cualquier trabajo, el loop verifica: (1) `devDatabaseUrl` está configurada (no es `<COMPLETAR>`) → si no, aborta; (2) `devDatabaseUrl` NO matchea ningún patrón de prod (`prodDbPatterns` + global en `config/prod-db-hosts.json`) → si matchea, aborta. El guard actúa ANTES de invocar planner/executor/verifier/QA. Defensa en profundidad: aunque el override falle, el loop se niega a correr.

**Contexto:** El `DATABASE_URL` local apunta a prod real. `npm test` (vitest) hereda el env del proceso hijo; sin override, cualquier test que abra Prisma tocaría prod. La capa `permissions.deny` no bloquea esto (solo bloquea `prisma migrate`).

**Alternativa descartada:** Editar el `.env` de la app — Augusto lo usa para desarrollo manual y rompe su flujo.

---

## ADR-0005 · 2026-06-18 · `--strict-mcp-config` como capa de bloqueo MCP

**Estado:** aceptada
**Origen:** Supuesto del agente (criterio técnico de seguridad headless)
**Target:** sistema

**Decisión:** El executor headless usa `--strict-mcp-config` en vez de `--allowedTools` solo para bloquear MCP.

**Contexto:** `--allowedTools` es aditivo — agrega tools pero NO bloquea las MCP del `settings.local.json`. Con `enableAllProjectMcpServers: true`, el executor veía 40+ tools MCP (Supabase, Vercel, etc.) y podía invocarlas. `--strict-mcp-config` overrides todos los configs MCP y carga cero servers.

**Alternativa descartada:** `--permission-prompt-tool auto-deny` — en la versión actual del CLI se trata como nombre de MCP tool y falla con "MCP tool auto-deny not found".

---

## ADR-0004 · 2026-06-18 · Hook `pre-tool-use.sh` como guardrail load-bearing

**Estado:** aceptada
**Origen:** Supuesto del agente (decisión de seguridad derivada de testear el bypass)
**Target:** sistema

**Decisión:** La protección de producción vive en el hook de shell, NO en `permissions.deny`.

**Contexto:** `--dangerously-skip-permissions` bypasea `permissions.deny` por diseño (es su propósito para headless). El hook de shell (exit code 2) es independiente de las permissions y NO se bypasea con esa flag. Verificado 2026-06-18: `blocked.log` capturó los tres comandos simulados con `--dangerously-skip-permissions`.

**Consecuencia:** Si se cambia cómo se invoca `claude`, hay que re-testear ambas capas. La capa deny es documentación; el hook es enforcement real.

---

## ADR-0003 · 2026-06-18 · QA graceful failure con `NO_SERVER:` prefix

**Estado:** aceptada
**Origen:** Supuesto del agente
**Target:** sistema

**Decisión:** Si Playwright no puede conectar al servidor, QA emite error con prefijo `NO_SERVER:` y el orchestrator continúa (no bloquea).

**Contexto:** F-0001 se corría sin dev server levantado. `page.goto` lanzaba `net::ERR_CONNECTION_REFUSED` que propagaba como fatal al main loop. El objetivo es que typecheck + lint + tests sean suficientes para commits headless; QA visual es adicional cuando el server está disponible.

**Cuándo bloquea:** Si hay errores QA que NO son `NO_SERVER:` (ej: JS error en página, invariante rota), sí bloquea y requiere gate humano.

---

## ADR-0002 · 2026-06-18 · augusto-os como repo separado de los targets

**Estado:** aceptada
**Origen:** Instrucción de Augusto (alineado con su visión del "SO de Augusto"); ejecución por el agente
**Target:** sistema

**Decisión:** El orquestador y la memoria del sistema viven en `augusto-os/`, separado de los targets.

**Contexto:** Si el orquestador viviera dentro de un target, tendría acceso implícito al DB, deps y convenciones de ese repo. La separación permite operar sobre cualquier target sin asumir su stack. El `REPO_ROOT` se resuelve dinámicamente desde `targets/targets.json`.

**Alternativa descartada:** Mantener orchestrator en `spensiv/orchestrator/` — ya fue Fase 0, no escala a multi-target.

---

## ADR-0001 · 2026-06-18 · Comisión AP se devenga al cobro, no al originar

**Estado:** aceptada
**Origen:** Instrucción de Augusto (regla de negocio del dominio Kredy)
**Target:** kredy

**Decisión:** La comisión del AP se registra cuando el deudor paga la cuota, no cuando se origina el préstamo. Si el cliente no paga, no hay comisión.

**Contexto:** Evita el caso donde el AP cobró comisión por un préstamo que eventualmente resultó en default. El AP tiene skin in the game en la cobrabilidad.

**Consecuencia:** `realizeCommissionsForPayment` es el punto de entrada correcto, no `createOpportunity`.
