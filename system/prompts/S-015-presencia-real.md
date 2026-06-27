# S-015 — Agent team view con presencia real (heartbeat)

> Prompt para Claude Code. Ejecutor: Sonnet. Repo: `augusto-os`. Autorizado a commitear y pushear a `main`.
> Trabajá sobre `main` actualizado (mi copia local está desincronizada; la fuente de verdad es main).

## Objetivo

Hoy el dashboard **infiere** quién tiene la posta desde `orch_runs`/`orch_steps` (función `derivePosta` en `dashboard/index.html`). Si el loop se cuelga o muere, el dashboard sigue mostrando el último estado como si el trabajo continuara — actividad falsa. Esto viola el principio de no mentir actividad.

S-015 reemplaza la inferencia por **presencia real**: el orquestador emite un heartbeat a una tabla `orch_presence`, el dashboard lo lee, y si el heartbeat está **stale** muestra al agente como "sin señal / posible cuelgue". Hace visible un loop muerto (hoy invisible — ver el `Lock stale (660s)` en los logs del autopilot).

**Alcance estricto:** presencia real y liveness honesta. **NO** agregar personalidad, frases, pixel art ni agentes que no existan. Los roles reales son Planner (Opus) y Builder (Sonnet/modelo del momento); Verifier y Deploy siguen siendo estados derivados, no procesos con heartbeat propio.

## 1. Tabla `orch_presence` (Supabase, control plane)

Crear (o confirmar si ya está prevista en `dashboard/schema.sql`):

```sql
create table if not exists orch_presence (
  role           text primary key,        -- 'planner' | 'builder'
  model          text,                    -- 'Opus' | 'Sonnet' | 'DeepSeek' ...
  state          text,                    -- idle | planning | building | verifying | deploying | blocked
  feature_id     text,
  step_no        int,
  detail         text,                    -- descripción corta del step actual
  last_heartbeat timestamptz default now(),
  updated_at     timestamptz default now()
);
alter table orch_presence enable row level security;
create policy "anon read presence" on orch_presence for select to anon using (true);
-- escribe solo el runner con service_role (bypassa RLS). Sin insert/update para anon.
```

Mantener el estilo del `schema.sql` existente (prefijo `orch_`, RLS anon-read).

## 2. Emisión del heartbeat (orquestador)

En el loop (`orchestrator/src` — probablemente `index.ts` para transiciones de step y `sync.ts` para el latido periódico):

- **Latido periódico:** mientras el proceso del loop está vivo, upsert de `last_heartbeat = now()` para el rol activo en cada tick del sync (~5s). Esto es lo que permite detectar un cuelgue: si el proceso muere, el heartbeat deja de actualizarse.
- **Transiciones de estado:** al arrancar el Planner → upsert `{role:'planner', model:'Opus', state:'planning', feature_id}`. Al ejecutar un step → `{role:'builder', model:<modelo del builder>, state:'building', feature_id, step_no, detail:<descripcion>}`. En verify/deploy/blocked → actualizar `state` del rol que corresponda.
- **Reposo:** cuando no hay run activo, marcar los roles en `state:'idle'` (el heartbeat sigue latiendo si el proceso vive).
- Reusar la lógica que hoy vive en `derivePosta` como la **fuente** de qué estado emitir — pero ahora la calcula el orquestador (que conoce la verdad) y la persiste, en vez de que la adivine la UI.

## 3. Dashboard: leer presencia real

En `dashboard/index.html`:

- Agregar `orch_presence` al `Promise.all` del `refresh()`.
- El **roster** pasa a leer `orch_presence` como fuente de verdad de estado + modelo por rol, en lugar de inferir todo con `derivePosta`. (Podés conservar `derivePosta` como fallback si `orch_presence` está vacía, para no romper si el runner viejo todavía no emite.)
- **Liveness honesta (clave):** calcular `staleSegundos = now - last_heartbeat`. Si supera un umbral (ej. **> 30s**), el agente se muestra como **"sin señal"** (punto en gris/coral, sin animación de pulso) en lugar de "en curso". Si supera un umbral mayor (ej. > 2 min) y había un run activo, mostrarlo como posible cuelgue. Esto implementa la Decisión 03 del manifiesto: el roster debe distinguir "trabajando" de "colgado".
- Mostrar el **modelo** que corre cada rol activo (deja listo el "Builder·DeepSeek" de S-014).
- Mantener todo lo demás del rediseño Operaciones intacto (hero, feed de deltas, utilidades, mode-bar).

## 4. Memoria del sistema (CONVENTIONS §1 y §2)

- `BACKLOG.md`: marcar S-015 ✅ con fecha y (Claude Code).
- `PROGRESS.md`: append con commit sha.
- `DECISIONS.md`: ADR si tomás una decisión no trivial (ej. el umbral de staleness, o reemplazar inferencia por presencia). Origen probable: `Supuesto del agente` para los umbrales; documentalo para que Augusto los pueda auditar/ajustar.
- `dashboard/schema.sql`: incluir la tabla nueva.

## Restricciones

- No personalidad, frases, pixel art ni agentes ficticios. Presencia real solamente.
- Single-file en el dashboard (no partir el HTML).
- No tocar la lógica de negocio del loop (planner/executor/verifier) más allá de emitir presencia.
- No redeployes el dashboard sin OK de Augusto; si el push dispara Vercel, avisalo.
- Veredicto en castellano: commit sha(s), cómo quedó el umbral de staleness, y si el runner viejo necesita reiniciarse para empezar a emitir heartbeats.
