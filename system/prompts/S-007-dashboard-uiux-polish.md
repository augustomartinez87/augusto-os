Polish visual del dashboard de augusto-os. Archivo único: `dashboard/index.html` (HTML+CSS+JS inline, sin build step, deploy estático en Vercel). No tocar `schema.sql` ni el runner (`orchestrator/src/sync.ts`) — toda la data que se necesita ya está disponible vía las queries existentes a `orch_backlog`, `orch_runs`, `orch_steps`, `orch_logs`, `orch_ideas`.

Contexto de diseño (no romper esto):
- Paleta NEXO-inspired ya fijada: fondo `#0A0A0E`, card `#14141B`, teal `#2FD4CD`, coral `#E5616A`, amber `#E0A23B`. Mantenerla.
- Mobile-first, single column, max-width 780px. El dashboard se abre desde el celu.
- Polling cada 5s vía Supabase JS client, ya implementado en `refresh()`. No migrar a realtime (fast-follow separado, no en este scope).

Cambios a implementar (los 4, ninguno requiere schema nuevo):

1. **Loading skeleton en vez de "cargando…"/"conectando…" en texto plano.** Mientras `refresh()` no resolvió la primera vez, mostrar placeholders con un pulso sutil (CSS `@keyframes` opacity 0.4↔0.8, sin librerías) en los contenedores `#now`, `#backlog`, `#ideas`, `#log` — 2-3 barras grises del alto aproximado del contenido real. Reemplazar solo el estado inicial, no tocar la lógica de refresh.

2. **Barra de progreso por proyecto en el tab Backlog.** Cada `.bgrp` (Sistema/Kredy/Spensiv/Argos) ya cuenta items pendientes (`rows.length`) pero no contexto de cuántos hay totales ni cuántos done. En el `<h3>` de cada grupo, calcular sobre TODOS los items de `bl.data` (no solo los filtrados por `blTag`) el % con `state` que matchea `done` o `priority === "✅"`, y agregar una mini barra horizontal (4px alto, fondo `var(--line)`, relleno `var(--teal)` al %) debajo del header del grupo, con el texto "`X/Y done`" en `.sub` style. No cambiar el filtro `blTag` existente que decide qué filas individuales se listan.

3. **Consistencia de badges y contraste.** Revisar que todos los badges (`.b-now`, `.b-done`, `.b-hold`, `.b-p1`) tengan el mismo padding/radius/font-size — ya están definidos en CSS, pero confirmar que `runBadge()` y `blTag()` los usan consistentemente (hoy `b-done` se usa tanto para "done" como fallback de prioridad "P·", lo cual está bien, no cambiar la semántica, solo confirmar que el contraste de texto sobre cada color de fondo cumple legibilidad en pantalla de celu con luz solar — si `--mut` (#8A8A99) sobre `b-done` background se ve muy bajo contraste, subir levemente la opacity del background de `.b-done` de .18 a .22).

4. **Timestamps relativos en log e ideas.** Hoy `ideas` usa `new Date(i.created_at).toLocaleString()` (fecha+hora completa, ruidoso en mobile). Cambiar a formato relativo simple en español ("hace 2 min", "hace 3 h", "hace 1 d") con una función helper `timeAgo(iso)` sin librerías externas. Aplicar también a cualquier timestamp visible en el tab Loop si lo hay.

Restricciones:
- No agregar dependencias nuevas (nada de npm, nada de CDN salvo el `@supabase/supabase-js` que ya está).
- No tocar las constantes `SUPABASE_URL`/`SUPABASE_ANON_KEY` ni la lógica de `sendIdea()`.
- No cambiar la estructura de tabs ni agregar tabs nuevos (eso es S-015/S-016, fuera de este scope).
- Mantener el archivo como un único `index.html` autocontenido.

Entrega:
- Hacé los 4 cambios en una sola pasada sobre `dashboard/index.html`.
- Abrí el archivo en un browser local (o describime visualmente el resultado) y confirmame que no rompiste el polling ni el tab-switching.
- Trabajá en una branch `feature/s007-dashboard-polish`, NO hagas push ni merge — yo lo reviso después.
- Mostrame un diff resumido de qué cambiaste y por qué, sección por sección (los 4 puntos arriba).
