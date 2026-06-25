# Plan de Migración — del orquestador actual al Sistema Operativo de Augusto

> Propuesta. NO implementa nada todavía. Responde a: "adaptar el orquestador actual
> para alinearse con la visión (PO, loops, memoria, roles, estados operativos, economía de tokens)".
> Filtro de toda decisión: *¿esto me acerca a operar como Product Owner o me devuelve a coordinador técnico?*

---

## A. Dónde estás hoy vs. tu visión (honesto)

Lo que ya construimos (orquestador Tier 1) tiene buenos huesos y cubre más de lo que parece. Mapeo contra tus 15 principios:

| Principio tuyo | Estado actual | Veredicto |
|---|---|---|
| Loop como unidad de trabajo | `index.ts` es un loop real | ✅ ya está |
| Validación objetiva (tests/lint/build) | verifier typecheck→lint→test | ✅ fuerte |
| Memoria persistente | solo `STATE.json` (estado de una corrida) | 🟡 parcial: falta ROADMAP/BACKLOG/DECISIONS/PROGRESS y memoria cross-proyecto |
| Separación de roles | planner / builder / verifier existen como funciones | 🟡 parcial: falta Reviewer, Docs, Product Analyst |
| Roles ≠ modelos (intercambiabilidad) | el ejecutor está cableado a `claude` | ❌ viola tu principio 11–13 |
| Estados operativos PRODUCT/OFFICE/SLEEP | inexistente | ❌ |
| Economía de tokens / reserva estratégica | `limits.ts` maneja el corte, pero no prioriza por valor | ❌ |
| Backlog administrado por el sistema | inexistente | ❌ |
| Loops nocturnos / auto-detección de trabajo | inexistente | ❌ (y NO toca construirlo aún) |

Traducción: tenés Fase 1 (intentada) + media Fase 2 + validación sólida. Lo que falta es exactamente tus Fases 2–6. **No hay que rediseñar; hay que migrar por capas.**

## B. El bloqueo real ahora — Fase 1 no funciona

Nada de la filosofía importa hasta que **un solo step corra solo de punta a punta**. Eso es "eliminar el copy/paste". Hoy no pasa. Tres fixes puntuales (no es rediseño):

1. **Dejar de estar ciegos.** El orquestador debe capturar y loguear `stdout`/`stderr` de `claude`. "Salió con código 1" sin el output es inservible. Primer arreglo, siempre.
2. **El Builder no debe tocar infra viva.** Para escribir un helper de Prisma, el Builder tiene que leer `prisma/schema.prisma` del repo, NO consultar la DB de producción vía Supabase MCP. Hay que correr el ejecutor con un set de tools restringido (filesystem + repo, sin MCP de Supabase). Esto es a la vez un fix de correctitud y de seguridad (tu dev DB apunta a prod).
3. **Coherencia del gate.** El mensaje de aprobación todavía dice `pnpm` (no instalado). Unificar a `npm`/`tsx` en todo el flujo, incluido el comando `approve`.

**Criterio de salida de Fase 1:** F-0001 termina, deja una branch con el helper, verifier en verde, sin que vos toques nada. Cuando eso pase, ganaste lo que más te devuelve tiempo este mes.

## C. Migración por fases (alineada a tus propias fases)

- **Fase 0 — ahora:** los 3 fixes de la sección B. Objetivo único: un step autónomo. Nada más.
- **Fase 1 — memoria del sistema + seam rol↔modelo.** Crear los artefactos persistentes (`ROADMAP.md`, `BACKLOG.md`, `DECISIONS.md`, `PROGRESS.md`) que el loop lee al empezar y actualiza al terminar. En el mismo toque, meter una interfaz `runRole(role, prompt)` con un adapter de modelo, para que mañana un rol lo pueda ejecutar Kimi/GLM sin rediseñar. Barato si se hace al tocar `executor.ts`, carísimo si se deja para después.
- **Fase 2 — estados operativos.** `OPERATOR_STATE.yaml` (`mode: PRODUCT | OFFICE | SLEEP`) que cambiás desde el celular. Gobierna *cómo* el sistema te interrumpe: PRODUCT permite preguntas abiertas; OFFICE solo Sí/No o A/B/C; SLEEP no bloquea nunca, registra pendientes y sigue.
- **Fase 3 — backlog administrado.** El sistema toma `BACKLOG.md`, prioriza y propone qué hacer; vos aprobás prioridad Alta/Media/Baja.
- **Fase 4 — loops nocturnos.** Recién acá. Aprovechar SLEEP para refactors, tests, docs, propuestas. Con reserva estratégica de tokens (nunca el 100%).
- **Fase 5 — auto-detección de trabajo.** El sistema detecta deuda técnica, inconsistencias, oportunidades y las propone como ítems de backlog.

Regla transversal: cada fase debe terminar con el sistema funcionando y devolviéndote tiempo. Si una fase es "infra para infra", se saltea o se pospone.

## D. La única decisión que necesito de vos

**¿Dónde vive el sistema?** Mi recomendación: un repo separado `augusto-os`, no dentro de Spensiv.

Por qué: tu visión es explícitamente multi-proyecto (Argos + Spensiv + futuros) y agnóstica de modelo. Si el orquestador y la memoria viven dentro de Spensiv, lo atás a un proyecto y contradecís tu propio principio del "activo estratégico". `augusto-os` contendría:

```
augusto-os/
  system/
    VISION.md            # estratégico: PO, no coordinador; Argos/Spensiv son vehículos
    OPERATING_MODEL.md   # operativo: loops, roles, memoria, estados, tokens
    OPERATOR_STATE.yaml  # dinámico: mode actual, lo cambiás del celular
    ROADMAP.md / BACKLOG.md / DECISIONS.md / PROGRESS.md
  orchestrator/          # el loop (migrado del actual)
  targets/               # punteros a los repos: spensiv, argos
```

Esto es lo que el otro asesor también sugirió y coincido. Confirmame esto y el plan se ancla ahí.

## E. Lo que NO voy a hacer

No construyo hoy: master loop, 10 agentes, worktrees, backlog autónomo, scheduler nocturno. Tus proyectos todavía son chicos y eso sería infra para infra. La secuencia es: **arreglar Fase 0 → probar que el copy/paste desapareció → recién entonces capas de memoria y estados.** No escribo una línea hasta que apruebes este plan y la decisión de la sección D.
