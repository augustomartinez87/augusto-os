# Runbook — augusto-os

Guía operativa para lo que hay que correr manualmente vs. lo que ya queda corriendo solo.

---

## 1. `orch-sync` corre en background con pm2 — ya no hace falta una cmd abierta

`orchestrator/src/sync.ts` (el que espeja el estado del loop a Supabase cada 5s y hace de watcher de ideas/autopilot) corre como proceso administrado por **pm2**, no como una ventana de cmd manual. Arranca solo al loguearte en Windows, no tiene ventana visible, y sobrevive a reinicios.

- Definido en `orchestrator/ecosystem.config.cjs`, proceso registrado como `orch-sync`.
- pm2 invoca `node` directo con los flags `--require tsx/dist/preflight.cjs --import tsx/dist/loader.mjs --env-file=.env` sobre `src/sync.ts` — el mismo mecanismo que usa `tsx` internamente, pero sin pasar por `node_modules/tsx/dist/cli.mjs` ni por `npm run sync`. Ver nota en §4 sobre por qué (evita tanto el shim roto de `npm.cmd` como una ventana de consola fantasma que abría `cli.mjs`).
- `windowsHide: true` en el ecosystem file evita que se abra una consola visible para el proceso.
- pm2 arranca solo al login vía una entrada en `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` (instalada por `pm2-windows-startup`), que corre `pm2 resurrect` para levantar la lista de procesos guardada con `pm2 save`.

### Chequear que sync está vivo

```
pm2 status
```

Buscá la fila `orch-sync` con `status = online` y `↺` (restart count) bajo/estable. Si `↺` sube constantemente, algo está crasheando en loop — ver logs.

```
pm2 logs orch-sync --lines 20 --nostream
```

Sync solo loguea cuando pasa algo (idea nueva desde la web, cambio en OPERATOR_STATE, cleanup de filas viejas) — no hay un heartbeat cada 5s en el log, así que verlo "silencioso" un rato es normal. Lo que importa es `status = online` y sin errores nuevos en `orch-sync-error.log`.

### Reiniciar sync (si cambia sync.ts o hay que refrescar el proceso)

**No usar `pm2 restart orch-sync`.** Tiene un bug conocido en pm2 en Windows donde ignora o invierte el `windowsHide` guardado, y el proceso reaparece con consola visible. Usar siempre delete + start:

```
pm2 delete orch-sync
pm2 start ecosystem.config.cjs
pm2 save
```

El `pm2 save` al final es obligatorio — sin eso, el `resurrect` del próximo login vuelve a levantar la versión vieja guardada (potencialmente sin `windowsHide` aplicado bien) en vez de la que acabás de arrancar. Esto aplica siempre que cambies algo en `ecosystem.config.cjs` (rutas, args, flags como `windowsHide`), no solo cuando cambia `sync.ts`.

---

## 2. Único comando manual que queda: arrancar una feature

Con sync corriendo solo en background, lo único que hay que tipear a mano es:

```
npm start <featureId>
```

(desde `orchestrator/`, dispara `index.ts` que corre el loop/autopilot para esa feature). Sync y el resto de la infraestructura de background ya están arriba sin intervención.

---

## 3. Si pm2 mismo se cae o hay que reinstalar

pm2 y `pm2-windows-startup` están instalados global (`npm install -g pm2 pm2-windows-startup`). Si por algún motivo el daemon de pm2 no está corriendo:

```
pm2 resurrect
```

levanta lo último guardado con `pm2 save` (incluye `orch-sync`). Si hace falta reinstalar el arranque automático:

```
pm2-startup install
```

Para desinstalar el autoarranque (por ejemplo, para debug manual):

```
pm2-startup uninstall
```

---

## 4. Por qué `ecosystem.config.cjs` no usa `npm run sync` ni `tsx` directo

