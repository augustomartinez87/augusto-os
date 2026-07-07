# Scout / Knowledge Gathering Layer — Diseño e implementación

**Fecha:** 2026-07-02
**Objetivo:** que Opus/Sonnet gasten tokens pensando y decidiendo, no explorando el repo. Investigación delegada a un modelo barato (DeepSeek) detrás de una interfaz agnóstica de proveedor.

---

## 1. Diagnóstico real (tras leer el código — corrige el relevamiento previo)

**1.1. El Intake NO es Haiku.** `intake.ts` es 100% determinístico: keyword matching + grep sobre DECISIONS.md, features/ y BACKLOG.md. Costo LLM: cero. (`MODEL_INTAKE` existe en `models.ts` pero el intake principal no lo usa.)

**1.2. El Architect escribe specs casi a ciegas — este es el agujero que valida todo el KGL.**
- Recibe solo: `contextSummary` (un one-liner tipo "Target: argos | Clasificación: feature"), la idea original, y excerpts de 600 chars de hasta 3 features relacionados (`architect.ts:28-38`).
- Su `cwd` es la raíz de **augusto-os**, no el repo target (`architect.ts:11,115`). Aunque tiene tools y 15 turns, no puede explorar kredy/spensiv/argos eficientemente.
- El prompt le **exige** "nombrar qué existe en el repo que el loop debe reusar (archivos, helpers, patrones con rutas)" (`architect.ts:74`) — información que no tiene forma confiable de obtener.
- Consecuencia: specs con rutas vagas o inventadas → el Executor adivina → más Reads, más retries. El multiplicador de costo que identificaste ("spec mediocre = costo x2") no es hipotético: está estructuralmente garantizado hoy.

**1.3. Executor: confirmado como sumidero de tokens.**
- Único rol con tools de exploración (`executor.ts:125`), sin `--max-turns`.
- `executeStepWithRetry` = 3 intentos internos, invocado hasta 3 veces por step (normal / verifier fail / reviewer fix en `index.ts:258,294,345`) → hasta 9 corridas por step.
- Cuando el context window se llena, arranca **sesión fresca sin contexto** (`executor.ts:158-161`) → re-explora todo el repo de nuevo.
- El prompt del step no incluye NINGÚN contexto del repo: solo la descripción del step y restricciones (`executor.ts:61-85`). Cada sesión redescubre el codebase desde cero.

**1.4. No hay medición.** Todos los roles usan `--output-format text`; no se captura usage ni costo. No se puede optimizar lo que no se mide.

---

## 2. Decisión de arquitectura

**No reemplazar el Executor.** Sonnet sigue implementando. El orden de ataque:

| Fase | Qué | Por qué primero |
|------|-----|-----------------|
| 0 | Métricas de tokens por rol/step | Sin baseline no hay forma de validar nada |
| 1 | Scout (DeepSeek) pre-Architect | Ataca la causa raíz: specs a ciegas |
| 1b | Inyectar research a Planner y Executor | El mayor ahorro: Sonnet arranca con mapa en vez de explorar |
| 2 (diferida) | Executor barato para steps mecánicos | Solo si las métricas de Fase 0/1 lo justifican |

**Justificación del reparto de roles:**
- **DeepSeek → solo Scout.** Su output es evidencia verificable (paths chequeados con `existsSync`, determinístico, gratis). Peor caso de una alucinación: centavos desperdiciados y una entrada descartada. Nunca escribe código.
- **Claude → Architect, Planner, Executor, Reviewer.** Sin cambios de modelo. Una alucinación en código cuesta retries de Sonnet + review de Opus + potencialmente un bug financiero. La asimetría de riesgo define el reparto.

---

## 3. Arquitectura del Scout

### 3.1. Módulos nuevos (`orchestrator/src/scout/`)

```
scout/
  provider.ts    — interfaz agnóstica: ScoutProvider { name; investigate(task): Promise<ScoutReport> }
  tools.ts       — tools locales BOUNDED que el LLM barato invoca por function calling:
                     list_tree(dir, maxDepth)          → árbol acotado, ignora node_modules/.next/dist
                     read_file(path, fromLine, toLine) → máx 150 líneas por llamada
                     grep(pattern, glob)               → máx 50 matches, línea + 1 de contexto
  deepseek.ts    — cliente OpenAI-compatible (base_url api.deepseek.com), agent loop con
                     function calling, máx 15 turns, budget de tokens por investigación.
                     Modelo: `deepseek-v4-flash` (NO `deepseek-chat`: alias deprecado el 2026-07-24).
  report.ts      — schema zod del informe + validación de evidencia
  index.ts       — runScout(intake, repoRoot): orquesta investigaciones paralelas + consolida
```

### 3.2. Formato del informe (estructura estable, no texto libre)

