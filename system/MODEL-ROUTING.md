# Routing multi-modelo + visualización del equipo de agentes — evaluación

Contexto- ideas que circulan en X (jun 2026) sobre (1) abaratar el orquestador usando modelos más baratos para el trabajo de ejecución y (2) visualizar el equipo de agentes en vivo. Acá las aterrizo a augusto-os. Las dos refuerzan la misma columna del diseño- **rol ≠ modelo** (ver `CONVENTIONS.md` §3), que ya es model-agnostic.

> Nota de terminología- nada de "albañil". Los agentes son **roles de ingeniería**.

---

## 1. Visualización del equipo de agentes (no "albañil")

Lo viral en X son agentes como **personajes con estado en vivo** (thinking / working / reviewing / done) — desde una extensión VS Code pixel-art hasta dashboards (AgentQueue, Claude Code "agent view"). El valor real- dejar de mirar logs crudos y ver de un vistazo qué hace cada agente y si alguno se trabó.

**Cómo encaja en augusto-os-** esto NO es un proyecto nuevo, es la **cara de S-007 Fase B** (el dashboard). El control plane (Fase A) ya lleva los datos- `orch_runs`/`orch_steps`/`orch_logs`, y dejé prevista la tabla **`orch_presence`** (role, process, last_heartbeat) justo para esto. La visualización es la capa de UI encima.

**Identidades propuestas (rol + persona + modelo que corre):**
- 🧠 **Arquitecto** — Planner (Opus). Descompone el feature en steps.
- 🔧 **Constructor** — Builder/Executor (hoy Sonnet; candidato a modelo barato, ver §2). Implementa cada step.
- 🔎 **Inspector** — Verifier. Corre typecheck + lint + tests.
- 🧐 **Revisor** — Reviewer (Fase 1b, futuro). Revisa el diff antes del commit.

Cada uno se muestra con su estado (`pensando`/`trabajando`/`revisando`/`hecho`), el step actual, y **qué modelo está usando** — que se vuelve más interesante con el routing del §2 (vas a ver "Constructor·DeepSeek trabajando" vs "Arquitecto·Opus planificando").

**Niveles de implementación (de barato a copado):**
1. **Ya- logs con persona** — el loop loguea `[🔧 Constructor·Sonnet] step 2 — editando ap.ts`. Cero infra.
2. **Dashboard (S-007 Fase B)** — tarjetas/avatares por rol con estado en vivo desde Supabase. Es el "equipo trabajando" de verdad.
3. **Pixel-art / extensión** — overkill por ahora; lo dejamos como inspiración estética para la Fase B.

→ **Acción-** sumar el "agent team view" al alcance de S-007 Fase B. No requiere build nuevo, solo diseñar la vista sobre datos que ya vamos a tener.

---

## 2. Modelo asiático barato para el Builder

La tesis es correcta y encaja con tu arquitectura- **Opus se queda de Arquitecto** (planificación, decisiones), y el **Builder** (que hace el 80% de las llamadas- edits, fixes de typecheck, trabajo mecánico) pasa a un modelo mucho más barato.

**Por qué es viable en TU sistema (clave):** tu loop ya tiene la **red de seguridad** que hace barato un Builder más flojo — el **Verifier** (tsc + lint + tests, hasta 3 reintentos) atrapa un edit malo y lo manda a rehacer. Un modelo barato que se equivoca de vez en cuando no rompe prod- lo corrige el gate. Esto es lo que hace que la apuesta tenga sentido.

**El habilitador concreto- Claude Code Router (CCR)** (`github.com/musistudio/claude-code-router`). Tu Builder ya corre vía `claude` headless; CCR se mete en el medio y enruta esa llamada a DeepSeek / GLM / Qwen / MiniMax / local, **sin reescribir el orquestador**. Soporta routing por tipo de request (default, background, subagent, long-context, condicional), así que podés mandar el Builder a un modelo y dejar otros en Anthropic.

**Candidatos reales (jun 2026, verificar precios al integrar):**
| Modelo | Para qué | Costo aprox /M | Nota |
|--------|----------|----------------|------|
| **DeepSeek V4 (Flash/Pro-Max)** | Builder default | Flash ~$0.14/$0.28 | Top open-weights coding (~80.6% SWE-bench Verified), MIT, OpenAI-compatible. El mejor costo-beneficio. |
| **GLM-5.1/5.2 (Z.ai)** | "Builder premium" cuando DeepSeek falla | barato-medio | Fuerte en coding real/refactors; Flash gratis en Z.AI. |
| **Qwen3-Coder-Next (Alibaba)** | alternativa con buen tool-calling | bajo | 1M tokens free para arrancar. |
| **MiniMax M3** | tareas rápidas, contexto largo | $0.30/$1.20 | El más barato arriba de 80% SWE-bench. |

**Riesgo honesto (de las fuentes):** rutear el modelo *default* a DeepSeek/Qwen/GLM da **más edits fallidos** (números de línea errados, search-replace mal formado). Mitigación- (a) tu Verifier los atrapa; (b) empezar por los **steps mecánicos** (rename de copy, fixes de typecheck) y dejar Opus/Sonnet para los steps complejos; (c) medir la **tasa de reintentos** — si un modelo barato triplica los retries, el ahorro se evapora. Tu loop ya loguea cada retry, así que es medible.

**Pilot recomendado-**
1. Instalar CCR; rutear SOLO el Builder a **DeepSeek V4** (Opus de Planner queda igual).
2. Correr 1-2 features de bajo riesgo (ej. un rename de copy) y comparar- reintentos, tiempo, y si pasa el Verifier al primer intento.
3. Si la tasa de éxito al primer intento es alta → adoptar DeepSeek como Builder default, con GLM-5.x como escalón y Opus/Sonnet como escalada para steps que el cheap no resuelve en 2 intentos.

**"Que Opus decida el routing"-** mapear cada step a un tier en el plan- el Planner (Opus), al descomponer el feature, etiqueta cada step como `mecánico` (→ DeepSeek) o `complejo` (→ Sonnet/Opus). El executor lee la etiqueta y CCR enruta. Eso es una feature concreta del orquestador (candidata a spec).

---

## Recomendación

Las dos van, y se potencian. Orden- primero **terminar S-007 Fase A/B** (el control plane + dashboard) porque la visualización del equipo sale gratis ahí y el routing se ve mejor con la vista. En paralelo, **pilotear DeepSeek en el Builder vía CCR** en un feature de prueba — es barato de probar y el Verifier te cubre. Si el pilot da bien, escribimos la spec de routing por-step (Opus etiqueta, CCR enruta).

No migrar todo de golpe ni meter 5 modelos- un Builder barato + Opus arriba + el gate de verificación es el 90% del ahorro con el menor riesgo.

## Fuentes
- [Best AI Model for Coding (June 2026) — morphllm](https://www.morphllm.com/best-ai-model-for-coding)
- [GLM-5.2 vs DeepSeek V4 vs Qwen3 — Developers Digest](https://www.developersdigest.tech/blog/glm-5-2-vs-deepseek-v4-vs-qwen3-open-weights-coding-showdown)
- [claude-code-router — GitHub](https://github.com/musistudio/claude-code-router)
- [Claude Code Router guide 2026 — morphllm](https://www.morphllm.com/claude-code-router)
- [deepclaude (Claude Code loop con DeepSeek) — GitHub](https://github.com/aattaran/deepclaude)
