# Handoff — Scout / Knowledge Gathering Layer (estado al 2026-07-03)

Contexto para retomar en una sesión nueva de Cowork. Diseño completo en `system/SCOUT-KGL-DESIGN.md` (leerlo primero).

## Qué es esto

Al orquestador de features (`orchestrator/`) se le agregó una capa de investigación barata (Scout, DeepSeek `deepseek-v4-flash`) para que Opus/Sonnet gasten tokens pensando y no explorando el repo. Objetivo económico: bajar ≥25% el costo por feature sin degradar la tasa de aprobación del Reviewer. NO se reemplazó ningún modelo Claude: Architect/Planner/Reviewer = Opus, Executor = Sonnet, igual que antes.

## Diagnóstico que motivó todo (verificado en código)

1. El Intake es grep determinístico (`intake.ts`), no Haiku — costo cero.
2. El Architect escribía specs a ciegas: solo un one-liner + excerpts de 600 chars, cwd = augusto-os (no el repo target), pero el prompt le exige citar archivos/helpers con rutas → specs vagas → Executor adivina → retries. Causa raíz del sobrecosto.
3. El Executor (Sonnet) es el sumidero: único rol con tools, sin max-turns, hasta 9 corridas por step (3 retries internos × 3 invocaciones: normal/verifier-fail/reviewer-fix), y las sesiones frescas post-context-full arrancaban sin ningún contexto.
4. No había medición de tokens (todo `--output-format text`).

## Qué se implementó (4 commits de Claude Code, 304 tests pasando)

**Fase 0 — Métricas** (`277b489`): `src/metrics.ts` — todos los roles pasaron a `--output-format json`; se registra tokens/costo/duración/exitCode por invocación en `logs/metrics-<featureId>.json` (NDJSON, fail-safe).

**Fase 1 — Scout** (`d7bf02f`): `src/scout/` — `provider.ts` (interfaz agnóstica ScoutProvider), `tools.ts` (list_tree/read_file≤150 líneas/grep≤50 matches, bounded, anti path-traversal), `deepseek.ts` (agent loop function-calling, máx 15 turns, ~200K input), `report.ts` (`validateEvidence`: descarta paths inexistentes vía existsSync, marca símbolos no encontrados como confianza 0 `[NO VERIFICADO]` — anti-alucinación determinística), `index.ts` (`runScout`: 3 investigaciones paralelas mapa/detective/riesgos, timeout 5 min, persiste `features/F-XXXX.research.md/.json`). El Executor lee el research del disco automáticamente → retries y sesiones frescas siempre lo tienen. Sin research, prompts byte-idénticos a los anteriores.

**Fase 2 — Fix del gap Architect** (`876bff8`, commiteado 2026-07-03 — en la sesión anterior había quedado escrito pero SIN commitear, se verificó el diff contra este handoff y coincidía exacto): el scout no llegaba al Architect (huevo-gallina con el featureId). Ahora `intake-cli.ts` y `autopilot.ts` pre-computan el featureId con `getNextFeatureId()`, corren el scout con el intake real y pasan `{research, featureId}` a `runArchitect`. `loadOrRunScout` en `index.ts` reutiliza el `.research.md` persistido (no re-invoca DeepSeek para el mismo feature). Todo con fallback no-fatal.

**Fix bonus — ADR en español** (`40fd493`): el Sonnet ejecutor adoptaba el idioma del código del repo target al escribir ADRs (Argos tiene código en portugués/inglés → ADR-0039/0040 salieron en portugués). Fix en `buildPrompt` de `executor.ts`: instrucción explícita de escribir el ADR siempre en español al final del bloque.

Flags: `SCOUT_ENABLED=true|false` + `DEEPSEEK_API_KEY` en `orchestrator/.env`. Apagado = pipeline idéntico al previo. **Al 2026-07-03 siguen sin setear — scout todavía no se corrió ni una vez.**

## Bugs encontrados y fixeados durante la primera corrida de baseline (no estaban en el handoff original)

Aparecieron corriendo F-0010 (ver abajo), no relacionados a Scout pero afectan cualquier medición de costo/retries del loop:

