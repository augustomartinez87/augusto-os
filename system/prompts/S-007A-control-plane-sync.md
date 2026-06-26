# Prompt para Claude Code — S-007 Fase A: control plane (Supabase) + sync del runner

> Pegá este documento en Claude Code (Sonnet) dentro de `augusto-os/orchestrator/`.
> Augusto es Product Owner; salida final = **veredicto en castellano** PASÓ/FALLÓ.
> Alcance ÚNICO- la FUNDACIÓN del dashboard- schema de Supabase + un proceso de sync que espeja el estado del loop a Supabase y baja las aprobaciones. **SIN UI** (eso es Fase B). v1 del dashboard = monitor + aprobar + ideas.
> NO construir- la web, disparar features remotos (Fase C), ni loops nocturnos.

## Objetivo

Que el estado del orquestador viva en Supabase para que una web (Fase B) lo muestre en vivo y se pueda **aprobar un gate desde afuera**. El loop NUNCA corre en la nube- un proceso local (`npm run sync`) espeja `STATE.json` + logs a Supabase y pollea las aprobaciones, igual que el bot de Telegram limpia el gate. Patrón de procesos del runner- `npm start` (loop) + `npm run bot` (Telegram) + `npm run sync` (espejo Supabase).

## Prerrequisito (Augusto, fuera de este prompt)

Un **proyecto Supabase dedicado al control plane** (NO la prod de Kredy ni Argos). Si el free tier no deja crear otro, reusar uno existente con las tablas prefijadas `orch_`. La migración SQL la genera este prompt; Augusto la aplica en ese proyecto y pega `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` en `.env`.

## Diseño

### 1. Migración SQL `supabase/control-plane.sql`

Tablas (prefijo `orch_`):
- `orch_runs`- `feature_id` text PK, `target`, `title`, `state` (backlog/active/review/done/blocked/waiting), `current_step` int, `total_steps` int, `branch`, `created_at`, `updated_at`.
- `orch_steps`- `id` uuid, `feature_id` fk, `step_no` int, `descripcion`, `status`, `commit_sha`, `updated_at`. UNIQUE(`feature_id`, `step_no`).
- `orch_gates`- `id` uuid, `feature_id`, `detail`, `status` ('pending'|'approved'|'rejected') default 'pending', `created_at`, `resolved_at`, `resolved_by`.
- `orch_logs`- `id` bigint identity, `feature_id`, `ts`, `line`.
- `orch_ideas`- `id` uuid, `text`, `source` ('telegram'|'web'|'local'), `status` ('new'|'triaged') default 'new', `created_at`.
- `orch_presence` (opcional)- `role`, `process`, `last_heartbeat`.
RLS habilitado. El runner escribe con **service role** (bypassa RLS). Dejar comentada/preparada una policy de lectura para `anon` (la web de Fase B leerá read-only). No exponer service key a la web.

### 2. `src/sync.ts` — el espejo (proceso `npm run sync`)

- Config- `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` en `.env` (gitignored). **Degradación total**- si faltan, no-op + log y el sistema sigue andando local + Telegram.
- Cliente- `@supabase/supabase-js` (`npm install`).
- Loop cada ~5s-
  1. `loadState()` → upsert `orch_runs` (feature_id, state derivado del STATE, current_step = primer step no-done, total_steps, branch) + upsert `orch_steps` por cada step (status, commit). Si `needsHumanApproval` → upsert una fila `orch_gates` (status 'pending') si no existe una abierta para ese feature.
  2. Tail de `orchestrator.log`- empujar líneas nuevas a `orch_logs` trackeando un offset (byte/línea) persistido localmente para no reenviar.
  3. Poll `orch_gates`- si la fila del gate actual quedó `status='approved'` (la web la marcó) → limpiar `needsHumanApproval` en STATE.json (equivalente a `npm run approve`; el loop reanuda al pollear). Si `'rejected'` → registrar en `blocked.log`.
  4. Ideas- empujar líneas nuevas de `../system/FEATURE-INTAKE.md` a `orch_ideas` (source 'local'/'telegram'). (Pull de ideas 'web' → FEATURE-INTAKE.md- opcional, marcando para no duplicar.)
- Heartbeat opcional en `orch_presence`.

### 3. `package.json`

Agregar `"sync": "tsx --env-file=.env src/sync.ts"`.

## Restricciones

- **El loop (`index.ts`) NO se modifica**- el sync espeja desde los archivos (STATE.json, orchestrator.log, FEATURE-INTAKE.md). Desacoplado, como el bot.
- Degradación total sin credenciales Supabase.
- El service key nunca se commitea; `.env` ya gitignored.
- No construir UI ni disparar features (Fase B/C).
- Sin tocar la prod de Kredy/Argos- es un proyecto Supabase aparte.

## Verificación (dejar pasando)

1. `npx tsc --noEmit` limpio; lint; suite existente verde.
2. Tests (mockear el cliente Supabase, sin llamadas reales)-
   - mapeo de un `STATE.json` de fixture a los upserts esperados de `orch_runs`/`orch_steps`/`orch_gates`.
   - marcar un gate `approved` limpia `needsHumanApproval` en STATE.json.
   - el tail de log no reenvía líneas ya empujadas (respeta el offset).
3. Prueba manual documentada (no contra prod de productos)- con `SUPABASE_*` seteadas, correr el loop + `npm run sync`, ver las filas aparecer en Supabase, y aprobar un gate cambiando `orch_gates.status='approved'` → el loop reanuda.

## Salida final (para Augusto)

Tabla PASÓ/FALLÓ (migración SQL · sync.ts mapeo · poll de aprobación · tail de logs · ideas · tests). Y una frase- ¿el estado del loop se ve en Supabase y se puede aprobar desde una fila? ¿Qué queda para la Fase B (la web)?
