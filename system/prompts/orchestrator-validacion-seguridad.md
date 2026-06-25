# Prompt para Claude Code — Validación de seguridad del orquestador

> Pegá este documento en Claude Code (Sonnet) dentro del repo de Spensiv, en `orchestrator/`.
> NO implementa nada nuevo: corre las pruebas de seguridad del scaffold y devuelve un veredicto
> en castellano. Augusto es PM, no va a leer código: tu salida final debe ser la tabla de la sección
> "Reporte" con PASÓ / FALLÓ y una frase por fila.

## Qué tenés que verificar

Corré estas pruebas de forma real (ejecutándolas, no leyendo el código), arreglá lo que esté roto, y reportá el resultado.

1. **Guardrail de migraciones.** Simulá que el loop intenta correr `prisma migrate dev`. Confirmá que (a) el hook `pre-tool-use.sh` lo bloquea y (b) lo registra en `blocked.log`. Repetí con `vercel deploy` y con un `git push` a `main`. Las dos capas (settings.json y hook) deben frenar.

2. **Resume ante corte de tokens.** Mockeá la respuesta de `claude` con un error de usage-limit. Confirmá que `limits.ts` escribe `pausedUntil` en STATE.json, NO crashea, y queda esperando para reanudar. Después matá el proceso a mitad de un paso y confirmá que al reiniciar saltea los pasos `done` y retoma el primero pendiente.

3. **Verifier obligatorio.** Inyectá un type error en un archivo de prueba. Confirmá que el verifier (`typecheck → lint → test`) bloquea el commit y devuelve el error. Sacá el type error después.

4. **QA gate con server vivo.** Confirmá que `qa.ts` sabe levantar el target (`next dev` en puerto efímero o preview de Vercel) ANTES de correr los asserts. Si no hay server vivo, el gate no debe pasar en falso: debe fallar avisando que no encontró target. Verificá que el assert de "vista de prestatario nunca muestra la TNA/tasa" efectivamente corre contra una página real.

5. **Consistencia de package manager.** El arranque usa `npm` pero el verifier llama `pnpm`. Unificá a uno solo (preferí `pnpm`, que es lo que usa Spensiv) o asegurate de que ambos estén disponibles. Que no haya sorpresas de "command not found".

6. **`claude` en PATH.** Confirmá que `claude --version` responde desde donde corre el orquestador. Si no, dejá anotado el paso para que Augusto lo configure.

## Reporte (tu salida final, en castellano, sin jerga)

| # | Chequeo | Resultado | Nota |
|---|---------|-----------|------|
| 1 | Bloqueo de migraciones / deploy / push a main | PASÓ / FALLÓ | ... |
| 2 | Reanuda solo tras corte de tokens / reinicio | PASÓ / FALLÓ | ... |
| 3 | Verifier frena código con errores | PASÓ / FALLÓ | ... |
| 4 | QA mira una página real (no pasa en falso) | PASÓ / FALLÓ | ... |
| 5 | Package manager unificado | PASÓ / FALLÓ | ... |
| 6 | `claude` accesible en PATH | PASÓ / FALLÓ | ... |

Cerrá con una sola línea: **"Listo para correr F-0001 atendido"** o **"NO arrancar todavía: falta X"**.