```jsonc
{
  "objetivo": "string",
  "archivos": [{ "path": "src/...", "rol": "por qué importa", "simbolos": ["fn", "type"] }],
  "patrones": ["convención detectada, con path de ejemplo"],
  "dependencias": ["qué depende de qué, con evidencia"],
  "riesgos": ["qué puede romperse"],
  "evidencia": [{ "path": "...", "simbolo": "...", "lineas": "120-145", "explicacion": "...", "confianza": 0.9 }],
  "resumen": "máx 400 palabras"
}
```

### 3.3. Anti-alucinación (el punto que más te preocupa)

Validación **determinística y gratis** en `report.ts`, post-investigación:
1. Cada `path` citado se verifica con `existsSync` contra el repo target → entrada con path inexistente se **descarta** y se loguea.
2. Cada `simbolo` citado se verifica con grep literal en el path citado → si no aparece, la entrada baja a `confianza: 0` y se marca `[NO VERIFICADO]`.
3. El informe que recibe Opus lleva header: "Evidencia verificada automáticamente contra el filesystem. Entradas [NO VERIFICADO] deben ignorarse o re-chequearse."

Se le pide al scout **evidencia, no opiniones** — exactamente el enfoque `{archivo, funcion, evidencia, confianza}`.

### 3.4. Investigaciones paralelas (3, con roles distintos)

1. **Mapa** — arquitectura relevante a la idea: módulos, entry points, convenciones.
2. **Detective** — código similar ya existente, helpers reutilizables, features previos que tocaron esa zona.
3. **Riesgos** — dependencias, qué puede romperse, tests existentes, edge cases.

Salida: `features/F-XXXX.research.md` (legible) + `features/F-XXXX.research.json` (fuente).

### 3.5. Inserción en el pipeline (cambios mínimos)

```
Intake (grep, sin cambios)
   ↓
runScout(intake, targetRepoRoot)        ← NUEVO. Timeout 5 min. Si falla → research = null y sigue todo como hoy.
   ↓
Architect (Opus)   ← prompt + "## Investigación del repo (verificada)" + instrucción: NO explores, usá estas rutas
   ↓
Planner (Opus)     ← prompt + research → steps que citan archivos reales
   ↓
Executor (Sonnet)  ← cada step recibe el slice del research relevante (archivos citados por el step / feature)
   ↓                  y la instrucción "estos paths ya están verificados; preferí Grep/Glob a Read completo"
Verifier / QA / Reviewer / Commit / Merge — SIN CAMBIOS
```

Puntos de enganche concretos:
- `index.ts`: llamar `runScout` antes de `runArchitect`; pasar `research` a `buildArchitectPrompt` y `planFeature`.
- `architect.ts:40`: `buildArchitectPrompt(..., research?)` — bloque nuevo en el prompt.
- `planner.ts:57`: idem.
- `executor.ts:45`: `buildPrompt(..., researchSlice?)` — además persiste en retries y sesiones frescas (el fix más rentable: hoy una sesión fresca post-context-full arranca sin NADA).
- Fallback total: `research === null` ⇒ prompts idénticos a los actuales. Cero riesgo de romper el pipeline.

---

## 4. Métricas (Fase 0 — prerequisito)

Cambiar los 4 call-sites de `claude` a `--output-format json` y parsear `usage` + `total_cost_usd` de la respuesta. Nuevo `metrics.ts`:

- Por invocación: rol, modelo, step, tokens in/out, costo, duración, exit code.
- Por step: nº invocaciones del executor, retries, ¿aprobado a la primera?
- Por feature: total tokens/costo por rol, y (post-Fase 1) tokens del scout.
- Persistencia: `logs/metrics-F-XXXX.json`.

KPIs para validar el Scout (comparar 3-5 features antes vs después):
1. Tokens totales por feature (por rol).
2. % de steps aprobados al primer intento (verifier + reviewer).
3. Retries promedio por step.
4. Costo USD por feature (Claude + DeepSeek).

**Criterio de éxito:** costo total por feature baja ≥25% sin caída en tasa de aprobación del Reviewer. Si no se cumple, el scout se apaga con un flag y no se pierde nada.

---

## 5. Economía

DeepSeek V4 Flash (jul 2026): **$0.14/M input, $0.28/M output**. Una investigación típica (~100-300K in, 5-10K out) ≈ $0.02-0.05. Tres scouts por feature ≈ **$0.10-0.15/feature**. Con USD 10 de carga: ~70-100 features investigados. El costo del scout es ruido; el ahorro objetivo está en los cientos de miles de tokens de Sonnet/Opus por feature. Config vía env: `SCOUT_PROVIDER=deepseek`, `DEEPSEEK_API_KEY`, `SCOUT_ENABLED=true|false`.

---

## 6. Prompt para Claude Code

