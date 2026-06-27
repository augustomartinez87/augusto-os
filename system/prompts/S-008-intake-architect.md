# Prompt para Claude Code — S-008: Intake barato + Architect agent

> Pegar tal cual en Claude Code, parado en la raíz del repo `augusto-os`.
> **No correr esto vía `npm start F-XXXX`** — es una modificación al orquestador en sí
> (un nuevo módulo de `orchestrator/src/`), no una feature de producto.
> **No hacer push directo a `main` al terminar.** Dejar el trabajo committeado en una rama
> (`feature/s008-intake-architect`) y avisar a Augusto para que revise antes de mergear —
> esto agrega un componente que usa Opus on-demand y escribe specs que después disparan el
> loop de producción, conviene una revisión antes de habilitarlo en serio.

## Contexto

Hoy, convertir una idea en un `features/F-XXXX.md` ejecutable es un proceso manual: Augusto
(o este asistente, en otro chat) responde a mano las "9 preguntas del intake" descritas en
`system/FEATURE-INTAKE.md` y escribe el `.md` a partir de `orchestrator/features/_TEMPLATE.md`.
Las ideas sueltas ya se capturan en dos canales y quedan apendeadas como una lista al final de
ese mismo archivo:

- Telegram: `orchestrator/src/telegram.ts`, función `saveIdea()` — comando `/idea <texto>`
  hace `appendFileSync` a `system/FEATURE-INTAKE.md` con formato
  `- [ISO timestamp] (telegram) <texto>`.
- Web (dashboard, S-007 Fase A/B): mismo archivo, mismo formato, con tag `(web)` en vez de
  `(telegram)` (ver entradas existentes al final de `system/FEATURE-INTAKE.md`).

Cada vez que aparece una idea nueva, alguien tiene que leerla, decidir si es bug/feature/
arquitectura, buscar contexto relacionado (ADRs, features previos, backlog) y, si amerita,
escribir el spec a mano invocando a Opus en una conversación aparte. Esto es el "segundo
centro de gasto de Opus" del sistema (además del Planner) y hoy no tiene código, vive en la
cabeza de Augusto o en un chat de Claude.

Leer antes de tocar nada: `system/CONVENTIONS.md`, `system/ARQUITECTURA-ACTUAL.md`,
`system/FEATURE-INTAKE.md` (completo — es la spec funcional de lo que hay que automatizar),
`orchestrator/features/_TEMPLATE.md`, `orchestrator/src/planner.ts` (patrón de invocación a
Opus vía `execa('claude', ...)`, ya centralizado en `orchestrator/src/models.ts` ·
`MODEL_PLANNER`/`MODEL_BUILDER` desde S-019e — reusar esas constantes, agregar
`MODEL_INTAKE` si el modelo barato necesita su propio nombre).

## Qué se construye

Dos piezas que comparten entrada (una idea en texto) pero corren en momentos distintos:

### (a) Intake barato — `orchestrator/src/intake.ts`

Función `runIntake(ideaText: string): IntakeResult`, sin Opus (modelo barato — usar el mismo
mecanismo de `execa('claude', ['--model', MODEL_INTAKE, ...])` que `planner.ts`, pero con un
modelo barato; si no hay uno configurado todavía en `models.ts`, agregar
`MODEL_INTAKE = 'claude-haiku-4-5-20251001'` como default y dejarlo como constante, no
hardcodeado inline).

Responsabilidades (sin tocar Opus):
1. **Detectar el target** (`kredy` | `spensiv` | `argos`) — por palabras clave del texto y/o
   grep contra `system/targets.json` (ver `orchestrator/src/targets.ts` para la lista de
   targets válidos y su config).
2. **Buscar contexto relacionado** vía grep/retrieval (sin LLM caro): ADRs relevantes en
   `system/DECISIONS.md`, features previos en `orchestrator/features/*.md`, líneas del
   `system/BACKLOG.md` que mencionen temas similares. No necesita ser semántico — grep por
   keywords del texto de la idea alcanza para v1.
