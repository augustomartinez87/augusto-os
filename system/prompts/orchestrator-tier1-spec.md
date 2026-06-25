# Prompt para Claude Code — Orquestador autónomo Tier 1 (Spensiv)

> Pegá este documento completo en Claude Code (Sonnet) corriendo dentro del repo de Spensiv.
> Es la spec de scaffolding del orquestador. No implementa features de producto todavía:
> construye la **máquina que va a implementar features sola**, con resume ante corte de tokens
> y gate de QA con Playwright.

---

## 0. Contexto del proyecto (no romper)

Spensiv: Next.js / tRPC / Prisma / Clerk / Tailwind, deploy en Vercel, package manager **pnpm**.

Invariantes que el orquestador y todo agente que spawnee DEBEN respetar:

- **La TNA/tasa NUNCA se muestra al prestatario.** Solo el monto de la cuota. Esto es un gate de QA, no una sugerencia.
- **Peligro crítico de DB:** el `DATABASE_URL` local apunta a **producción**. `prisma migrate dev` toca prod. Por lo tanto el orquestador tiene **prohibido** correr migraciones, `migrate`, `db push`, o cualquier SQL destructivo de forma autónoma. Eso va a gate humano siempre.
- **Columnas en camelCase sin `@map`.** Las migraciones se generan desde el schema, nunca se escriben a mano en snake_case.
- Deploys a Vercel, cambios de cron/pipeline, y generación de documentos legales (mutuo/pagaré) → **gate humano siempre**.

---

## 1. Objetivo

Construir un **orquestador persistente en TypeScript/Node** que implemente features de Spensiv en un loop autónomo:

```
spec del feature → planner (Opus) descompone en pasos
  → por cada paso: executor (Claude Code headless, Sonnet) escribe código
  → verifier: typecheck + lint + tests
  → si es feature de UI: QA gate (Playwright headless)
  → checkpoint (commit + STATE.json) → siguiente paso
  → al terminar: PR para review humano
```

Tres propiedades no negociables:

1. **Resume ante corte de tokens / sesión.** Si se agota la ventana de uso del plan o se corta, el proceso no falla: persiste estado, espera al reset y reanuda donde estaba.
2. **Guardrails de prod.** Todo lo de la sección 0 se bloquea por reglas declarativas + hook, no por confianza.
3. **Verificación obligatoria** antes de cada checkpoint (evita code churn).

El orquestador corre como **demonio** (pm2 o systemd) en la máquina de Augusto, NO dentro de un sandbox efímero.

---

## 2. Estructura de archivos a crear

```
orchestrator/
  package.json              # deps: zod, execa, better-sqlite3 o lowdb, @playwright/test
  src/
    index.ts                # entrypoint del demonio: loop principal
    state.ts                # lectura/escritura de STATE.json (la fuente de verdad del progreso)
    planner.ts              # invoca Opus para descomponer la spec en pasos
    executor.ts             # invoca `claude -p` headless (Sonnet) por paso
    verifier.ts             # corre typecheck + lint + tests; parsea fallos
    qa.ts                   # Playwright headless + asserts de invariantes
    limits.ts               # detección de rate/usage limit + cálculo de reset + sleep
    gates.ts                # detección de operaciones que requieren gate humano
    git.ts                  # branch por feature, commit atómico por paso, worktree
  features/
    F-XXXX.md               # specs de feature (input del loop), una por archivo
  .claude/
    settings.json           # permisos allow/deny/ask
    hooks/
      pre-tool-use.sh       # hook anti-prod
  STATE.json                # estado runtime (generado, en .gitignore)
  state.db                  # opcional si se usa sqlite (en .gitignore)
```

---

## 3. Permisos declarativos — `.claude/settings.json`

Generar un `settings.json` que el executor headless usa en cada invocación. Estructura:

- **`permissions.allow`**: edición de archivos del repo, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, lecturas de git, `git add/commit/branch/checkout` sobre branches de feature.
- **`permissions.deny`**: cualquier `prisma migrate*`, `prisma db push`, `vercel*` / `vercel deploy`, SQL con `DROP`/`TRUNCATE`/`DELETE` sin WHERE, escritura sobre `main`/`master`, edición de archivos de mutuo/pagaré.
- **`permissions.ask`**: todo lo que no esté explícitamente en allow.

---

## 4. Hook anti-prod — `.claude/hooks/pre-tool-use.sh`

Hook `PreToolUse` que intercepta comandos Bash y aborta (exit code de bloqueo) si el comando matchea, como segunda capa por si la allowlist no lo cubre:

- regex contra: `prisma migrate`, `prisma db push`, `DATABASE_URL`, `vercel`, `DROP TABLE`, `TRUNCATE`, `DELETE FROM` sin `WHERE`, push a `main`.
- Si matchea → bloquea y registra el intento en un log `orchestrator/blocked.log`.

---

## 5. Máquina de estado y resume — el corazón del Tier 1

### `STATE.json` (fuente de verdad del progreso)

```json
{
  "featureId": "F-0001",
  "branch": "feat/F-0001-...",
  "steps": [
    { "id": 1, "desc": "...", "status": "done",    "commit": "abc123", "sessionId": "..." },
    { "id": 2, "desc": "...", "status": "running",  "commit": null,     "sessionId": "..." },
    { "id": 3, "desc": "...", "status": "pending",  "commit": null,     "sessionId": null }
  ],
  "pausedUntil": null,
  "needsHumanApproval": null
}
```

### Reglas de resume