```
Contexto: orquestador de features en orchestrator/ de augusto-os. Pipeline actual:
intake.ts (determinístico) → architect.ts (Opus, spec) → planner.ts (Opus, steps JSON) →
executor.ts (Sonnet, tools Read/Edit/Write/Bash/Glob/Grep, sin max-turns) → verifier →
qa → reviewer.ts (Opus, diff ≤8000 chars) → commit/merge. Todos invocan el CLI `claude`
vía execa con --output-format text. Los repos target se resuelven vía targets.ts
(getRepoRoot()). El Architect corre con cwd = raíz de augusto-os y solo recibe un
one-liner de contexto + excerpts de 600 chars; el Executor no recibe ningún contexto
del repo y re-explora en cada retry/sesión fresca.

Implementá en este orden, un commit por fase, sin romper tests existentes (vitest):

FASE 0 — Métricas.
1. Nuevo src/metrics.ts: recordInvocation({featureId, stepId?, role, model, inputTokens,
   outputTokens, costUsd, durationMs, exitCode}) que appendea a logs/metrics-<featureId>.json.
2. Cambiar los defaultCallClaude de architect.ts, planner.ts, reviewer.ts y el execa de
   executor.ts a --output-format json; parsear usage y total_cost_usd del JSON de salida
   (mantener el texto de respuesta como hasta ahora: en json el campo es `result`).
   Registrar cada invocación en metrics. Si el parse de usage falla, loguear y seguir —
   las métricas nunca deben tumbar el pipeline.
3. Tests: parseo del output json, acumulación por feature.

FASE 1 — Scout (Knowledge Gathering Layer).
4. Nuevo src/scout/provider.ts: interfaz ScoutProvider { name: string;
   investigate(task: ScoutTask): Promise<ScoutReport> }. ScoutTask = { objetivo: string,
   repoRoot: string, focus: 'mapa'|'detective'|'riesgos' }.
5. src/scout/tools.ts: list_tree(dir, maxDepth=3) ignorando node_modules/.next/dist/build,
   read_file(path, fromLine, toLine) con máximo 150 líneas, grep(pattern, glob) con máximo
   50 matches. Todas relativas a repoRoot, con guard contra path traversal.
6. src/scout/deepseek.ts: cliente OpenAI-compatible contra https://api.deepseek.com,
   modelo "deepseek-v4-flash" (no usar "deepseek-chat", queda deprecado el 24/7/2026),
   API key en env DEEPSEEK_API_KEY. Agent loop con function calling exponiendo las tools
   del punto 5, máx 15 turns, máx ~200K tokens de input acumulado por investigación.
   Al final fuerza respuesta JSON con el schema de ScoutReport (zod en scout/report.ts):
   { objetivo, archivos[], patrones[], dependencias[], riesgos[], evidencia[{path,
   simbolo, lineas, explicacion, confianza}], resumen }.
7. src/scout/report.ts: validateEvidence(report, repoRoot): descarta entradas cuyo path
   no exista (existsSync) y marca confianza 0 + "[NO VERIFICADO]" cuando el símbolo no
   aparece en el archivo (grep literal). Devuelve el reporte saneado + stats de descartes.
8. src/scout/index.ts: runScout(intake, repoRoot): lanza las 3 investigaciones (mapa,
   detective, riesgos) en paralelo con Promise.allSettled, timeout global 5 min,
   consolida en un markdown + json y los persiste como features/<featureId>.research.md/.json.
   Si todo falla o SCOUT_ENABLED !== 'true', devuelve null.
9. Integración: en index.ts invocar runScout antes de runArchitect. buildArchitectPrompt,
   planFeature y buildPrompt (executor) aceptan research opcional; si existe, agregan un
   bloque "## Investigación del repo (evidencia verificada contra filesystem)" con el
   markdown, más la instrucción "NO explores el repo para redescubrir esto; estas rutas
   están verificadas. Preferí Grep/Glob sobre Read completo para lo que falte."
   En executor.ts el bloque debe incluirse TAMBIÉN en retries y sesiones frescas
   (contextFull), que hoy arrancan sin contexto. Con research === null todos los prompts
   quedan byte-idénticos a los actuales (asserts en tests).
10. Tests: schema del reporte, validateEvidence (paths falsos descartados, símbolos no
    encontrados marcados), fallback null, prompts sin research idénticos a los actuales.
    El agent loop de deepseek.ts con el fetch mockeado.

Restricciones: no tocar verifier/qa/git/gates/telegram. No agregar dependencias nuevas
salvo que sea imprescindible (usar fetch nativo para DeepSeek). Todo configurable por
env y apagable con SCOUT_ENABLED=false.
```

---

## 7. Diferido explícitamente (no hacer ahora)

- Executor DeepSeek para steps mecánicos (`ui: true`, renames): recién con baseline de Fase 0 y 3-5 features medidos con scout.
- Scout-on-retry (investigación dirigida cuando falla el verifier, en vez de dejar que Sonnet re-explore): candidato fuerte para Fase 2, misma infraestructura.
- Multi-proveedor (GLM/Qwen/Kimi): la interfaz `ScoutProvider` ya lo deja listo; implementar solo cuando haya razón de precio/calidad.
- Indexer persistente del repo (resumen pre-computado): solo si el scout on-demand resulta lento o caro, que a $0.14/M es improbable.
