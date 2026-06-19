# Modelo Operativo — augusto-os

## El loop como unidad de trabajo

El sistema opera en **loops, no en sesiones**. Un loop tiene:
1. **Leer contexto**: OPERATOR_STATE.yaml, ROADMAP.md, BACKLOG.md, STATE.json.
2. **Ejecutar trabajo**: planificar → construir → verificar → checkpoint.
3. **Actualizar memoria**: PROGRESS.md, DECISIONS.md, STATE.json.
4. **Proponer o pausar**: si necesita input humano, registra y espera. No bloquea indefinidamente.

## Roles ≠ Modelos

Los roles son **responsabilidades**, no instancias de modelo. La misma responsabilidad puede ejecutarla cualquier modelo capaz:

| Rol | Responsabilidad | Modelo actual |
|-----|-----------------|---------------|
| Planner | Descomponer spec en pasos atómicos | Opus 4.8 |
| Builder | Escribir código que pasa verifier | Sonnet 4.6 |
| Reviewer | Verificar corrección, riesgos, convenciones | (Fase 1b) |
| Tester | Escribir y correr tests | (futuro) |
| Docs | Mantener documentación actualizada | (futuro) |
| Product Analyst | Proponer ítems de backlog desde uso real | (futuro) |

Cambiar el modelo de un rol es un cambio de configuración, no de arquitectura.

## Validación por evidencia objetiva

Un paso está **done** cuando:
1. Typecheck pasa (`npx tsc --noEmit`)
2. Lint pasa
3. Tests pasan (si existen; si no hay, warning y continúa)
4. Para pasos de UI: screenshot sin errores JS en consola, invariantes de negocio verificados

El "se ve bien" es validación del PO (Claude in Chrome sobre el PR), no del sistema.

## Memoria persistente fuera del modelo

El estado no vive en la ventana de contexto. Vive en archivos:
- `STATE.json`: estado de la corrida actual (qué paso, qué commit, retries)
- `PROGRESS.md`: log append-only de features completados
- `DECISIONS.md`: decisiones de diseño no obvias
- `BACKLOG.md`: trabajo pendiente priorizado
- `ROADMAP.md`: fases del sistema con estado actual

Ante un corte de tokens o reinicio: el loop lee STATE.json y reanuda donde estaba.

## Estados operativos

El PO cambia el estado desde el celular editando `OPERATOR_STATE.yaml`:

- **PRODUCT**: modo creación. El sistema puede hacer preguntas abiertas al PO.
- **OFFICE**: modo trabajo acotado. Solo preguntas Sí/No o A/B/C.
- **SLEEP**: modo nocturno. El sistema no bloquea, registra pendientes y sigue. Ideal para loops de refactor/docs/tests que no necesitan input.

*Nota: en Fase 1 el loop lee el estado y lo loguea. El gating por estado se implementa en Fase 2.*

## Economía de tokens

- **Valor por token**: cada invocación debe generar valor verificable. No hay llamadas de "calentamiento" ni loops sin evidencia de salida.
- **Reserva estratégica**: nunca consumir el 100% de la ventana de uso diaria. Los loops nocturnos (Fase 4) respetan la reserva para emergencias del PO.
- **Costo de contexto**: prompts grandes = tokens caros. La memoria persistente permite prompts cortos con contexto relevante, no transcripts completos.

## Guardrails de producción

La DB local de Spensiv apunta a producción. El sistema tiene dos capas de bloqueo (ninguna se puede omitir):
1. **`permissions.deny` en settings.json**: capa declarativa (soft, bypaseable por `--dangerously-skip-permissions`).
2. **`pre-tool-use.sh` hook**: capa de shell (hard, NO se bypasea con `--dangerously-skip-permissions`). Esta es la capa load-bearing.

Ante cualquier cambio en cómo se invoca `claude`, se re-testean ambas capas.
