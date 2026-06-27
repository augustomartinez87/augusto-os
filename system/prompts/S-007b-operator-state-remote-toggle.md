Fast-follow de S-007/S-002: control remoto del modo operativo (`OPERATOR_STATE.yaml`) desde el dashboard web. Hoy el modo solo se cambia editando el archivo a mano en la máquina de Augusto — el objetivo es que pueda tocar "SLEEP" desde el celu antes de salir y que el runner lo respete en el siguiente tick.

## Contexto (leé antes de tocar nada)
- `orchestrator/src/operator-state.ts` (S-002, ya en main) — `getOperatorState(statePath?)` lee `system/OPERATOR_STATE.yaml`, valida `mode` (PRODUCT/OFFICE/SLEEP) y `response_style` (normal/short), fail-safe a PRODUCT/normal. NO cambies su firma ni su comportamiento de lectura local — sigue siendo la fuente de verdad que lee `index.ts` y `telegram.ts`.
- `orchestrator/src/sync.ts` (S-007 Fase A) — proceso que corre cada 5s (`npm run sync`), espeja STATE.json/BACKLOG.md a Supabase y ya tiene un canal dashboard→runner: `pullWebIdeas()` (línea ~66) lee `orch_ideas` con `source=eq.web` y las vuelca a `FEATURE-INTAKE.md`. Vas a agregar un canal análogo para el modo operativo, mismo patrón (`rest('GET', ...)` con fetch nativo, sin librerías nuevas).
- `dashboard/index.html` — single-file estático, ya tiene 3 tabs (Loop/Backlog/Ideas) y un client de `@supabase/supabase-js` ya inicializado (`db`). Vas a agregar un control de modo, sin tab nueva (cabe arriba, cerca del header `<div class="top">`, ver punto 3).
- `dashboard/schema.sql` — tablas `orch_runs/orch_steps/orch_logs/orch_ideas/orch_backlog`, todas con RLS: anon puede `select` en todas e `insert` solo en `orch_ideas`.

## Qué construir

### 1. Schema — `dashboard/schema.sql`
Agregá una tabla de una sola fila:
```sql
create table if not exists orch_operator_state (
  id              int primary key default 1,
  mode            text not null default 'PRODUCT',   -- PRODUCT | OFFICE | SLEEP
  response_style  text not null default 'normal',     -- normal | short
  updated_at      timestamptz default now(),
  constraint single_row check (id = 1)
);
insert into orch_operator_state (id, mode, response_style) values (1, 'PRODUCT', 'normal')
  on conflict (id) do nothing;

alter table orch_operator_state enable row level security;
create policy "anon read operator_state"   on orch_operator_state for select to anon using (true);
create policy "anon update operator_state" on orch_operator_state for update to anon using (id = 1) with check (id = 1);
```
Anon puede leer y actualizar (NO insertar ni borrar — es una fila fija). Agregá esto al final del archivo, no reescribas las tablas existentes.

### 2. `orchestrator/src/sync.ts` — pull remoto → YAML local
Nueva función `pullOperatorState()`, mismo estilo que `pullWebIdeas()`:
- `GET orch_operator_state?id=eq.1&select=mode,response_style,updated_at`.
- Si el `mode`/`response_style` remoto difiere del que hay hoy en `system/OPERATOR_STATE.yaml`, reescribí el YAML local preservando el formato/comentarios existentes lo más posible (mínimo: si no es viable preservar comentarios al reescribir con un YAML serializer, mantené al menos las 3 líneas de comentario de cabecera que ya existen en el archivo, hardcodeadas en el template de escritura — no las pierdas).
- Guardá el último `updated_at` visto en una variable de módulo (mismo patrón que `seenIdeas`/`logOffset`) para no rescribir el archivo en cada tick si no cambió nada.
- Llamala desde `tick()`, junto a `pullWebIdeas()`.
- Si `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` no están configurados, todo esto es no-op (mismo guard que ya tiene `run()`).

### 3. `dashboard/index.html` — selector de modo
- Agregá un control compacto cerca del header (`<div class="top">`), NO un tab nuevo: 3 botones/chips "PRODUCT" / "OFFICE" / "SLEEP" en una fila, el activo resaltado con `var(--teal)` (mismo lenguaje visual que `.tab.on`).
- Al tocar uno, `UPDATE orch_operator_state SET mode = '<X>', updated_at = now() WHERE id = 1` vía el client de supabase-js ya inicializado (`db.from('orch_operator_state').update({mode: X, updated_at: new Date().toISOString()}).eq('id', 1)`).
- En `refresh()` (el polling de 5s que ya existe), agregá la lectura de `orch_operator_state` al `Promise.all` existente y actualizá qué botón aparece activo — así si cambiás el modo desde otro dispositivo se refleja en todos.
- No agregues `response_style` a la UI todavía (mantenelo en el schema para más adelante, pero el control visual de esta entrega es solo mode). Si querés, un toggle chiquito aparte para normal/short está bien, pero NO es obligatorio — priorizá que el de mode quede sólido.
- Mensaje de confirmación visual breve tras el update (ej. el chip activo cambia de inmediato, optimista, y se corrige en el próximo refresh si falló).

## Restricciones
- NO toques `operator-state.ts` (la lectura local sigue igual, sync.ts es el único puente).
- NO le agregues a `anon` permiso de `insert`/`delete` en `orch_operator_state` — solo `select`/`update` sobre la fila fija `id=1`.
- NO toques el polling existente de `refresh()` más de lo necesario para sumar esta lectura.
- Sin dependencias nuevas.

## Entrega
- Branch `feature/s007b-operator-state-toggle`, sin push ni merge.
- Pegame el SQL del punto 1 aparte en tu respuesta (yo lo corro a mano en el SQL editor de Supabase — el loop no tiene acceso directo a esa consola).
- Mostrame el diff de `sync.ts` y de la parte nueva de `index.html`.
- Typecheck + tests del orchestrator en verde (el dashboard no tiene test suite, está bien).