3. **Clasificar**: `bug` | `feature` | `arquitectura` (cambio que toca el propio
   orchestrator, como S-019/S-020/S-021/S-017, NO una feature de producto).
4. **Resumir contexto** en un objeto estructurado que el Architect (b) pueda consumir sin
   tener que re-leer todo el repo desde cero.

`IntakeResult` sugerido:
```ts
export interface IntakeResult {
  ideaText: string
  target: 'kredy' | 'spensiv' | 'argos' | 'sistema' | 'unknown'
  classification: 'bug' | 'feature' | 'arquitectura'
  relatedAdrs: string[]       // ej. ["ADR-0019", "ADR-0013"]
  relatedFeatures: string[]   // ej. ["F-0006"]
  relatedBacklogIds: string[] // ej. ["SP-005", "S-008"]
  contextSummary: string      // resumen corto para el Architect
  needsArchitect: boolean     // true si amerita Opus (ver criterio abajo)
}
```

Criterio de `needsArchitect`: si la idea es un cambio mecánico/trivial y de alcance obvio
(ej. "agregar un campo a un form ya existente", typo, copy) → `false`, no hace falta Opus,
se puede armar el `.md` con una plantilla simple o incluso pedir confirmación directa a
Augusto antes de gastar Opus. Si la idea requiere decidir alcance, cruzar reglas de dominio,
o el `classification` es `arquitectura` → `true`.

### (b) Architect agent — `orchestrator/src/architect.ts`

Función `runArchitect(intake: IntakeResult): Promise<string>` — invoca a Opus (vía
`MODEL_PLANNER` o una constante propia `MODEL_ARCHITECT` si conviene distinguirlo del
planner de steps) SOLO cuando `intake.needsArchitect === true`. Responsabilidad: escribir el
contenido completo de un `features/F-XXXX.md` siguiendo `_TEMPLATE.md`, respondiendo las
9 preguntas de `FEATURE-INTAKE.md` con base en `intake.contextSummary` + el texto original de
la idea. El prompt a Opus debe:
- Pasarle el contexto ya resumido por (a) (no repetir el grep, ya está hecho).
- Exigir que el spec resultante cumpla la "Definition of Ready" de `FEATURE-INTAKE.md`
  (target + ui + ≥2 criterios observables + alcance mínimo + fuera de alcance + restricciones
  + declarar si toca DB/prod/legal).
- Asignar el siguiente `F-XXXX` libre (grep en `orchestrator/features/*.md` el número más
  alto y sumar 1 — mismo patrón que `appendAdr` usa para IDs en `adr.ts`).
- Si la idea implica DB/prod/legal (pregunta 8 del intake), el spec debe declararlo
  explícitamente en "Restricciones clave" — el gate humano ya existe en `gates.ts`, este
  agente no decide gates, solo los documenta en el spec para que se disparen solos.

Escribir el archivo resultante en `orchestrator/features/F-XXXX.md` (no solo devolver el
string — persistirlo, igual que hace `planner.ts` con los steps).

## Punto de entrada / CLI

Agregar un comando, ej. `npm run intake -- "<texto de la idea>"` (script nuevo en
`package.json` del orchestrator) que:
1. Corre `runIntake(texto)`.
2. Loguea el resultado (`target`, `classification`, `relatedAdrs/Features/BacklogIds`,
   `needsArchitect`).
3. Si `needsArchitect`, corre `runArchitect(intake)` y loguea la ruta del `F-XXXX.md`
   generado.
