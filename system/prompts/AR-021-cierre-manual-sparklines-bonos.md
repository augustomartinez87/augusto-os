> Prompt para Claude Code. Repo: portfolio-tracker (Argos). Cierre MANUAL de F-0027/AR-021 — el loop automático (`npm start F-0027`) quedó trabado en step 1 por un choque de scoping del plan, no por un problema real de código. Retomamos fuera del loop, en la rama que ya existe.

## Contexto

El plan original partía F-0027 en 6 steps (step 1 = solo diagnóstico + helper, step 2 = conectarlo al fetch). El builder y después el fixer (Opus, vía escalación S-039) coincidieron en la causa raíz real: `data912` no tiene histórico para T15E7/TTD26 (letras/bonos CER cortos — responde 200 con `{"Error": ...}`, no un array). El fixer implementó el fix real (fallback a `getEodSeries`, ya usado por `PositionDetailModal.jsx` y `portfolioHistoryService.ts` para el mismo gap) directo en `useSparklines.js`, pero el reviewer lo rechazó por violar el límite "sin tocar aún el flujo de fetch" del step 1 — no por un defecto del fix en sí.

Verificado (Cowork, 2026-07-17): el diff de `useSparklines.js` sigue sin commitear en la rama `feat/F-0027-argos-sparklines-faltantes-para-bonos-en` (mismo commit base que `main`, sin historia propia). Reusa `getEodSeries` existente correctamente, no inventa cliente nuevo, respeta el rate limit de data912 (el fallback pega a Supabase, no a data912). Es un fix válido y mínimo.

## Qué falta para cumplir el spec completo (`features/F-0027.md`)

1. **`useSparklines.js`**: el diff ya está en el working tree de la rama — revisalo, confirmá que compila y tiene sentido, y si estás de acuerdo con el análisis de arriba, dejalo como está (no lo reescribas de cero).
2. **Falta el placeholder de alineación** (criterio de aceptación #2, nunca implementado): en `src/features/portfolio/components/MobilePositionsList.jsx`, líneas ~238 y ~370, hoy es `{spark && <MiniSpark data={spark} />}` — cuando `spark` es falsy no se renderiza nada, rompiendo la alineación de valuación/% entre filas con y sin sparkline. Agregá un placeholder invisible del mismo tamaño (`width=72 height=28`, los defaults de `MiniSpark`) para los dos casos, algo como `{spark ? <MiniSpark data={spark} /> : <div className="w-[72px] h-[28px]" />}` — ajustá a las clases/convención real del archivo, no asumas Tailwind si no es lo que usan ahí (revisá el resto del componente).
3. Confirmá que YPFD/MELI/GGAL (acciones/CEDEARs) siguen sin cambios de comportamiento.

## Pasos

1. `git checkout feat/F-0027-argos-sparklines-faltantes-para-bonos-en` (o quedate ahí si ya estás).
2. Confirmá `git status` — debería mostrar solo `useSparklines.js` modificado + el CSV viejo sin trackear (`positions_backup_20260714.csv`, no tocar, es de otra tarea).
3. Implementá el placeholder del punto 2 de arriba en `MobilePositionsList.jsx`.
4. `npx tsc --noEmit`, lint, tests — todo limpio.
5. Commit de TODO junto (el fix de `useSparklines.js` que ya estaba + el placeholder nuevo) en un solo commit prolijo, mensaje tipo `fix(sparklines): fallback EOD para bonos sin histórico + placeholder de alineación (AR-021)`.
6. Mergeá la rama a `main` y pusheá — el auto-deploy de Vercel toma el resto.
7. No toques `orchestrator/STATE.json` ni el estado del loop — este cierre es manual, fuera del loop; si el STATE.json de F-0027 sigue con el step 1 en `blocked`, dejalo así, no lo edites (evitamos otro round de STATE desincronizado).

## Restricciones clave (heredadas del spec original)

- Sparklines de FCI siguen excluidas (sin histórico en data912, exclusión deliberada).
- No cambiar tamaño/diseño del sparkline existente (eso es de F-0022, fuera de alcance).
- No persistir históricos en Supabase.
- Nada que escriba contra Supabase prod.

## Al terminar

Reportá el hash del commit final, confirmación de que T15E7/TTD26 ahora resuelven data (podés loguear en consola o un test rápido, no hace falta browser real), y que el placeholder no rompe nada visualmente obvio en el resto del componente.
