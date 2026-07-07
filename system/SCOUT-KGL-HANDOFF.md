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

## Resultado — primera medición real (F-0012, 2026-07-06)

**Scout funciona y supera el criterio.** F-0012 (S-024, evaluador de posts de X, target `sistema`) corrió con `SCOUT_ENABLED=true` tras 5 rondas de fixes reales en el scout (ver "Bugs encontrados" abajo): 7/7 steps, **0 retries, 0 rechazos del Reviewer** — contraste directo con F-0011 (baseline, scout apagado), que necesitó 8 corridas de Executor solo en step 1 y varios `CHANGES_REQUESTED`.

| | F-0011 (baseline, scout off) | F-0012 (un solo pase limpio) | F-0012 (total real gastado esta sesión) |
|---|---|---|---|
| TOTAL | $6.481 | $4.110 (**-37%**) | $8.981 (**+39%**) |

**Importante — no confundir estas dos columnas de F-0012:** el total real de la sesión ($8.981) es más caro que la baseline, no más barato. La causa NO es Scout: un bug operativo separado (`TaskStop` no mataba de verdad un proceso en background, solo dejaba de trackearlo; el proceso zombie — dormido por el bug ya fixeado del falso-positivo "429" — se despertó solo y re-corrió los steps 1-6 desde cero con sesiones nuevas mientras CC hacía otro trabajo en el mismo repo) duplicó gasto real de Executor/Reviewer. El estado final convergió sano (322/322 tests, deploy en Vercel confirmado) pero el costo quedó inflado por partida doble.

**El número que vale para la decisión de Scout es -37% (un solo pase limpio)**, que es la métrica real del primer y único pase exitoso (7/7 steps, 0 retries, 0 rechazos) — no una estimación, es el filtrado correcto del log NDJSON compartido para excluir las entradas del segundo pase duplicado. El +39% es "cuánto costó esta sesión de debugging + un incidente operativo", un dato distinto que no debería pesar en si Scout se apaga o no.

Pendiente para más adelante (no bloqueante): investigar por qué el mecanismo de stop de procesos en background no mata el árbol completo — mismo patrón sospechoso que el bug de `orch-sync`/pm2 (un wrapper que spawnea un proceso interno que escapa al control del padre).

**Caveat:** `sistema` es un target atípico (cruza el límite del repo hacia `system/`, requirió el fix de `scoutRoot`). Antes de dar la conclusión final hace falta repetir con 1-2 features de kredy/spensiv/argos (repos autocontenidos, caso típico).

## Bugs encontrados y fixeados en el scout durante esta validación (deepseek.ts/tools.ts)

Todos verificados con tests/typecheck, ninguno pendiente:

1. Conteo de tokens sumaba en vez de tomar el último valor (`prompt_tokens` ya es acumulado) → disparaba el corte de "~200k" prematuramente y de forma engañosa.
2. Historial de mensajes nunca se podaba → crecimiento sin límite con cada tool result.
3. Cap de 150 líneas de `read_file` no aplicaba si el modelo pasaba `toLine` explícito.
4. Fix del pruning: podar `list_tree`/`grep` agresivo, pero **nunca** `read_file` (ya acotado por #3) — podar parejo causaba que el modelo releyera archivos ya vistos en loop infinito.
5. Señal de turno en vivo (mensaje "Turno N de MAX" en cada llamada, imperativo de cierre en los últimos 3) — la instrucción de cierre en el system prompt inicial no alcanzaba, el modelo no tenía forma de saber en qué turno estaba.
6. Prompt de evidencia más estricto: un símbolo = un identificador literal copiable, nunca una frase con "+" — bajó el ratio de `[NO VERIFICADO]` de 21/22 a 1/12 sin tocar `validateEvidence` (que ya funcionaba bien, el problema era el formato de entrada del modelo).
7. **Seguridad:** `tools.ts` no excluía `.env`/secretos de `list_tree`/`read_file`/`grep` — cualquier scout sobre `target: sistema` podía en teoría leer `orchestrator/.env` (DEEPSEEK_API_KEY, SUPABASE_SERVICE_KEY, etc.) y mandarlo a la API de DeepSeek. Fixeado con exclusión explícita, misma prioridad que el guard anti path-traversal.
8. `targets.json`: `sistema.path` apunta a `orchestrator/` (necesario para que `tsc`/`test` encuentren `package.json`/`tsconfig.json`), pero el scout necesitaba ver `system/` un nivel arriba. Fix: campo nuevo `scoutRoot` (default = `path`, cero cambio para kredy/spensiv/argos), `sistema.scoutRoot` = raíz del monorepo.

## Estado y próximos pasos (pendientes)

1. [x] Fase 2 commiteada (`876bff8`) + fix ADR-idioma (`40fd493`). 304/304 tests verdes.
2. [x] Baseline limpia: F-0011 ($6.481 total, 4 roles, 0 scout).
3. [x] Scout activado, 8 bugs encontrados y fixeados, primera corrida real exitosa (F-0012, -37%/-22%).
4. [ ] Repetir con 1-2 features de kredy/spensiv/argos (target típico, sin la complejidad de `system/`) para confirmar que el resultado generaliza más allá de `sistema`.
5. [ ] Decidir sobre F-0012: branch `feat/F-0012-evaluador-de-posts-de-x-contra-la-arquit` completo (7 commits + fix de un bug de rate-limit, 322/322 tests) pero sin mergear — bloqueado por el mismo tipo de residuo de `LOOP_HEARTBEAT.json` sin commitear que vimos en F-0011. Pendiente: confirmar que no incluye el script temporal de debugging (`scout-retry-temp.ts`) antes de mergear.
6. [ ] Con 3-5 features medidos, comparar `logs/metrics-*.json` en conjunto y cerrar el criterio de -25% de forma robusta (no solo con el caso atípico de `sistema`).

## Diferido a propósito (no hacer sin métricas)

Executor barato para steps mecánicos; scout-on-retry (investigación dirigida cuando falla el verifier); proveedores alternativos (GLM/Qwen/Kimi — la interfaz ya lo permite); indexer persistente del repo.

## Notas operativas

- `deepseek-chat` queda deprecado el 2026-07-24; por eso se usa `deepseek-v4-flash` ($0.14/M in, $0.28/M out ≈ $0.10-0.15 por feature con 3 scouts).
- Flujo de trabajo de Augusto: este chat diseña/arquitectura, Claude Code ejecuta. Entregables de código = prompts precisos para CC.
- El repo vive en `C:\Users\Augusto\Downloads\Proyectos\augusto-os`, orchestrator en el subdirectorio `orchestrator/`.
- Claude Code corre bajo un límite de uso rotativo de 5hs (compartido entre claude.ai/Claude Code/Desktop según cuenta) — si CC se pausa a mitad de una corrida, retoma solo cuando resetea la ventana; no hay forma de acelerarlo salvo usage credits pagos.