4. Si no, loguea un mensaje indicando que no amerita Architect y sugiere el siguiente paso
   manual (ej. "parece trivial, revisalo y escribilo a mano o confirmá para forzar Architect
   con `--force-architect`").

No hace falta integrarlo todavía con Telegram/web (S-007 Fase C es el disparo end-to-end
desde el dashboard) — alcanza con que el comando funcione standalone sobre texto pasado por
CLI o leyendo la última entrada no procesada de `system/FEATURE-INTAKE.md`. Decisión de
diseño abierta: marcar como "no especificado, decidir con criterio" — si conviene, agregar al
final de `FEATURE-INTAKE.md` un marcador simple (ej. `<!-- procesado -->`) para no reprocesar
ideas ya convertidas en spec. Si se toma esta decisión, documentarla como candidata a ADR.

## Fuera de alcance (no hacer en este sprint)

- Integración con el dashboard/chat de S-007 Fase C (disparo end-to-end desde la web).
- Retrieval semántico (embeddings, vector search) — el grep por keywords alcanza para v1.
- Disparar automáticamente `npm start F-XXXX` al terminar el Architect — el spec generado
  queda para que Augusto lo revise antes de correrlo (mismo criterio que con F-0006).
- Reemplazar el proceso manual descrito en `FEATURE-INTAKE.md` — ese documento queda como
  fallback/referencia humana, no se borra.

## Restricciones clave

- El Architect NUNCA debe escribir specs que toquen migraciones SQL o deploy directamente
  como "pasos sugeridos" ejecutables sin gate — esas cosas van en "Restricciones clave" del
  spec para que el gate humano existente las intercepte, igual que ya hace `planner.ts`
  (`NO incluyas pasos de migración SQL, deploy a Vercel, ni cambios legales`).
- No gastar Opus si `needsArchitect` da `false` — ese es el punto central de la feature
  (reducir el 2º centro de gasto de Opus).
- Reusar `MODEL_PLANNER`/`MODEL_BUILDER` de `orchestrator/src/models.ts`; si se agregan
  constantes nuevas (`MODEL_INTAKE`, `MODEL_ARCHITECT`), centralizarlas ahí también, no
  hardcodear strings de modelo en `intake.ts`/`architect.ts`.
- Mantener el mismo patrón de invocación a Claude Code que ya usan `planner.ts`/`executor.ts`
  (`execa('claude', [...])`, `--dangerously-skip-permissions`, `--strict-mcp-config`,
  parseo de JSON con regex + `zod` para validar) — no introducir una librería/SDK distinta.

## Tests

Agregar `orchestrator/src/intake.test.ts` cubriendo, sin llamar a un modelo real (mockear la
llamada a `execa`/`claude` si la detección de target/clasificación depende del LLM barato, o
si se puede resolver con heurística pura de keywords para v1, mejor — más barato y más
testeable):
- Detección de target por keywords obvias (ej. "Kredy", "préstamo", "mutuo" → `kredy`).
- Clasificación `bug` vs `feature` vs `arquitectura` con casos de ejemplo claros.
- `needsArchitect` true/false en casos límite (idea trivial vs. idea que requiere arquitectura).
- Grep de ADRs/features/backlog relacionados contra fixtures de ejemplo (no contra los
  archivos reales del repo, para no romper si cambian).

Si `architect.ts` invoca a Opus de verdad, no testear la llamada en sí (cuesta dinero) — sí
testear el armado del prompt y el parseo/escritura del `.md` resultante con un mock de la
respuesta de Opus.

## Verificación antes de terminar

- `npm run build` (o `tsc --noEmit`) sin errores en `orchestrator/`.
- Lint sin errores.
- Tests nuevos en verde, sin romper los existentes (`adr.test.ts`, `state.test.ts`,
  `gates.test.ts`, `index.test.ts` del hardening S-019/S-021).
- Probar manualmente el comando `npm run intake -- "<idea de prueba>"` con al menos un caso
  que dispare Architect y uno que no, mostrando el log esperado.

## Entrega

Commit(s) en rama `feature/s008-intake-architect` (no pushear a `main`). Resumen final con:
qué se tocó, qué tests se agregaron, decisiones de diseño no triviales tomadas (ej. cómo se
resolvió la detección de target/clasificación — heurística vs. LLM barato — y por qué) para
que Augusto las registre como ADR si corresponde.
