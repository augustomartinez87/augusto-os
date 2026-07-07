# Clasificación de ejecutor del backlog (auto / cc / manual) + autopilot por allowlist

> Prompt para Claude Code. Ejecutor: Sonnet. Repo: `augusto-os`. Autorizado a commitear y pushear a `main`.
> Asigná el próximo ID libre del backlog (regla de IDs append-only). Diagnosticá sobre `main` fresco.

## Por qué

Hoy el autopilot (S-004, en `autopilot.ts`) decide qué procesar de forma autónoma con una **lista negra por palabras** (evita ítems con "dinero/prod/legal/migración" y exige P2+). Es frágil: puede dejar pasar algo riesgoso que no use esas palabras, o agarrar algo que no debería. Queremos invertirlo a una **lista blanca explícita**: el autopilot solo toca lo que Augusto marcó como seguro para correr solo.

## Diseño

1. **Clasificación de ejecutor por ítem de backlog.** Agregar un campo explícito a cada ítem (sugerencia: columna `Ejecutor` en la tabla de `BACKLOG.md`) con tres valores:
   - **`auto`** — el loop autónomo puede tomarlo, construirlo y deployarlo sin supervisión. *Es lo ÚNICO que el autopilot toca.*
   - **`cc`** — trabajo para Claude Code directo (orquestador/sistema). NO autopilot.
   - **`manual`** — manos de Augusto (migraciones, dinero, prod). Nunca autopilot.
   - **Default fail-safe: `manual`.** Un ítem sin clasificar se trata como `manual` y NUNCA corre solo. Los ítems existentes sin el campo NO deben volverse `auto` por omisión.

2. **`BACKLOG.md` es la fuente de verdad** del campo (CONVENTIONS §1). Espejá el campo a la tabla `orch_backlog` de Supabase para que el dashboard lo pueda mostrar (en `sync.ts`, donde ya se espeja el backlog).

3. **Cambiar el autopilot (`autopilot.ts`):** la elegibilidad primaria pasa a ser **`pending` + `Ejecutor=auto`** (allowlist), tomando por orden de prioridad. Mantené como **red de seguridad secundaria** (cinturón y tiradores) el chequeo de palabras de riesgo: si un ítem marcado `auto` igual contiene dinero/prod/legal/migración, **saltarlo + warning** en vez de ejecutarlo. Conservá los demás guardrails existentes (cap 5/día, lock por heartbeat, etc.).

4. **Clasificar el backlog actual, conservador:** marcá cada ítem existente con su `Ejecutor` usando el default seguro — migraciones y cosas de dinero/prod → `manual`; ítems del orquestador/sistema → `cc`; **no promuevas nada a `auto` por tu cuenta.** En el veredicto, listá qué ítems te parecen buenos candidatos a `auto` (ej. features de argos) para que Augusto los confirme él mismo.

5. **Documentar:** en `CONVENTIONS.md` (la clasificación, su semántica y la regla de allowlist del autopilot) y un ADR en `DECISIONS.md` (Origen: `Instrucción de Augusto`).

6. **Tests:** el autopilot toma un ítem `auto`; ignora `cc`, `manual` y los sin clasificar (default manual); y la red de seguridad por palabras de riesgo sigue frenando un `auto` mal etiquetado.

## Restricciones

- Fail-safe: ante cualquier ambigüedad, `manual`. Nada corre solo sin marca explícita `auto`.
- No tocar la lógica de build (planner/executor/verifier) ni el path de aprobación.
- No cambiar el schema de datos de los targets ni datos de Supabase (más allá de la columna en `orch_backlog` si hace falta para el espejo).
- Commit + push a `main`. Marcá este ítem ✅ al terminar.
- Veredicto en castellano: cómo quedó representado el campo, cómo clasificaste el backlog actual, qué ítems sugerís como candidatos `auto` para que Augusto confirme, y confirmación de que nada quedó `auto` por omisión.
