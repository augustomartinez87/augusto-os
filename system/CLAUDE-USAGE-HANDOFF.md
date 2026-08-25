# Handoff — cuadro "Claude · uso" en el dashboard (S-048)

Contexto para retomar en una sesión nueva. Réplica del patrón del Scout DeepSeek (S-034,
`system/SCOUT-KGL-HANDOFF.md`), pero para el % de uso del plan de Claude en vez del saldo.

## Qué muestra

Dos barras en el dashboard, junto al card "Scout · DeepSeek": % de uso de la sesión actual
(ventana de 5h) y % de uso semanal, con la hora de reset de cada una. NO es gasto en USD —
eso es lo que muestra el card de DeepSeek; acá no aplica porque Claude se paga por plan, no
por token consumido vía esta cuenta.

## Por qué así (investigación previa a esta implementación)

No existe una API pública para `%` de sesión/semana:

- `claude.ai/api/organizations/{org}/usage` existe pero está detrás de un challenge de
  Cloudflare — no es una ruta viable pegándole directo con el token OAuth.
- El Rate Limits API / Usage and Cost API oficiales (docs.claude.com) son para consumo de
  la API de desarrollador (Console, pago por token) vía Admin API key — las cuentas
  individuales Free/Pro/Max ni siquiera pueden generar esa key.
- Hay un issue abierto pidiendo `claude usage --json` (anthropics/claude-code #48660),
  todavía no existe.

La vía oficial que sí existe: el hook `statusLine` de Claude Code. Se configura en
`~/.claude/settings.json` apuntando a un comando; Claude Code le pasa por stdin un JSON en
cada turno que, desde la versión 1.2.80, incluye:

```json
"rate_limits": {
  "five_hour": { "used_percentage": 49, "resets_at": 1756000000 },
  "seven_day": { "used_percentage": 17, "resets_at": 1756400000 }
}
```

`five_hour` = sesión actual, `seven_day` = límite semanal, `resets_at` en Unix timestamp.
Mismo enfoque que usan Claude-Code-Usage-Monitor / ccusage — no scraping, no endpoint no
documentado.

## Pipeline implementado

```
Claude Code (CUALQUIER sesión, cualquier repo, en esta máquina)
  → hook statusLine → system/claude-usage-statusline.mjs
    → escribe system/claude-usage-status.local.json (gitignored, snapshot del último turno)
  → orch-sync (orchestrator/src/sync.ts, pushClaudeUsageStatus, corre cada 5s)
    → lee ese JSON y hace upsert a Supabase (orch_claude_usage, fila única id=1)
  → dashboard/index.html (renderClaudeUsageStatus)
    → lee orch_claude_usage y pinta las dos barras
```

Archivos tocados / nuevos:

- `system/claude-usage-statusline.mjs` — el hook. Nuevo.
- `dashboard/schema.sql` — tabla `orch_claude_usage`. Ya aplicada en Supabase
  (proyecto `exyhnrynpuflbuprmdto`, el mismo del control plane) vía migración
  `s048_orch_claude_usage`.
- `orchestrator/src/sync.ts` — `pushClaudeUsageStatus()`, llamada en `tick()` junto a
  `pushDeepSeekBalance()`.
- `dashboard/index.html` — CSS `.usage-row/.usage-label/.usage-pct`, el card
  `#claudeUsageStatus`, `renderClaudeUsageStatus()`, y el fetch de `orch_claude_usage` en
  `refresh()`.
- `.gitignore` — ignora `system/claude-usage-status.local.json`.

## Lo único que falta — configurar el hook a mano

No se pudo tocar `~/.claude/settings.json` desde acá (carpeta protegida, fuera de
`Proyectos/`). Augusto tiene que agregar esto a mano en
`C:\Users\Augusto\.claude\settings.json` (si el archivo no existe, crearlo con este
contenido; si ya existe con otras keys —permissions, hooks, etc.— agregar solo la key
`statusLine` sin tocar el resto):

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"C:\\Users\\Augusto\\Downloads\\Proyectos\\augusto-os\\system\\claude-usage-statusline.mjs\""
  }
}
```

Después de guardar, abrir cualquier sesión de Claude Code (en cualquier repo) y esperar un
turno — la barra de abajo debería mostrar algo como `Sonnet 4.5 · augusto-os · sesión 49% ·
semana 17%`, y `system/claude-usage-status.local.json` debería aparecer con esos datos.

## Deploy pendiente

El dashboard vivo está en Vercel, deployado a mano (drag & drop de la carpeta `dashboard/`,
no hay `.vercel/` local ni conexión a git — ver `dashboard/RUNBOOK.md` paso 7). Este cambio
de `index.html` no se ve en el celu hasta que se redeployee esa carpeta.

## Estado al implementarlo (2026-08-25)

- Tabla `orch_claude_usage` creada y con RLS (`anon` solo lectura) — verificado con
  `list_tables` sobre el proyecto Supabase real.
- Código de `sync.ts` y `index.html` escrito y revisado a mano contra el patrón exacto del
  Scout DeepSeek (mismos nombres de función, mismo estilo de comentarios, mismas clases CSS
  reusadas donde tenía sentido).
- **No probado en corrida real todavía** — falta que Augusto configure el statusLine, use
  Claude Code un turno, y confirme que `npm run sync` (ya corriendo vía pm2 según
  `ecosystem.config.cjs`) efectivamente sube la fila y el dashboard la pinta. Si el shape
  exacto del JSON de `rate_limits` cambió entre versiones de Claude Code, ajustar el
  parseo en `claude-usage-statusline.mjs` (está aislado ahí, no toca el resto del pipeline).
