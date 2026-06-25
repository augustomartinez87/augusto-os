# Prompt para Claude Code — Fase 0: arreglar el Builder

> Pegá esto en Claude Code (Sonnet) dentro de `orchestrator/`.
> Objetivo ÚNICO de Fase 0: que **un step corra solo de punta a punta** (eliminar el copy/paste).
> No agregues memoria nueva, estados operativos ni nada de fases posteriores. Solo los 3 fixes.
> Augusto es Product Owner: tu salida final es un veredicto en castellano, no un volcado técnico.

## Contexto del fallo

En la primera corrida de F-0001, el ejecutor (`executor.ts` invocando `claude` headless) salió con código 1 en cada intento, agotó los 3 reintentos y disparó el gate humano. El detalle del gate listaba tools de Supabase MCP (`list_tables`, `apply_migration`, `execute_sql`, etc.). Hipótesis: el Builder intentó leer el schema desde la DB de producción vía Supabase MCP, se lo bloqueamos bien, y sin eso no pudo seguir. Pero no sabemos con certeza porque no se logueó la salida de `claude`.

## Fix 1 — Dejar de estar ciegos (hacelo primero)

En `executor.ts`, capturar `stdout` y `stderr` de la invocación de `claude` y:
- escribirlos completos a un archivo por step: `orchestrator/logs/<featureId>-step<N>.log`,
- ante salida ≠ 0, imprimir las últimas ~20 líneas a consola con prefijo `[executor:error]`.

Sin esto, cualquier otro fix es a ciegas.

## Fix 2 — El Builder no toca infra viva

El Builder no necesita la DB para escribir código; necesita el **schema del repo**. Dos cambios:

1. **Restringir las tools del ejecutor headless:** correr `claude` SIN el MCP de Supabase (ni ningún MCP de infra: Vercel, etc.). Dejar solo filesystem/edición del repo y bash acotado. Usá el mecanismo vigente de Claude Code para esto (confirmá el flag actual: restringir MCP config / allowed-disallowed tools) y **verificá en el log que las tools de Supabase ya no están disponibles** en la sesión.
2. **Instrucción al Builder en su prompt:** para conocer modelos/tablas debe leer `prisma/schema.prisma` del repo target, NUNCA consultar la DB en vivo. (Recordatorio de seguridad: el `DATABASE_URL` local apunta a producción.)
3. Confirmar que el ejecutor corre con `cwd` = repo de Spensiv (el target), en modo no-interactivo (`-p`/print), con permisos resueltos por el `.claude/settings.json` ya existente, sin quedar esperando prompts de permiso.

## Fix 3 — Coherencia npm/tsx en el gate

El mensaje de aprobación del gate todavía dice `pnpm --filter spensiv-orchestrator approve` (pnpm no está instalado). 
- Unificar todo a `npm`/`tsx`.
- Crear un comando de aprobación que funcione de verdad: `npm run approve <featureId>` (o `tsx src/approve.ts <featureId>`) que limpie `needsHumanApproval` en STATE.json y permita reanudar.
- Actualizar el texto del gate para que muestre ese comando correcto.

## Verificación final (re-correr F-0001)

1. Corré `npm start F-0001`.
2. F-0001 debe completar los 4 pasos **sin intervención humana**, dejar una branch con el helper `getLatestApScore` + el badge, y el verifier en verde.
3. Si vuelve a frenar, leé el log nuevo (Fix 1) y arreglá la causa raíz real antes de reportar.

## Tu salida (en castellano, PM-readable)

Cerrá con UNA de estas dos líneas:
- **"✅ F-0001 corrió solo de punta a punta. Copy/paste eliminado. Branch: <nombre>."**
- **"⛔ Sigue trabado en: <causa raíz concreta del log>. Próximo fix sugerido: <una línea>."**

Nada de Fase 1 todavía (memoria, estados, augusto-os). Eso viene después, recién cuando esto esté verde.
