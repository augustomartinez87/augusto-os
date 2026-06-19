# Decisiones de diseño — augusto-os

Formato: fecha · decisión · contexto · alternativas descartadas

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