`pm2 start npm --name orch-sync -- run sync` (la forma "de libro" con `npm run <script>`) **no funciona en este entorno**: pm2 resuelve `npm` a `npm.cmd`, y en Windows `child_process.spawn` no puede ejecutar `.cmd` directamente sin `shell: true` — pm2 sin esa opción tira `spawn EINVAL`, o si se fuerza `interpreter: node` intenta parsear el `.cmd` como JS y explota con `SyntaxError`.

El siguiente intento, apuntar `node` directo a `node_modules/tsx/dist/cli.mjs` (el entry point que usa `tsx.cmd`), tampoco sirve: `cli.mjs` internamente vuelve a spawnear un **segundo** proceso `node` (con `--require preflight.cjs --import loader.mjs`) vía `child_process.spawn`, y ese spawn interno **no pasa `windowsHide`** — abre una consola visible sin que pm2 tenga forma de evitarlo (pm2 solo controla `windowsHide` del proceso que él mismo lanza, no de los hijos que ese proceso decida spawnear por su cuenta). Encima, si el wrapper externo (`cli.mjs`) muere o pm2 lo reinicia, el hijo interno puede quedar huérfano corriendo con su ventana, y cada reinicio del wrapper abre una ventana nueva.

La solución: `ecosystem.config.cjs` arma a mano los mismos flags que `cli.mjs` le pasaría a su hijo (`--require .../tsx/dist/preflight.cjs --import file:///.../tsx/dist/loader.mjs --env-file=.env`) y hace que **pm2 spawnee ese proceso directo**, sin wrapper de por medio. Así `windowsHide: true` aplica al único proceso que corre `sync.ts`, y no hay re-exec interno que se escape del control de pm2.

Si el script `sync` en `package.json` cambia (por ejemplo, agregan flags nuevos), hay que reflejar el cambio a mano en `interpreter_args`/`args` de `ecosystem.config.cjs` — no hay sincronización automática con `package.json`.

---

## 5. Archivos truncados / `.git/index.lock` atascado en CUALQUIER repo target (no solo augusto-os)

Síntoma: `npx tsc --noEmit` tira errores de sintaxis raros (JSX sin cerrar, string sin terminar) en archivos que una sesión de Claude Code acababa de tocar y commitear bien. Causa conocida (S-042, incidente real 2026-07-15 en `kredy`): una escritura de archivo quedó interrumpida a mitad de camino — visto cuando 2 sesiones de Claude Code CLI corren en paralelo sobre el mismo repo fuera del loop (`npm start` nunca las serializa porque no pasan por `index.ts`/`acquireRunLock` de S-041, que solo cubre runs del orquestador). El `.git/index.lock` que suele quedar al lado puede estar huérfano (el proceso que lo creó ya murió) — no asumas que hay que matar algo antes de borrarlo, confirmá primero.

**Diagnóstico:**
1. `pm2 status` — confirmar que `orch-sync` está `online` sin reinicios recientes (si tiene ↺ alto, investigar aparte, no es esto).
2. `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select-Object ProcessId, CommandLine | Format-List` — mirar `CommandLine` (no `Path`, que solo da el ejecutable) para ver a qué repo/script apunta cada proceso. Si algo con `git.exe` en el nombre aparece vivo y apuntando al repo afectado, matalo (`Stop-Process -Id <id> -Force`) antes de seguir.
3. En el repo afectado: `git diff HEAD -- <archivo sospechoso>` — si el diff muestra SOLO líneas borradas (nunca agregadas, o solo fragmentos de línea sueltos al final), es truncación pura y es seguro descartar el working tree de ese archivo. Si aparece contenido nuevo real mezclado, parar y no tocar — no es este bug.

**Recuperación (solo si el diff confirma truncación pura):**
```
Remove-Item .git\index.lock -Force
git checkout HEAD -- <archivo1> <archivo2> ...
git status
npx tsc --noEmit
```
El último commit tiene el contenido completo (es lo que Claude Code typecheckeó antes de commitear) — restaurar desde ahí no pierde nada real.

**No corras 2 sesiones de Claude Code CLI en paralelo sobre el mismo repo target.** No hay enforcement técnico de esto todavía (ver S-042) — es disciplina manual por ahora.