- **S-032** (`index.ts` líneas 192-197): después de una aprobación humana, el step bloqueado se reseteaba a `pending` antes de entrar al `while(true)`, rompiendo el flujo del gate.
- **S-033** (`parseReviewOutput`): el Reviewer a veces escribe análisis antes del veredicto; el chequeo `startsWith('REVIEW: APPROVED')` fallaba con falsos rechazos → ciclos extra. Fix: detecta también la última línea no vacía y `CHANGES_REQUESTED` como substring.

Ambos fixes se aplicaron **a mitad de la corrida de F-0010**, no desde el arranque — por eso esa corrida no es una baseline limpia (ver siguiente sección).

## Primera corrida de baseline: F-0010 (SPT-001, seed data Spensiv dev) — NO USAR como número de referencia

Métricas completas en `logs/metrics-F-0010.json`:

| Rol | Invocaciones | Input | Output | Costo |
|---|---|---|---|---|
| architect | 1 | 6.4k | 8.4k | $1.051 |
| planner | 1 | 8.1k | 1.2k | $0.151 |
| executor | 14 | 2.7k | 52.6k | $3.193 |
| reviewer | 10 | 81.5k | 49.4k | $4.414 |
| **TOTAL** | **26** | **98.7k** | **111.6k** | **$8.809** |

**Por qué este número está contaminado y no sirve para comparar contra scout:**

1. El Reviewer corrió 10 veces (el rol más caro, $4.41 de $8.81) mayormente por el bug S-033 (falsos rechazos), que estuvo activo durante parte del run y se fixeó a mitad de camino. Una fracción grande del costo es "impuesto del bug", no comportamiento normal del pipeline.
2. Steps 3 y 4 quedaron mezclados en un mismo commit (CC decidió no revertir un `package.json` con cambios parciales de step 4 filtrados en el diff de step 3) — el desglose de costo *por step* no es confiable para F-0010, aunque el total del feature sí lo es.

**Conclusión:** hace falta una segunda corrida de baseline — 1 feature más, bajo riesgo, con `SCOUT_ENABLED` todavía apagado pero con S-032/S-033 ya activos **desde el arranque** — para tener un número limpio antes de tocar DeepSeek.

## Estado y próximos pasos (pendientes)

1. [x] Fase 2 commiteada (`876bff8`) + fix ADR-idioma (`40fd493`). 304/304 tests verdes.
2. [x] Primera corrida de baseline (F-0010) — **descartada como número de referencia**, ver arriba.
3. [ ] Correr una segunda baseline limpia: 1 feature P3 de bajo riesgo del backlog (ej. `S-016`, `S-024` o `AR-003` en `system/BACKLOG.md` — evitar `SPT-001`/`S-000c`, ya cubiertos o redundantes con F-0010), scout apagado, bugs ya fixeados desde el inicio.
4. [ ] Cargar USD 10 en platform.deepseek.com, setear `DEEPSEEK_API_KEY` y `SCOUT_ENABLED=true`.
5. [ ] Primer feature con scout: revisar manualmente `features/F-XXXX.research.md` (calidad) y cuántas entradas descarta `validateEvidence` (si descarta muchas → ajustar prompt del scout antes de medir en serio).
6. [ ] Comparar baseline limpia vs. scout en `logs/metrics-*.json`: tokens por rol, retries/step, % aprobación a la primera, costo USD. Criterio: −25% costo sin caída de aprobación; si no, apagar `SCOUT_ENABLED`.

## Diferido a propósito (no hacer sin métricas)

Executor barato para steps mecánicos; scout-on-retry (investigación dirigida cuando falla el verifier); proveedores alternativos (GLM/Qwen/Kimi — la interfaz ya lo permite); indexer persistente del repo.

## Notas operativas

- `deepseek-chat` queda deprecado el 2026-07-24; por eso se usa `deepseek-v4-flash` ($0.14/M in, $0.28/M out ≈ $0.10-0.15 por feature con 3 scouts).
- Flujo de trabajo de Augusto: este chat diseña/arquitectura, Claude Code ejecuta. Entregables de código = prompts precisos para CC.
- El repo vive en `C:\Users\Augusto\Downloads\Proyectos\augusto-os`, orchestrator en el subdirectorio `orchestrator/`.
- Claude Code corre bajo un límite de uso rotativo de 5hs (compartido entre claude.ai/Claude Code/Desktop según cuenta) — si CC se pausa a mitad de una corrida, retoma solo cuando resetea la ventana; no hay forma de acelerarlo salvo usage credits pagos.