- **Checkpoint por paso = commit atómico de git + update de STATE.json.** Un paso solo pasa a `done` cuando (a) el verifier pasó y (b) hay commit. El repo es la fuente de verdad; STATE.json es el índice.
- **Idempotencia:** al arrancar, el demonio lee STATE.json, busca el primer paso `!= done` y continúa. Si un paso ya tiene commit, lo saltea. Retries acotados por paso (ej. máx 3) antes de marcar `blocked` y pedir intervención.
- **Reanudar sesión:** guardar el `sessionId` que devuelve `claude` y reanudar con `claude --resume <sessionId>` cuando se retoma un paso a medias. Confirmar el nombre exacto del flag contra la doc actual de Claude Code.

### `limits.ts` — manejo de corte de tokens

Envolver TODA invocación a `claude`. Distinguir dos casos:

1. **Ventana de uso del plan agotada** (respuesta tipo 429 / mensaje de usage limit):
   - parsear el tiempo de reset (headers de rate-limit / retry-after, o cálculo de la próxima ventana),
   - escribir `pausedUntil` en STATE.json,
   - **dormir hasta el reset** (`setTimeout` / scheduler) y reanudar automáticamente. Como es demonio, sobrevive al overnight.
   - log claro: `"Límite alcanzado. Reanudando a las HH:MM."`
2. **Context window lleno** (no es lo mismo que quedarse sin plan):
   - dejar que la compactación in-session de Claude Code lo maneje; si la sesión muere, arrancar **sesión fresca seedeada con STATE.json + un progress log resumido**, nunca re-inyectando el transcript viejo entero.

Backoff exponencial para errores transitorios (red, 5xx). Cap de espera máximo configurable.

---

## 6. Verifier gate — `verifier.ts`

Antes de cada checkpoint, correr en orden y abortar el paso si algo falla:

1. `pnpm typecheck` (o `tsc --noEmit`)
2. `pnpm lint`
3. `pnpm test` **solo si existen tests**; si no hay, registrar warning y seguir.

Si falla: capturar el output del error y **devolvérselo al executor como prompt de corrección** (retry acotado). No se commitea código que no pasa el verifier.

---

## 7. QA gate — `qa.ts` (Playwright headless)

Se ejecuta solo en pasos marcados como `ui: true` en la spec del feature. Flujo:

1. Levantar el target: preview de Vercel del branch, o `next dev` local en un puerto efímero.
2. Con Playwright headless: navegar los flujos clave del feature, tomar screenshots, **leer la consola del browser → cualquier error JS hace fallar el gate.**
3. **Asserts de invariantes de Spensiv** (hard fail):
   - En toda vista de **prestatario**, verificar por DOM/texto que **no aparece la TNA ni la tasa** — solo el monto de la cuota. Si aparece → falla y se devuelve al executor.
4. Guardar screenshots en `orchestrator/qa-artifacts/F-XXXX/` para el review humano.

> El pase de **juicio de UX** (¿se siente raro?, ¿el flujo confunde?) NO va acá: queda para Augusto vía la extensión Claude in Chrome sobre el PR final. Playwright cubre regresión, consola e invariantes; el ojo humano cubre experiencia.

---

## 8. Gates humanos — `gates.ts`

Si un paso requiere una operación de la sección 0 (migración, deploy, cron, doc legal), el orquestador:

1. Marca `needsHumanApproval` en STATE.json con el detalle.
2. **Detiene el loop** (no intenta hacerlo él).
3. Notifica (log + opcional: webhook/email) y espera aprobación explícita (un comando CLI `orchestrator approve <featureId>` o tocar un archivo flag).

---

## 9. Formato de spec de feature — `features/F-XXXX.md`

Input del loop. Cada feature es un markdown con frontmatter:

```markdown
---
id: F-0001
title: <título corto>
ui: true            # activa el QA gate de Playwright
acceptance:
  - criterio verificable 1
  - criterio verificable 2
---

## Contexto
<qué y por qué>

## Pasos sugeridos (el planner puede refinar)
1. ...
2. ...

## Fuera de alcance
- ...
```

El planner (Opus) toma esto, lo refina en pasos atómicos y los escribe en STATE.json.

---

## 10. Criterios de aceptación del scaffold

- [ ] `pnpm install` en `orchestrator/` funciona; el demonio arranca con `pnpm start`.
- [ ] Con un `STATE.json` que tiene un paso a medias, al reiniciar el proceso **reanuda ese paso** y saltea los `done`.
- [ ] Simular un usage-limit (mockear la respuesta de `claude`): el proceso escribe `pausedUntil`, no crashea, y reanuda solo.
- [ ] El hook bloquea un comando `prisma migrate dev` y lo loguea en `blocked.log`.
- [ ] El verifier corre typecheck+lint y bloquea un commit con un type error inyectado.
- [ ] El QA gate falla si una vista de prestatario renderiza la tasa.
- [ ] Ningún paso del loop puede deployar a Vercel ni correr una migración sin pasar por el gate humano.

## Fuera de alcance de este scaffold

- Implementar features de producto (eso lo hace el loop una vez construido).
- Tier 2 (planner/executor/verifier como agentes SDK separados con comunicación rica). Esto es el loop fino que cubre el 80%.

Primer feature de prueba sugerido cuando el scaffold esté listo: tomar **S5 de la capa comercial AP** (ya tiene spec), correrlo en una branch, validar el ciclo completo en algo de bajo riesgo antes de soltarlo en más features.
